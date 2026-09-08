/*
A SEQUÊNCIA DO MERGULHO — braços e tronco.

Pedido, com nove fotogramas de referência: passo de apoio com os braços atrás,
os dois a subir na saída, extensão completa no ar, e a aterragem de lado a
escorregar com os braços à frente.

A máquina de estados já fazia as cinco fases (`ler`, `impulso`, `voo`, `chão`,
`levantar`, em js/gk_dive.js) e a `sequenciaPernas` já desenhava as pernas em
três delas. Os braços não tinham desenho nenhum: iam os DOIS à bola por IK do
princípio ao fim, e o de trás ficava esticado a atravessar o peito.

O que este teste fixa:

1. O braço LÍDER é o do lado do mergulho — a coreografia não pode sair trocada
   nos mergulhos de um dos lados, que é o defeito clássico deste código (ver a
   mesma nota em `pernas`).
2. No impulso os dois braços vão atrás; no voo o de trás sai do IK e estica; no
   chão os dois vão à frente.
3. O braço de trás só sai do IK DEPOIS de `fracIKTraseiro` do voo: o instante do
   contacto continua a ter as duas mãos na bola, senão isto era uma mudança de
   jogo disfarçada de animação.
4. Quem se levanta desfaz a torção do tronco.

Corre com: node tests/mergulho_gk_sequencia.test.js
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

const srcDive = ler('js/gk_dive.js');

// O GkDive real, com o mínimo à volta: as poses que aqui se testam não tocam
// na bola nem no IK. O BallPhysics vem do config/physics.js, carregado abaixo.
const amb = {
    THREE, console,
    window: {},
    Match: { ball: { position: new THREE.Vector3(0, 0.5, 0) } },
    IK: { resolverSuave: () => { } },
    IKChains: { braco: { L1: 0.3, L2: 0.3 } },
    preverBolaEm: () => null
};
const mod = new Function(...Object.keys(amb),
    ler('js/config/physics.js') + LF + ler('js/utils.js') + LF +
    ler('js/config/gait.js') + LF + ler('js/config/goalkeeper.js') + LF +
    ler('js/config/player_behavior.js') + LF + srcDive + LF +
    'return { GkDive, GoalkeeperDive, lerpTo };')(...Object.values(amb));
const { GkDive, GoalkeeperDive } = mod;

// Um rig de mentira: só ossos com rotação, que é tudo o que as poses tocam.
function osso() { return { rotation: { x: 0, y: 0, z: 0 } }; }
function rigFalso() {
    return {
        chest: osso(), pelvis: osso(), neck: osso(),
        lArm: osso(), rArm: osso(), lElbow: osso(), rElbow: osso(),
        lLeg: osso(), rLeg: osso(), lKnee: osso(), rKnee: osso()
    };
}
// Converge a pose: as poses entram por lerp.
function repetir(fn, n) { for (let i = 0; i < (n || 80); i++) fn(); }

const S = GoalkeeperDive.sequenciaBracos;
const T = GoalkeeperDive.torcaoTronco;

console.log(LF + '1 — o config existe e cabe no ombro');
{
    if (!S || !S.impulso || !S.voo || !S.chao) {
        erro('sequenciaBracos incompleta: faltam fases');
    } else ok('as três fases do braço estão no config');

    if (!T || T.impulso === undefined || T.voo === undefined || T.chao === undefined) {
        erro('torcaoTronco incompleta');
    } else ok('a torção do tronco está no config');

    // JointLimits.shoulder: 180° nos dois eixos; a torção do tronco é bem menor.
    const valores = [S.impulso.liderZ, S.impulso.traseiroZ, S.voo.traseiroZ, S.chao.liderZ, S.chao.traseiroZ];
    if (valores.some(v => Math.abs(v) > Math.PI)) {
        erro('há um ângulo de ombro acima de 180 graus');
    } else ok('nenhum ângulo passa o limite do ombro');

    if (!(S.voo.fracIKTraseiro > 0 && S.voo.fracIKTraseiro < 1)) {
        erro('fracIKTraseiro tem de ser uma fracção do voo');
    } else ok('há uma fracção do voo antes da qual os dois braços vão à bola');
}

console.log(LF + '2 — o braço líder é o do lado do mergulho');
{
    const rig = rigFalso();
    const dir = GkDive.bracos(rig, { ladoLocal: 1 });
    const esq = GkDive.bracos(rig, { ladoLocal: -1 });
    if (dir.lider !== rig.rArm) erro('mergulho para a direita: o líder tinha de ser o braço direito');
    else if (esq.lider !== rig.lArm) erro('mergulho para a esquerda: o líder tinha de ser o esquerdo');
    else if (dir.sinal !== 1 || esq.sinal !== -1) erro('o sinal do lado saiu trocado');
    else ok('o líder e o sinal seguem o lado do mergulho');
}

console.log(LF + '3 — no impulso os dois braços vão atrás');
{
    const rig = rigFalso();
    const d = { ladoLocal: 1 };
    repetir(() => GkDive.poseBracosImpulso(rig, d, 1));
    const B = GkDive.bracos(rig, d);
    if (Math.abs(B.lider.rotation.x - S.impulso.liderX) > 0.05) {
        erro('o braço líder não foi para trás no impulso');
    } else if (Math.abs(B.traseiro.rotation.x - S.impulso.traseiroX) > 0.05) {
        erro('o braço de trás não foi para trás no impulso');
    } else if (!(S.impulso.liderX < 0 && S.impulso.traseiroX < 0)) {
        erro('"atrás" é x negativo no rig: o config está a mandá-los à frente');
    } else ok('os dois braços carregam o gesto antes da saída');

    // E o tronco torce para o lado do mergulho.
    repetir(() => GkDive.torcerTronco(rig, d, 'impulso', 1));
    if (Math.sign(rig.chest.rotation.y) !== 1 || Math.abs(rig.chest.rotation.y - T.impulso) > 0.05) {
        erro('o tronco não torceu para o lado do mergulho');
    } else ok('o tronco torce para o lado antes de sair do chão');
}

console.log(LF + '4 — no voo o braço de trás só sai do IK depois do contacto');
{
    const rig = rigFalso();
    const d = { ladoLocal: 1 };
    // Antes da fracção: não se mexe (o IK é que manda, e a mão está na bola).
    repetir(() => GkDive.poseBracosVoo(rig, d, S.voo.fracIKTraseiro - 0.05), 20);
    if (rig.lArm.rotation.x !== 0 || rig.lArm.rotation.z !== 0) {
        erro('o braço de trás foi mexido durante a janela do contacto');
    } else ok('durante o contacto os dois braços continuam à bola');

    // Depois: estica ao longo do corpo, aberto do tronco.
    repetir(() => GkDive.poseBracosVoo(rig, d, 1.0));
    const B = GkDive.bracos(rig, d);
    if (Math.abs(B.traseiro.rotation.x - S.voo.traseiroX) > 0.05) {
        erro('o braço de trás não esticou no voo');
    } else if (Math.abs(B.traseiro.rotation.z + S.voo.traseiroZ) > 0.05) {
        erro('o braço de trás tem de abrir para o lado OPOSTO ao do mergulho');
    } else if (B.lider.rotation.x !== 0 || B.lider.rotation.z !== 0) {
        erro('o líder foi escrito à mão: ele é do IK, é ele que apanha a bola');
    } else ok('só o braço de trás segue a coreografia no voo');
}

console.log(LF + '5 — no chão os braços vão à frente');
{
    const rig = rigFalso();
    const d = { ladoLocal: -1, agarrou: true };
    repetir(() => GkDive.poseBracosChao(rig, d));
    const B = GkDive.bracos(rig, d);
    if (!(S.chao.liderX > 0 && S.chao.traseiroX > 0)) {
        erro('"à frente" é x positivo no rig: o config está a mandá-los atrás');
    } else if (Math.abs(B.traseiro.rotation.x - S.chao.traseiroX) > 0.05) {
        erro('o braço de trás não foi à frente na aterragem');
    } else if (Math.abs(B.lider.rotation.x - S.chao.liderX) > 0.05) {
        erro('com a bola agarrada o líder também sai do IK e recolhe');
    } else ok('aterra a escorregar com os braços à frente');

    // Sem a bola agarrada o líder fica no IK — pode ainda haver defesa a fazer.
    const rig2 = rigFalso();
    repetir(() => GkDive.poseBracosChao(rig2, { ladoLocal: -1, agarrou: false }));
    if (rig2.lArm.rotation.x !== 0) {
        erro('sem a bola agarrada o líder não pode sair do IK');
    } else ok('sem a bola na mão, o líder continua a procurá-la');
}

console.log(LF + '6 — quem se levanta desfaz a torção');
{
    const rig = rigFalso();
    rig.chest.rotation.y = 0.45;
    repetir(() => GkDive.poseLevantar(rig, 0.5));
    if (Math.abs(rig.chest.rotation.y) > 0.02) {
        erro('ficou de tronco torcido depois de se levantar (' + rig.chest.rotation.y.toFixed(2) + ')');
    } else ok('levanta-se de frente');
}

console.log(LF + '7 — as fases chamam a coreografia');
{
    const pares = [
        ["case 'impulso'", 'poseBracosImpulso'],
        ["case 'voo'", 'poseBracosVoo'],
        ["case 'chao'", 'poseBracosChao']
    ];
    for (let i = 0; i < pares.length; i++) {
        const ini = srcDive.indexOf(pares[i][0]);
        const fim = srcDive.indexOf('break;', ini);
        if (ini < 0 || fim < 0) { erro('fase ' + pares[i][0] + ' não encontrada'); continue; }
        const bloco = srcDive.slice(ini, fim);
        if (!bloco.includes(pares[i][1])) {
            erro(pares[i][0] + ' deixou de desenhar os braços (' + pares[i][1] + ')');
        } else ok(pares[i][0] + ' desenha os braços');
    }

    // E no voo a coreografia corre DEPOIS do IK, senão o IK apagava-a.
    const ini = srcDive.indexOf("case 'voo'");
    const bloco = srcDive.slice(ini, srcDive.indexOf('break;', ini));
    if (!(bloco.indexOf('poseBracosVoo') > bloco.indexOf('mirarBola'))) {
        erro('a coreografia do voo corre antes do IK e é apagada por ele');
    } else ok('no voo a coreografia entra por cima do IK');
}

if (falhas) { console.log(LF + falhas + ' problema(s).'); process.exit(1); }
console.log(LF + 'Sequência do mergulho: todos os cenários passaram.');
