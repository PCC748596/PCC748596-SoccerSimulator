/*
O PÉ ENCOSTA NO RELVADO.

Relato: "alguns jogadores não estão encostando no chão".

A altura do corpo é fixa (`ALTURA_BASE_Y`) e a pose é que dobra as pernas: cada
grau de anca ou de joelho levanta a sola sem nada a compensar. Medido em jogo,
pela caixa do modelo (a sola, não o tornozelo), com o jogador PARADO:

    MOVE_TO_POS      0.04 m de média no ar, 0.11 no pior caso
    SET_PIECE_WAIT   0.05                   0.24
    IDLE             0.01                   0.21
    BLOCKING        -0.05 (enterrado)

Depois do `assentarNoChao`: 0.00, 0.04, -0.02, 0.01.

O teste monta o corpo REAL (`construirCorpo`, js/pose.js) e corre o
`assentarNoChao` de produção, extraído do player.js, sobre poses com o joelho
dobrado. O que se exige é o que o relato pede — a bota no chão — mais as três
excepções que não podem ser assentadas: a corrida (tem fase de voo), o salto e
o carrinho, que escrevem a altura eles próprios.

Corre com: node tests/assento_no_chao.test.js
*/
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

let falhas = 0;
const erro = m => { falhas++; console.log('  X ' + m); };
const ok = m => console.log('  . ' + m);

// Canvas de mentira: o construirCorpo desenha a camisola numa textura.
const contexto2d = new Proxy({}, { get: () => () => { }, set: () => true });
const documentoFalso = {
    createElement: () => ({ width: 0, height: 0, getContext: () => contexto2d })
};

const amb = { THREE, console, document: documentoFalso, window: {} };
const mod = new Function(...Object.keys(amb),
    ler('js/utils.js') + LF + ler('js/config/animations.js') + LF +
    ler('js/config/gait.js') + LF + ler('js/config/player_behavior.js') + LF +
    ler('js/pose.js') + LF +
    'return { construirCorpo, escolherAparencia, AssentoNoChao };')(...Object.values(amb));
const { construirCorpo, escolherAparencia, AssentoNoChao } = mod;

// O método de produção, tirado do player.js: o teste não corre uma cópia.
const srcPlayer = ler('js/player.js');
function extrairMetodo(nome) {
    const cabeca = '    ' + nome + '() {';
    const ini = srcPlayer.indexOf(cabeca);
    if (ini < 0) throw new Error(nome + ' não encontrado em player.js');
    const fim = srcPlayer.indexOf(LF + '    }', ini);
    return srcPlayer.slice(ini + cabeca.length, fim);
}
const _p_v3 = new THREE.Vector3();
const assentarNoChao = new Function('THREE', 'AssentoNoChao', '_p_v3',
    'return function () {' + extrairMetodo('assentarNoChao') + '};')(THREE, AssentoNoChao, _p_v3);

const ALTURA_BASE_Y = -0.03;

function jogador(cfg) {
    const o = cfg || {};
    const aparencia = escolherAparencia(0);
    const corpo = construirCorpo(0x1e5fbf, 0xffffff, aparencia);
    const model = corpo.corpo;
    const rig = corpo.rig;
    model.position.set(0, ALTURA_BASE_Y, 0);

    if (typeof o.joelho === 'number') {
        rig.lKnee.rotation.x = o.joelho; rig.rKnee.rotation.x = o.joelho;
    }
    if (typeof o.anca === 'number') {
        rig.lLeg.rotation.x = o.anca; rig.rLeg.rotation.x = o.anca;
    }
    model.updateMatrixWorld(true);

    return {
        model: model, rig: rig,
        role: o.role || 'cf',
        jumpTimer: o.jumpTimer || 0,
        peitoHopTimer: 0,
        gkEstado: 'idle',
        fsm: { currentState: o.estado || 'MOVE_TO_POS' },
        velocity: new THREE.Vector3(0, 0, (o.velocidade === undefined) ? 0 : o.velocidade),
        assentarNoChao: assentarNoChao
    };
}

// A sola: o ponto mais baixo das duas botas, no mundo.
function alturaDaSola(p) {
    p.model.updateMatrixWorld(true);
    let min = Infinity;
    for (const bota of [p.rig.lBota, p.rig.rBota]) {
        const caixa = new THREE.Box3().setFromObject(bota);
        min = Math.min(min, caixa.min.y);
    }
    return min;
}

// A correcção entra por fracção (AssentoNoChao.suavizacao): deixa-se convergir.
function assentarAte(p, frames) {
    for (let i = 0; i < (frames || 60); i++) {
        p.assentarNoChao();
        p.model.updateMatrixWorld(true);
    }
}

console.log(LF + '1 — o config existe e é sóbrio');
{
    if (!AssentoNoChao) {
        erro('AssentoNoChao desapareceu do config');
    } else {
        if (!(AssentoNoChao.velMax > 0 && AssentoNoChao.velMax <= 6)) {
            erro('velMax de ' + AssentoNoChao.velMax + ': acima do trote a passada tem fase de voo');
        } else ok('a correcção pára antes da corrida (velMax ' + AssentoNoChao.velMax + ' m/s)');

        if (!(AssentoNoChao.suavizacao > 0 && AssentoNoChao.suavizacao <= 1)) {
            erro('suavizacao fora de 0..1');
        } else ok('a correcção entra por fracção, não de um salto');
    }
}

console.log(LF + '2 — o joelho dobrado deixa de levantar a sola');
{
    const p = jogador({ joelho: 0.6 });
    // O corpo a uma altura fixa enquanto a pose dobra o joelho: e este o caso
    // do relato — o boneco de pe, com a sola no ar.
    p.model.position.y = ALTURA_BASE_Y + 0.15;
    p.model.updateMatrixWorld(true);
    const antes = alturaDaSola(p);
    assentarAte(p);
    const depois = alturaDaSola(p);
    console.log('  sola antes ' + antes.toFixed(3) + ' m, depois ' + depois.toFixed(3) + ' m');
    if (!(antes > 0.03)) {
        erro('o cenário não reproduz o defeito: a sola já estava no chão');
    } else if (Math.abs(depois) > 0.02) {
        erro('a sola ficou a ' + depois.toFixed(3) + ' m do relvado');
    } else ok('com o joelho dobrado, a bota acaba no chão');
}

console.log(LF + '3 — e sobe quem está enterrado');
{
    const p = jogador({});
    p.model.position.y = ALTURA_BASE_Y - 0.20;   // meio palmo dentro do relvado
    p.model.updateMatrixWorld(true);
    const antes = alturaDaSola(p);
    assentarAte(p);
    const depois = alturaDaSola(p);
    if (!(antes < -0.05)) {
        erro('o cenário não reproduz o enterrado');
    } else if (Math.abs(depois) > 0.02) {
        erro('a sola ficou a ' + depois.toFixed(3) + ' m do relvado');
    } else ok('quem está enterrado sobe até encostar');
}

console.log(LF + '4 — o que escreve a própria altura não é assentado');
{
    const casos = [
        ['a correr (fase de voo)', { joelho: 0.6, velocidade: 7.0 }],
        ['a saltar', { joelho: 0.6, jumpTimer: 0.3 }],
        ['num carrinho', { joelho: 0.6, estado: 'SLIDE_TACKLE' }]
    ];
    for (let i = 0; i < casos.length; i++) {
        const nome = casos[i][0];
        const p = jogador(casos[i][1]);
        const antes = p.model.position.y;
        assentarAte(p, 10);
        if (Math.abs(p.model.position.y - antes) > 1e-9) {
            erro(nome + ': a altura foi mexida, e esse estado escreve-a ele próprio');
        } else ok(nome + ': altura intacta');
    }
}

console.log(LF + '5 — a correcção tem tecto');
{
    const p = jogador({});
    p.model.position.y = ALTURA_BASE_Y + 5.0;    // cinco metros no ar
    p.model.updateMatrixWorld(true);
    const antes = p.model.position.y;
    p.assentarNoChao();
    const passo = Math.abs(p.model.position.y - antes);
    const tecto = AssentoNoChao.correccaoMax * AssentoNoChao.suavizacao + 1e-9;
    if (passo > tecto) {
        erro('corrigiu ' + passo.toFixed(2) + ' m num frame (tecto ' + tecto.toFixed(2) + ')');
    } else ok('uma pose absurda não teleporta o boneco');
}

console.log(LF + '6 — o animateBones chama-o depois de escrever a pose');
{
    const i = srcPlayer.indexOf('animateBones(dt) {');
    const j = srcPlayer.indexOf('this.assentarNoChao();', i);
    const k = srcPlayer.indexOf('ALTURA_BASE_Y + P.ressalto', i);
    if (j < 0) erro('o animateBones deixou de assentar o jogador no chão');
    else if (!(j > k)) erro('o assento corre ANTES de a passada escrever a altura');
    else ok('assenta-se depois de a pose estar escrita');
}

if (falhas) { console.log(LF + falhas + ' problema(s).'); process.exit(1); }
console.log(LF + 'Assento no chão: todos os cenários passaram.');
