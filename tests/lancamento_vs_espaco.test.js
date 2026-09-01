/*
LANÇAMENTO (through ball) NÃO É PASSE NO ESPAÇO.

Relato: *"o through não está fazendo sentido, está saindo um passe de 10 metros.
O through não é um lançamento longo que passa entre adversários? Diferente do
pass into space, que é um passe na frente que não passa entre adversários"*.

Estava tudo misturado: o `aplicarMiraDoPasse` marcava `isThroughBall` para
QUALQUER passe do tipo SPACE/LEADING, e com isso um passe de 10 m aparecia como
THROUGH no ecrã e ia buscar a balística do lançamento.

Agora são dois:

    LANÇAMENTO      bola longa (>= PassModel.distMinLonga) que sai POR ENTRE
                    dois adversários e cai nas costas da linha
    PASSE NO ESPAÇO bola à frente, para espaço LIVRE, que não passa entre
                    ninguém

Medido em 12 minutos de física, depois da separação:

    lançamentos       15   comprimento médio 45,0 m   mínimo 35,6 m
    passes no espaço 105   comprimento médio 14,1 m   mínimo  0,6 m

Corre com: node --test tests/lancamento_vs_espaco.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcBt = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));
const srcPlayer = semCR(fs.readFileSync(path.join(raiz, 'js', 'player.js'), 'utf8'));
const srcFsm = semCR(fs.readFileSync(path.join(raiz, 'js', 'fsm.js'), 'utf8'));
const srcCfg = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'passing.js'), 'utf8'));

function extrairFuncao(src, nome) {
    const ini = src.indexOf(`function ${nome}(`);
    if (ini < 0) throw new Error(`${nome} não encontrada`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}
const passaEntreAdversarios = new Function(
    extrairFuncao(srcUtils, 'passaEntreAdversarios') + '; return passaEntreAdversarios;')();

const LARG = 7.0, VAO = 13.0;   // os do config; verificados noutro caso

test('passa entre dois adversários, um de cada lado', () => {
    // Linha de (0,0) a (0,30); um defesa em x=-4 e outro em x=+5, a meio.
    const advs = [{ x: -4, z: 15 }, { x: 5, z: 16 }];
    assert.strictEqual(
        passaEntreAdversarios(0, 0, 0, 30, advs, LARG, VAO), true);
});

test('com adversários só de um lado, não é lançamento', () => {
    const advs = [{ x: -4, z: 12 }, { x: -6, z: 18 }];
    assert.strictEqual(
        passaEntreAdversarios(0, 0, 0, 30, advs, LARG, VAO), false,
        'passar AO LADO de dois defesas não é rasgar a linha');
});

test('vão largo de mais é campo aberto, não um corredor', () => {
    const advs = [{ x: -9, z: 15 }, { x: 9, z: 15 }];
    assert.strictEqual(
        passaEntreAdversarios(0, 0, 0, 30, advs, 12.0, VAO), false,
        `18 m entre dois homens não é um vão (o tecto é ${VAO} m)`);
});

test('adversários fora do segmento não contam', () => {
    // Um atrás de quem passa, outro para lá do alvo.
    const advs = [{ x: -3, z: -5 }, { x: 3, z: 40 }];
    assert.strictEqual(
        passaEntreAdversarios(0, 0, 0, 30, advs, LARG, VAO), false);
});

test('a linha pode ir em qualquer direcção', () => {
    // Mesma geometria, rodada 90°: de (0,0) para (30,0).
    const advs = [{ x: 15, z: -4 }, { x: 16, z: 5 }];
    assert.strictEqual(
        passaEntreAdversarios(0, 0, 30, 0, advs, LARG, VAO), true);
});

test('as constantes do vão estão no config', () => {
    const larg = parseFloat(/throughBallCorredorLargura:\s*([\d.]+)/.exec(srcCfg)[1]);
    const vao = parseFloat(/throughBallVaoMax:\s*([\d.]+)/.exec(srcCfg)[1]);
    assert.ok(larg > 3 && larg < 12, `corredor de ${larg} m: fora do que ladeia um passe`);
    assert.ok(vao > 6 && vao < 20, `vão de ${vao} m: fora do que é um corredor entre dois homens`);
    assert.ok(/distMinLonga:\s*30/.test(srcCfg),
        'o comprimento mínimo do lançamento saiu do config');
});

test('o findThroughBall exige o vão entre adversários', () => {
    const ini = srcBt.indexOf('function findThroughBall(');
    const corpo = srcBt.slice(ini, srcBt.indexOf(LF + '}' + LF, ini));
    assert.ok(corpo.includes('passaEntreAdversarios'),
        'o lançamento voltou a ser qualquer bola para o espaço');
    assert.ok(corpo.includes('PassModel.distMinLonga'),
        'o lançamento deixou de ter comprimento mínimo');
});

test('o passe no espaço já não se marca como lançamento', () => {
    const ini = srcBt.indexOf('function aplicarMiraDoPasse(');
    const corpo = srcBt.slice(ini, srcBt.indexOf(LF + '}' + LF, ini));
    assert.ok(corpo.includes('p.isPasseEspaco = true'),
        'o passe no espaço volta a acender a marca do lançamento');
    assert.ok(!/p\.isThroughBall = true/.test(corpo),
        'ainda lá está o `isThroughBall` no passe no espaço');
});

test('as duas marcas partilham a balística, mas não o nome', () => {
    assert.ok(srcFsm.includes('(p.isThroughBall || p.isPasseEspaco) && p.throughBallTarget'),
        'o executePassGameplay deixou de tratar o passe no espaço, ou voltou a confundi-los');
    assert.ok(srcFsm.includes('ehLancamento = !!p.isThroughBall'),
        'as estatísticas voltaram a contar passes no espaço como lançamentos');
    assert.ok(srcPlayer.includes("this.showActionBanner('SPACE')"),
        'o passe no espaço não tem etiqueta própria no ecrã');
});

test('o golo tem o som do estádio', () => {
    const srcSom = semCR(fs.readFileSync(path.join(raiz, 'js', 'efeitos_sonoros.js'), 'utf8'));
    const srcFis = semCR(fs.readFileSync(path.join(raiz, 'js', 'match', 'match_physics.js'), 'utf8'));
    assert.ok(srcSom.includes('Soccer_Crowd_Cheerin.mp3'),
        'a amostra da bancada saiu do EfeitosSonoros');
    assert.ok(/golo\(\)\s*\{/.test(srcSom), 'não há forma de tocar o som do golo');
    assert.ok(srcFis.includes('EfeitosSonoros.golo()'),
        'o golo já não toca o som da bancada');
    assert.ok(fs.existsSync(path.join(raiz, 'assets', 'Soccer_Crowd_Cheerin.mp3')),
        'o ficheiro de som desapareceu do assets/');
});
