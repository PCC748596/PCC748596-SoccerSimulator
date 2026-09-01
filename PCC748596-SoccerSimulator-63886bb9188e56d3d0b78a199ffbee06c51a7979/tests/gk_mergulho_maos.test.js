/*
Mergulho do guarda-redes: as mãos chegam mesmo à bola?

O `GkDive.mirarBola` resolve os dois braços por IK para a posição da bola, com
`GoalkeeperDive.pesoIK` de suavização por frame, e o `defender` decide a defesa
pela distância da MÃO REAL à bola. Se o IK não levar a mão lá, o guarda-redes
não defende — por muito bem que tenha decidido mergulhar.

Este teste mede exactamente isso, e mede também o que a correcção do
`IK.resolverSuave` mudou: a versão antiga interpolava a pose antiga consigo
própria e deitava fora a rotação resolvida, portanto a mão nunca lá chegava.
*/
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));
const srcConfig = ler('js/config/goalkeeper.js');

function extrairObjecto(src, nome) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function('Math', `${src.slice(ini, fim + 3)}; return ${nome};`)(Math);
}
const GoalkeeperDive = extrairObjecto(srcConfig, 'GoalkeeperDive');

const amb = { THREE, console };
const { IK, IKChains } = new Function(...Object.keys(amb),
    `${ler('js/ik.js')}; return { IK, IKChains };`)(...Object.values(amb));

/*
A versão ANTIGA do resolverSuave, tal como estava, para o teste poder mostrar a
diferença em vez de a afirmar. A linha em causa era:

    raiz.quaternion.copy(qAnt).slerp(raiz.quaternion, peso);
*/
const _qAntigo = new THREE.Quaternion();
function resolverSuaveAntigo(raiz, meio, L1, L2, alvo, plano, peso) {
    const xAnt = meio.rotation.x;
    _qAntigo.copy(raiz.quaternion);
    const ok = IK.resolver(raiz, meio, L1, L2, alvo, plano);
    raiz.quaternion.copy(_qAntigo).slerp(raiz.quaternion, peso);
    meio.rotation.x = xAnt + (meio.rotation.x - xAnt) * peso;
    return ok;
}

const ESCALA = (1.8 / 5.5) * 0.9;

function novoGK() {
    const corpo = new THREE.Group();
    corpo.scale.set(ESCALA, ESCALA, ESCALA);
    const pelvis = new THREE.Group(); pelvis.position.set(0, 2.6, 0); corpo.add(pelvis);
    const chest = new THREE.Group(); chest.position.set(0, 0.9, 0); pelvis.add(chest);
    const rig = { pelvis, chest };
    const braco = (x, pre) => {
        const g = new THREE.Group(); g.position.set(x, 0.525, 0); chest.add(g);
        const e = new THREE.Group(); e.position.y = -1.0; g.add(e);
        const m = new THREE.Group(); m.position.y = -0.8; e.add(m);
        g.rotation.z = x < 0 ? -Math.PI / 16 : Math.PI / 16;
        rig[pre + 'Arm'] = g; rig[pre + 'Elbow'] = e; rig[pre + 'Hand'] = m;
    };
    braco(0.8, 'l'); braco(-0.8, 'r');
    corpo.updateWorldMatrix(true, true);
    return { model: corpo, rig };
}

const _cima = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

/*
Corre `frames` frames de `mirarBola` — que é o que acontece durante o mergulho,
com o mesmo peso de suavização — e devolve a menor distância mão-bola.
*/
function mergulhar(bola, frames, resolver) {
    const gk = novoGK();
    const C = IKChains.braco;
    const P = GoalkeeperDive.pesoIK;
    let melhor = Infinity;

    for (let i = 0; i < frames; i++) {
        resolver(gk.rig.lArm, gk.rig.lElbow, C.L1, C.L2, bola, _cima, P);
        resolver(gk.rig.rArm, gk.rig.rElbow, C.L1, C.L2, bola, _cima, P);
        gk.model.updateWorldMatrix(true, true);
        for (const nome of ['lHand', 'rHand']) {
            gk.rig[nome].getWorldPosition(_v);
            melhor = Math.min(melhor, _v.distanceTo(bola));
        }
    }
    return melhor;
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

/*
Alvos à volta do corpo, à altura a que uma bola passa num mergulho. O ombro
está a ~0.90 m do chão e o braço alcança 0.53 m, portanto tudo isto está ao
alcance de pelo menos uma das mãos.
*/
const alvos = [
    { nome: 'à frente, meia altura', p: new THREE.Vector3(0.0, 0.85, 0.40) },
    { nome: 'ao lado direito     ', p: new THREE.Vector3(-0.35, 0.90, 0.25) },
    { nome: 'ao lado esquerdo    ', p: new THREE.Vector3(0.35, 0.90, 0.25) },
    { nome: 'alto, à frente      ', p: new THREE.Vector3(0.0, 1.25, 0.30) },
    { nome: 'baixo, à frente     ', p: new THREE.Vector3(0.0, 0.55, 0.35) }
];

const FRAMES = 20;   // ~0.33 s de mergulho a 60 fps

/*
Distância do OMBRO mais próximo ao alvo. Um alvo a mais de 0.53 m de ambos os
ombros está fora do alcance do braço com o corpo de pé — no jogo o `GkDive`
desloca o CORPO (fases de impulso e voo), e é isso que leva o ombro para perto
da bola. Aqui só se mede o braço, portanto esses alvos medem-se pelo GANHO e
não por chegarem.
*/
function distAoOmbro(alvo) {
    const gk = novoGK();
    gk.model.updateWorldMatrix(true, true);
    let melhor = Infinity;
    for (const nome of ['lArm', 'rArm']) {
        gk.rig[nome].getWorldPosition(_v);
        melhor = Math.min(melhor, _v.distanceTo(alvo));
    }
    return melhor;
}
const ALCANCE_BRACO = (IKChains.braco.L1 + IKChains.braco.L2) * ESCALA;

console.log(`mão mais próxima da bola ao fim de ${FRAMES} frames ` +
    `(pesoIK ${GoalkeeperDive.pesoIK}, braço ${ALCANCE_BRACO.toFixed(2)} m)`);
console.log('  alvo                      antes      agora   ao alcance?');

let piorAoAlcance = 0, somaAntes = 0, somaAgora = 0, nAoAlcance = 0;
for (const a of alvos) {
    const antes = mergulhar(a.p, FRAMES, resolverSuaveAntigo);
    const agora = mergulhar(a.p, FRAMES, IK.resolverSuave.bind(IK));
    const dOmbro = distAoOmbro(a.p);
    const aoAlcance = dOmbro <= ALCANCE_BRACO;
    somaAntes += antes; somaAgora += agora;
    if (aoAlcance) { nAoAlcance++; piorAoAlcance = Math.max(piorAoAlcance, agora); }
    console.log(`  ${a.nome}   ${(antes * 100).toFixed(1).padStart(6)} cm  ` +
        `${(agora * 100).toFixed(1).padStart(6)} cm   ` +
        `${aoAlcance ? 'sim' : `não (ombro a ${dOmbro.toFixed(2)} m)`}`);
}
console.log(`  ${'média'.padEnd(24)} ${(somaAntes / alvos.length * 100).toFixed(1).padStart(6)} cm  ` +
    `${(somaAgora / alvos.length * 100).toFixed(1).padStart(6)} cm`);

/*
1 — nos alvos ao alcance do braço, a mão tem de chegar mesmo à bola. Com o peso
de suavização e 20 frames o IK converge; o que sobra é erro numérico, não uma
mão a meio caminho.
*/
if (piorAoAlcance > 0.05) {
    erro(`a mão fica a ${(piorAoAlcance * 100).toFixed(1)} cm da bola no pior alvo ao alcance`);
} else {
    console.log(`\nnos ${nAoAlcance} alvos ao alcance do braço a mão chega à bola ` +
        `(pior: ${(piorAoAlcance * 100).toFixed(1)} cm)`);
}

/*
2 — e tem de ser MELHOR do que era. Se não for, a correcção do resolverSuave
não está lá.
*/
if (!(somaAgora < somaAntes - 0.05)) {
    erro('a correcção do IK.resolverSuave não está a fazer diferença — ' +
        'confirmar que o slerp já não interpola a pose antiga consigo própria');
} else {
    const ganho = (somaAntes - somaAgora) / alvos.length;
    console.log(`ganho médio: ${(ganho * 100).toFixed(1)} cm mais perto da bola`);
}

/*
3 — o que isto significa para a DEFESA: o `defender` só conta a defesa se a mão
estiver a menos de `raioMao + raio da bola`. Quantos destes alvos passavam esse
teste antes, e quantos passam agora?
*/
{
    const limite = GoalkeeperDive.raioMao + 0.11;
    let okAntes = 0, okAgora = 0;
    for (const a of alvos) {
        if (mergulhar(a.p, FRAMES, resolverSuaveAntigo) <= limite) okAntes++;
        if (mergulhar(a.p, FRAMES, IK.resolverSuave.bind(IK)) <= limite) okAgora++;
    }
    console.log(`\ndefesas possíveis (mão a menos de ${limite.toFixed(2)} m da bola): ` +
        `${okAntes}/${alvos.length} antes, ${okAgora}/${alvos.length} agora`);
    if (okAgora < alvos.length) {
        erro(`${alvos.length - okAgora} alvos ao alcance do braço continuam sem defesa possível`);
    }
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: no mergulho as mãos vão mesmo à bola.');
