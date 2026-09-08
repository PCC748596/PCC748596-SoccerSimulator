/*
O ALÍVIO SAI PELA LINHA DE FUNDO QUANDO É ELA A SAÍDA.

Medido num lote de 30 jogos: 0.84 escanteios por jogo contra os 9.92 de um jogo
a sério, e `afastamentos` a ZERO nos 60 registos. O `actClearance` chutava
SEMPRE para a lateral e para a FRENTE (`z + dirZ * 12`), mesmo com o defensor
encostado à própria linha de fundo — o `ClearanceModel` existia no config e não
era lido por ninguém.

Corre com: node --test tests/alivio_pela_linha_de_fundo.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcDef = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'defense.js'), 'utf8'));
const srcBT = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));

const CAMPO_COMP = 106, CAMPO_LARG = 68, LINHA_FUNDO = CAMPO_COMP / 2;

function extrairObjecto(src, nome, extras) {
    const ini = src.indexOf(`const ${nome} = {`);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    const nomes = Object.keys(extras || {});
    return new Function(...nomes, `${src.slice(ini, fim + 3)}; return ${nome};`)
        (...nomes.map(n => extras[n]));
}
function extrairFuncao(src, nome) {
    const ini = src.indexOf(`function ${nome}(`);
    if (ini < 0) throw new Error(`${nome} não encontrada`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const ClearanceModel = extrairObjecto(srcDef, 'ClearanceModel', { CAMPO_COMP, CAMPO_LARG, Math });
const stubs = { CAMPO_COMP, CAMPO_LARG, LINHA_FUNDO, Math };
const alvoDeAlivio = new Function(...Object.keys(stubs),
    extrairFuncao(srcUtils, 'alvoDeAlivio') + '; return alvoDeAlivio;')(...Object.values(stubs));

// Ataca para +Z: a própria linha de fundo é a de z = -53.
const dirZ = 1, fundoProprio = -LINHA_FUNDO;

test('os três números do alívio vivem no config', () => {
    for (const k of ['zonaPerigo', 'preferirFundo', 'fundoMax']) {
        assert.strictEqual(typeof ClearanceModel[k], 'number', `${k} em falta`);
    }
    assert.ok(ClearanceModel.preferirFundo > 1.0,
        'sem preferência, a lateral ganha quase sempre — e foi isso que deu 0 afastamentos');
});

test('encostado à própria linha de fundo, sai por ela', () => {
    // 6 m da linha de fundo, no meio do campo em largura: a lateral está a 34 m.
    const a = alvoDeAlivio(0, fundoProprio + 6, dirZ, ClearanceModel);
    assert.strictEqual(a.fundo, true, 'dali a saída é o canto, não a lateral');
    assert.ok(Math.abs(a.z) > LINHA_FUNDO, 'o alvo tem de estar PARA LÁ da linha de fundo');
});

test('no meio-campo, continua a sair pela lateral e para a frente', () => {
    const a = alvoDeAlivio(0, 0, dirZ, ClearanceModel);
    assert.strictEqual(a.fundo, false);
    assert.ok(Math.abs(a.x) > CAMPO_LARG / 2, 'o alvo da lateral fica fora do campo');
    assert.ok(a.z > 0, 'e para a frente: aliviar do meio-campo não é conceder um canto');
});

test('encostado à lateral, sai pela lateral mesmo dentro da área', () => {
    const perto = CAMPO_LARG / 2 - 2;
    const a = alvoDeAlivio(perto, fundoProprio + 8, dirZ, ClearanceModel);
    assert.strictEqual(a.fundo, false, 'com a lateral a 2 m, é ela a saída mais perto');
});

test('fora do fundoMax é sempre lateral, mesmo no eixo', () => {
    const a = alvoDeAlivio(0, fundoProprio + ClearanceModel.fundoMax + 5, dirZ, ClearanceModel);
    assert.strictEqual(a.fundo, false);
});

test('funciona a atacar para -Z', () => {
    const a = alvoDeAlivio(0, LINHA_FUNDO - 6, -1, ClearanceModel);
    assert.strictEqual(a.fundo, true);
    assert.ok(a.z > LINHA_FUNDO, 'a própria linha de fundo é a de +Z quando se ataca para -Z');
});

test('o actClearance usa a função e conta o afastamento', () => {
    const corpo = extrairFuncao(srcBT, 'actClearance');
    assert.ok(corpo.includes('alvoDeAlivio'),
        'o alívio voltou a calcular o alvo à mão — e a mandar sempre para a lateral');
    assert.ok(corpo.includes('registarAfastamento'),
        'sem isto o contador de afastamentos fica a zero, como estava');
    assert.ok(!/const alvoZ = p\.model\.position\.z \+ p\.dirZ \* 12\.0;/.test(corpo),
        'ainda lá está o alvo fixo 12 m à frente');
});

/*
E NO TERÇO OFENSIVO NÃO SE ALIVIA.

Relato: "os pontas estão recebendo a bola, indo até a linha de fundo e chutando
para o lado oposto ao gol". O ramo `ChuteLateral` dispara para QUALQUER jogador
sob pressão sem passe, e o `alvoDeAlivio` de quem está encostado à linha de
fundo ADVERSÁRIA devolve a lateral mais 12 m para a frente — um alvo para lá da
linha. Aliviar é sair do PRÓPRIO perigo; à frente não há perigo nenhum.
*/
test('da linha de fundo adversária o alvo do alívio sai do campo', () => {
    // Ponta do TeamA (ataca para +Z) encostado à linha de fundo adversária.
    const a = alvoDeAlivio(-30, 50, 1, ClearanceModel);
    assert.ok(a.z > LINHA_FUNDO,
        'o cenário do relato tem de reproduzir o alvo fora do campo');
});

test('o ramo do chute para a lateral não dispara no terço ofensivo', () => {
    assert.strictEqual(typeof ClearanceModel.avancoMaxParaAlivio, 'number',
        'sem o limite de campo o ponta volta a mandar a bola fora');
    assert.ok(ClearanceModel.avancoMaxParaAlivio < LINHA_FUNDO / 2,
        'o limite tem de ficar bem aquém do terço ofensivo');

    const ini = srcBT.indexOf("seq('ChuteLateral'");
    assert.ok(ini > 0, 'o ramo ChuteLateral desapareceu');
    const corpo = srcBT.slice(ini, ini + 2200);
    assert.ok(corpo.includes('avancoMaxParaAlivio'),
        'o ramo deixou de olhar para a posição no campo');
    assert.ok(corpo.includes('avanco > CA.avancoMaxParaAlivio) return false'),
        'a guarda tem de DESISTIR do ramo, não escolher outro alvo');
});

test('o alívio de perigo continua a ser só de quem defende, na sua zona', () => {
    const ini = srcBT.indexOf("seq('AlivioDePerigo'");
    assert.ok(ini > 0, 'o ramo do alívio imediato desapareceu');
    const corpo = srcBT.slice(ini, ini + 900);
    assert.ok(corpo.includes("ctx.p.role !== 'def'"),
        'este ramo é de defesas e guarda-redes: um avançado não alivia');
    assert.ok(corpo.includes('distanciaAoProprioFundo'),
        'e é medido à PRÓPRIA linha de fundo');
});
