/*
A CABEÇA NÃO APONTA PARA CIMA SEM NADA LÁ ESTAR.

Isto já foi mais do que é. Houve um seguimento da bola — a cabeça baixava para
ela — e foi revertido a pedido: "agora os modelos estão todos olhando para
baixo, para a bola; não é pra fazer isso; deixa como estava antes. Só não quero
ninguém olhando pra cima sem nada a ver". Com a bola aos pés, 46 graus abaixo do
horizonte, ficava o campo inteiro de cabeça baixa.

Fica só o tecto. Medido em jogo, com o pescoço solto, 18.7% dos frames tinham o
olhar entre 2 e 7 graus ACIMA do horizonte sem nada lá em cima; com o tecto,
11.8%, e só dentro do balanço da passada.

E fica também a armadilha que a primeira versão do tecto apanhou, que é o que
este teste guarda: corrigir só quando o olhar passa do horizonte, SOMANDO a
correcção ao pescoço, faz a correcção acumular-se — a passada balança o tronco,
o olhar passa o horizonte em parte do ciclo, e nada desfaz o que se somou.
Medido: a cabeça acabava 13 graus abaixo em todos os estados, o oposto do
pedido. O repouso tem de ser ZERO.

Corre com: node tests/cabeca_nao_olha_para_cima.test.js
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
    'return { construirCorpo, escolherAparencia, OlharDaCabeca, lerpTo };')(...Object.values(amb));
const { construirCorpo, escolherAparencia, OlharDaCabeca, lerpTo } = mod;

// O método de produção, tirado do player.js.
const srcPlayer = ler('js/player.js');
function extrairMetodo(nome) {
    const cabeca = '    ' + nome + '() {';
    const ini = srcPlayer.indexOf(cabeca);
    if (ini < 0) throw new Error(nome + ' não encontrado em player.js');
    const fim = srcPlayer.indexOf(LF + '    }', ini);
    return srcPlayer.slice(ini + cabeca.length, fim);
}
const _p_v3b = new THREE.Vector3(), _p_q = new THREE.Quaternion();
const nivelarCabeca = new Function('THREE', 'OlharDaCabeca', 'lerpTo', '_p_v3b', '_p_q',
    'return function () {' + extrairMetodo('nivelarCabeca') + '};')(
        THREE, OlharDaCabeca, lerpTo, _p_v3b, _p_q);

const ALTURA_BASE_Y = -0.03;

function jogador(cfg) {
    const o = cfg || {};
    const corpo = construirCorpo(0x1e5fbf, 0xffffff, escolherAparencia(0));
    const model = corpo.corpo;
    const rig = corpo.rig;
    model.position.set(0, ALTURA_BASE_Y, 0);
    if (typeof o.tronco === 'number') rig.chest.rotation.x = o.tronco;
    if (typeof o.pescoco === 'number') rig.neck.rotation.x = o.pescoco;
    model.updateMatrixWorld(true);
    return {
        model: model, rig: rig,
        role: o.role || 'cf',
        jumpTimer: o.jumpTimer || 0,
        fsm: { currentState: o.estado || 'MOVE_TO_POS' },
        nivelarCabeca: nivelarCabeca
    };
}

// Para onde a cabeça aponta, em graus (+ = para cima).
function olharEmGraus(p) {
    p.model.updateMatrixWorld(true);
    p.rig.neck.getWorldQuaternion(_p_q);
    _p_v3b.set(0, 0, 1).applyQuaternion(_p_q);
    return Math.asin(THREE.MathUtils.clamp(_p_v3b.y, -1, 1)) * 180 / Math.PI;
}

function correr(p, frames) {
    for (let i = 0; i < (frames || 60); i++) { p.nivelarCabeca(); p.model.updateMatrixWorld(true); }
}

console.log(LF + '1 — o config é um tecto, não um seguidor');
{
    if (!OlharDaCabeca) {
        erro('OlharDaCabeca desapareceu do config');
    } else {
        const margemGraus = OlharDaCabeca.margemAcima * 180 / Math.PI;
        if (!(margemGraus >= 0 && margemGraus <= 10)) {
            erro('margemAcima de ' + margemGraus.toFixed(1) + '°: ou é rígido de mais, ou não é tecto nenhum');
        } else ok('há uma margem pequena acima do horizonte (' + margemGraus.toFixed(0) + '°)');
    }
    if (/OlharParaBola/.test(srcPlayer)) {
        erro('o seguimento da bola voltou ao player.js — foi revertido a pedido');
    } else ok('não há seguimento da bola no player.js');
}

console.log(LF + '2 — quem aponta para cima é baixado ao horizonte');
{
    const p = jogador({ pescoco: -0.45 });        // ~26° para cima
    const antes = olharEmGraus(p);
    correr(p);
    const depois = olharEmGraus(p);
    console.log('  olhar antes ' + antes.toFixed(1) + '°, depois ' + depois.toFixed(1) + '°');
    if (!(antes > 15)) {
        erro('o cenário não reproduz o defeito: a cabeça não estava para cima');
    } else if (depois > (OlharDaCabeca.margemAcima * 180 / Math.PI) + 1) {
        erro('continuou a olhar ' + depois.toFixed(1) + '° acima do horizonte');
    } else ok('a cabeça desce até ao horizonte');
}

console.log(LF + '3 — e NÃO baixa para a bola: o repouso é zero');
{
    /*
    A armadilha da primeira versão: sem repouso, cada frame em que o balanço da
    passada punha o olhar acima do horizonte somava correcção, e a cabeça
    acabava 13 graus abaixo. Aqui parte-se do zero, e no zero tem de ficar.
    */
    const p = jogador({});
    correr(p, 120);
    if (Math.abs(p.rig.neck.rotation.x) > 0.02) {
        erro('o pescoço saiu do repouso sozinho (' + p.rig.neck.rotation.x.toFixed(3) + ' rad)');
    } else ok('sem nada acima do horizonte, o pescoço fica onde estava');
}

console.log(LF + '4 — e volta ao repouso depois de corrigir');
{
    const p = jogador({ pescoco: -0.45 });
    correr(p, 200);
    if (p.rig.neck.rotation.x > 0.10) {
        erro('ficou de cabeça baixa (' + p.rig.neck.rotation.x.toFixed(2) + ' rad) — é a correcção a acumular');
    } else ok('depois de nivelar, não continua a descer');
}

console.log(LF + '5 — com o tronco inclinado não mexe: já está abaixo do horizonte');
{
    const p = jogador({ tronco: 0.30 });
    const antes = p.rig.neck.rotation.x;
    correr(p, 60);
    if (Math.abs(p.rig.neck.rotation.x - antes) > 0.02) {
        erro('mexeu no pescoço de quem já olhava para baixo');
    } else ok('a passada inclina o tronco e o tecto não se intromete');
}

console.log(LF + '6 — quem tem a cabeça escrita à mão não é mexido');
{
    const casos = [
        ['guarda-redes', { role: 'gk' }],
        ['a saltar (cabeceio)', { jumpTimer: 0.3 }],
        ['a rematar', { estado: 'SHOOT' }],
        ['no lançamento lateral', { estado: 'LATERAL' }],
        ['no carrinho', { estado: 'SLIDE_TACKLE' }],
        ['a matar no peito', { estado: 'CHEST_CONTROL' }]
    ];
    for (let i = 0; i < casos.length; i++) {
        const p = jogador(casos[i][1]);
        p.rig.neck.rotation.x = -0.45;      // a olhar para cima, de propósito
        correr(p, 10);
        if (Math.abs(p.rig.neck.rotation.x + 0.45) > 1e-9) {
            erro(casos[i][0] + ': o pescoço foi mexido por cima do gesto');
        } else ok(casos[i][0] + ': pescoço intacto');
    }
}

console.log(LF + '7 — o animateBones chama-o');
{
    const i = srcPlayer.indexOf('animateBones(dt) {');
    const j = srcPlayer.indexOf('this.nivelarCabeca();', i);
    if (j < 0) erro('o animateBones deixou de nivelar a cabeça');
    else ok('a cabeça é verificada em cada frame desenhado');
}

if (falhas) { console.log(LF + falhas + ' problema(s).'); process.exit(1); }
console.log(LF + 'Cabeça: todos os cenários passaram.');
