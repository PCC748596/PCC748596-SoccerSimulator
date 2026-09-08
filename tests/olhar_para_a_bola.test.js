/*
A CABEÇA BAIXA PARA A BOLA.

Relato: "tem uns jogadores meio que olhando pra cima, sendo que a bola está em
baixo".

O `lookAtBola` (utils.js) vira o CORPO para a bola e é giro puro — achata o Y de
propósito, senão o boneco deitava. Faltava a outra metade: a inclinação da
cabeça. O pescoço ficava a ZERO em todos os estados de jogo (média medida de
0.003 a 0.008 rad); só o cabeceio e os clips de bola parada lhe mexiam.

Medido em jogo, pelo ângulo entre o olhar e a direcção à bola:

    distância à bola   ângulo ATÉ à bola   olhar   erro
    0-3 m                       -46.4°      -6.7°   +39.6°   <- o do relato
    3-8 m                        -9.9       -2.7     +7.2
    8-15 m                       -4.8       -1.4     +3.4

Depois do `olharParaBola`: +5.1°, +1.0°, -0.9°.

O teste monta o corpo REAL (`construirCorpo`, js/pose.js) e corre o
`olharParaBola` de produção, extraído do player.js.

Corre com: node tests/olhar_para_a_bola.test.js
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

const contexto2d = new Proxy({}, { get: () => () => { }, set: () => true });
const documentoFalso = {
    createElement: () => ({ width: 0, height: 0, getContext: () => contexto2d })
};

const amb = { THREE, console, document: documentoFalso, window: {} };
const mod = new Function(...Object.keys(amb),
    ler('js/utils.js') + LF + ler('js/config/animations.js') + LF +
    ler('js/config/gait.js') + LF + ler('js/config/player_behavior.js') + LF +
    ler('js/pose.js') + LF +
    'return { construirCorpo, escolherAparencia, OlharParaBola, lerpTo };')(...Object.values(amb));
const { construirCorpo, escolherAparencia, OlharParaBola, lerpTo } = mod;

// O método de produção, tirado do player.js.
const srcPlayer = ler('js/player.js');
function extrairMetodo(nome) {
    const cabeca = '    ' + nome + '() {';
    const ini = srcPlayer.indexOf(cabeca);
    if (ini < 0) throw new Error(nome + ' não encontrado em player.js');
    const fim = srcPlayer.indexOf(LF + '    }', ini);
    return srcPlayer.slice(ini + cabeca.length, fim);
}

const Match = { ball: { position: new THREE.Vector3(0, 0.11, 0) } };
const _p_v3 = new THREE.Vector3(), _p_v3b = new THREE.Vector3();
const _p_q = new THREE.Quaternion();
const olharParaBola = new Function('THREE', 'OlharParaBola', 'Match', 'lerpTo', '_p_v3', '_p_v3b', '_p_q',
    'return function () {' + extrairMetodo('olharParaBola') + '};')(
        THREE, OlharParaBola, Match, lerpTo, _p_v3, _p_v3b, _p_q);

const ALTURA_BASE_Y = -0.03;

function jogador(cfg) {
    const o = cfg || {};
    const corpo = construirCorpo(0x1e5fbf, 0xffffff, escolherAparencia(0));
    const model = corpo.corpo;
    const rig = corpo.rig;
    model.position.set(0, ALTURA_BASE_Y, (o.z === undefined) ? 0 : o.z);
    // O tronco inclinado da passada: a correcção tem de contar com ele.
    if (typeof o.tronco === 'number') rig.chest.rotation.x = o.tronco;
    model.updateMatrixWorld(true);
    return {
        model: model, rig: rig,
        role: o.role || 'cf',
        jumpTimer: o.jumpTimer || 0,
        fsm: { currentState: o.estado || 'MOVE_TO_POS' },
        olharParaBola: olharParaBola
    };
}

// Para onde a cabeça aponta, em graus (+ = para cima).
function olharEmGraus(p) {
    p.model.updateMatrixWorld(true);
    p.rig.neck.getWorldQuaternion(_p_q);
    _p_v3b.set(0, 0, 1).applyQuaternion(_p_q);
    return Math.asin(THREE.MathUtils.clamp(_p_v3b.y, -1, 1)) * 180 / Math.PI;
}

// Onde está a bola, em graus a partir da cabeça (+ = acima).
function bolaEmGraus(p) {
    p.model.updateMatrixWorld(true);
    p.rig.neck.getWorldPosition(_p_v3);
    const dx = Match.ball.position.x - _p_v3.x;
    const dy = Match.ball.position.y - _p_v3.y;
    const dz = Match.ball.position.z - _p_v3.z;
    return Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI;
}

function correr(p, frames) {
    for (let i = 0; i < (frames || 60); i++) { p.olharParaBola(); p.model.updateMatrixWorld(true); }
}

console.log(LF + '1 — o config existe e respeita o pescoço');
{
    if (!OlharParaBola) erro('OlharParaBola desapareceu do config');
    else {
        const limiteBaixar = 50 * Math.PI / 180;   // JointLimits.neck.x
        if (!(OlharParaBola.baixarMax > 0 && OlharParaBola.baixarMax <= limiteBaixar + 1e-9)) {
            erro('baixarMax fora do limite anatómico do pescoço');
        } else ok('a cabeça baixa até ao limite do pescoço, não além');
        if (!(OlharParaBola.distMax > 0)) erro('distMax tem de ser positivo');
        else ok('há um raio a partir do qual a cabeça volta ao horizonte');
    }
}

console.log(LF + '2 — com a bola aos pés a cabeça baixa');
{
    Match.ball.position.set(0, 0.11, 2.0);
    const p = jogador({});
    const antes = olharEmGraus(p);
    const alvo = bolaEmGraus(p);
    correr(p);
    const depois = olharEmGraus(p);
    console.log('  bola a ' + alvo.toFixed(1) + '°, olhar antes ' + antes.toFixed(1) +
        '°, depois ' + depois.toFixed(1) + '°');
    if (!(alvo < -25)) {
        erro('o cenário não reproduz o relato: a bola tinha de estar bem abaixo');
    } else if (Math.abs(antes - alvo) < 15) {
        erro('o cenário não reproduz o defeito: a cabeça já apontava para a bola');
    } else if (Math.abs(depois - alvo) > 3) {
        erro('a cabeça ficou a ' + (depois - alvo).toFixed(1) + '° da bola');
    } else ok('a cabeça acaba a apontar para a bola');
}

console.log(LF + '3 — e conta com o tronco já inclinado');
{
    // A passada inclina o tronco; o pescoço herda-o. Sem descontar essa parte,
    // a correcção somava duas vezes.
    Match.ball.position.set(0, 0.11, 2.0);
    const p = jogador({ tronco: 0.30 });
    correr(p);
    const alvo = bolaEmGraus(p);
    const depois = olharEmGraus(p);
    if (Math.abs(depois - alvo) > 3) {
        erro('com o tronco inclinado a cabeça ficou a ' + (depois - alvo).toFixed(1) + '° da bola');
    } else ok('a inclinação do tronco não é somada duas vezes');
}

console.log(LF + '4 — longe, a cabeça volta ao horizonte');
{
    Match.ball.position.set(0, 0.11, OlharParaBola.distMax + 20);
    const p = jogador({});
    p.rig.neck.rotation.x = 0.6;      // vinha de olhar para o chão
    correr(p);
    if (Math.abs(p.rig.neck.rotation.x) > 0.05) {
        erro('ficou com o pescoço a ' + p.rig.neck.rotation.x.toFixed(2) + ' rad com a bola longe');
    } else ok('fora do raio a cabeça fica ao nível do horizonte');
}

console.log(LF + '5 — quem tem a cabeça escrita à mão não é mexido');
{
    Match.ball.position.set(0, 0.11, 2.0);
    const casos = [
        ['guarda-redes', { role: 'gk' }],
        ['a saltar (cabeceio)', { jumpTimer: 0.3 }],
        ['a rematar', { estado: 'SHOOT' }],
        ['no lançamento lateral', { estado: 'LATERAL' }],
        ['a matar no peito', { estado: 'CHEST_CONTROL' }]
    ];
    for (let i = 0; i < casos.length; i++) {
        const p = jogador(casos[i][1]);
        p.rig.neck.rotation.x = 0.12;
        correr(p, 10);
        if (Math.abs(p.rig.neck.rotation.x - 0.12) > 1e-9) {
            erro(casos[i][0] + ': o pescoço foi mexido por cima do gesto');
        } else ok(casos[i][0] + ': pescoço intacto');
    }
}

console.log(LF + '6 — o animateBones chama-o');
{
    const i = srcPlayer.indexOf('animateBones(dt) {');
    const j = srcPlayer.indexOf('this.olharParaBola();', i);
    if (j < 0) erro('o animateBones deixou de virar a cabeça para a bola');
    else ok('a cabeça é corrigida em cada frame desenhado');
}

if (falhas) { console.log(LF + falhas + ' problema(s).'); process.exit(1); }
console.log(LF + 'Olhar para a bola: todos os cenários passaram.');
