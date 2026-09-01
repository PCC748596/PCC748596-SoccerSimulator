/*
A MARCAÇÃO DO CANTO TEM DE SOBREVIVER À BATIDA — e o duelo aéreo.

O `setupSetPiece` montava um canto com marcação individual (dez slots de defesa
emparelhados com os do ataque) que durava exactamente até a bola sair do pé: o
`case 'SET_PIECE_TAKER'` largava toda a gente para `MOVE_TO_POS` e o bloco
táctico retomava o comando. Como o bloco segue a bola, e a bola está na
bandeirola de canto, os defensores eram puxados para FORA da própria área com o
cruzamento ainda no ar.

Medido em 40 cantos, defensores dentro da grande área:

    no cruzamento  8.1 de 10  ->  8.0
    +2.0 s         4.4        ->  7.9
    +4.0 s         0.8        ->  4.8

E a disputa aérea não existia: um saltava, o marcador ficava a ver. Zero cantos
com dois adversários no ar. Depois: 40 em 60. Golos por canto: 36/60 -> 10/60.

Ferramenta: tools/headless/canto_lote.js

Corre com: node --test tests/canto_marcacao.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const src = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcDef = src('js/config/defense.js');
const srcSet = src('js/match/match_setpieces.js');
const srcLoop = src('js/match/match_loop.js');
const srcFsm = src('js/fsm.js');
const srcBt = src('js/bt/player_bt.js');
const srcPlayer = src('js/player.js');

function extrairObjecto(s, nome) {
    const ini = s.indexOf(`const ${nome} = {`);
    assert.ok(ini > 0, `${nome} não encontrado`);
    const fim = s.indexOf(LF + '};', ini);
    return new Function(`${s.slice(ini, fim + 3)}; return ${nome};`)();
}

const C = extrairObjecto(srcDef, 'CornerDefenseModel');

test('o modelo da marcação de canto tem valores utilizáveis', () => {
    assert.ok(C.distanciaAoHomem > 0.5 && C.distanciaAoHomem < 3.0,
        `distanciaAoHomem de ${C.distanciaAoHomem} m não é marcar um homem`);
    assert.ok(C.prazo >= 4.0 && C.prazo <= 20.0, 'o prazo do lance saiu do razoável');
    assert.ok(C.raioContestacao > C.distanciaAoHomem,
        'o raio de contestação tem de ser maior do que a colagem, senão nunca se larga o homem');
    assert.ok(C.alturaContestacao > 0.8,
        'contestar bola rasteira no ar não faz sentido');
});

test('o setup emparelha cada marcador com o seu homem', () => {
    assert.ok(/p\.marcaNoCanto = attackersInBox\[/.test(srcSet),
        'os marcadores deixaram de ficar emparelhados com os atacantes no setup');
    assert.ok(/marcaNoCanto = null/.test(srcSet),
        'um canto novo herda os pares do anterior se ninguém os limpar');
});

test('a batida marca o lance como vivo em vez de largar toda a gente', () => {
    const ini = srcFsm.indexOf("case 'SET_PIECE_TAKER':");
    const ramo = srcFsm.slice(ini, ini + 7000);
    assert.ok(/Match\.cantoVivo = \{/.test(ramo),
        'a batida voltou a largar os marcadores: o bloco retoma o comando e a área esvazia-se');
});

test('o lance vivo expira, e não expira no primeiro frame', () => {
    const ini = srcLoop.indexOf('if (this.cantoVivo) {');
    assert.ok(ini > 0, 'o ramo do canto vivo desapareceu do Match.update');
    const ramo = srcLoop.slice(ini, ini + 2200);
    assert.ok(/cantoVivo\.timer >/.test(ramo), 'o lance ficou sem prazo');
    assert.ok(/entrou/.test(ramo),
        'sem memória de a bola ter ENTRADO na área, a saída dispara no primeiro frame — a bola começa na bandeirola, fora da área');
});

test('o ramo da marcação corre antes do resto da árvore', () => {
    assert.ok(/function tratarMarcacaoNoCanto/.test(srcBt), 'tratarMarcacaoNoCanto desapareceu');
    const ini = srcBt.indexOf('tick: function (player, dt)');
    const topo = srcBt.slice(ini, ini + 3000);
    // O `return` passou a fechar o alvo antes de sair (resolvedor de alvos).
    assert.ok(/if \(tratarMarcacaoNoCanto\(player\)\) \{? ?(fechar\(\); )?return;/.test(topo),
        'a marcação do canto deixou de ter prioridade sobre o bloco e os estilos');

    const corpo = srcBt.slice(srcBt.indexOf('function tratarMarcacaoNoCanto'));
    assert.ok(/raioContestacao/.test(corpo.slice(0, 3500)),
        'sem o modo "à bola" o marcador fica colado ao homem e o atacante salta sozinho — não há duelo');
});

test('a decisão de saltar não vive dentro da animação', () => {
    /*
    Enquanto o gatilho estava no `animateBones` — que só corre com renderer —
    não havia um único salto nem um único cabeceio em toda a simulação em lote.
    */
    assert.ok(/avaliarSaltoDeCabeceio\(dt\)/.test(srcPlayer),
        'o avaliarSaltoDeCabeceio desapareceu');

    const iniA = srcPlayer.indexOf('    animateBones(dt) {');
    const anim = srcPlayer.slice(iniA, srcPlayer.indexOf('construirCorpo', iniA));
    assert.ok(!/this\.jumpTimer = S\.duracao/.test(anim),
        'a decisão de saltar voltou para dentro do animateBones: sem renderer não há jogo aéreo nenhum');

    const iniM = srcPlayer.indexOf('    avaliarSaltoDeCabeceio(dt) {');
    const metodo = srcPlayer.slice(iniM, srcPlayer.indexOf('    steerArrive(', iniM));
    assert.ok(/this\.jumpTimer = S\.duracao/.test(metodo),
        'o gatilho do salto não está no avaliarSaltoDeCabeceio');
    assert.ok(/this\.model\.position\.y = ALTURA_BASE_Y \+ this\.jumpAltura/.test(metodo),
        'sem o corpo a subir fora da animação, o contacto na testa nunca acontece em headless');
});
