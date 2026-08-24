/*
O árbitro não pode DESLIZAR: o avanço no chão tem de corresponder ao que as
pernas andam.

A medida é o ESCORREGAMENTO — distância percorrida a dividir pelo que a
animação diz que ele andou (ciclos completos × passada efectiva). 1.0 é o pé
colado ao chão; 2.0 é o boneco a percorrer o dobro do que as pernas dão.

A passada efectiva encolhe com o passo lateral (`LateralGait.reducaoPassada`):
quem anda de lado dá passos curtos. Prender o corpo à bola a correr põe
`lateralidade` a 1 em plena velocidade, e é aí que o deslize aparece.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcOfficials = semCR(fs.readFileSync(path.join(raiz, 'js', 'officials.js'), 'utf8'));
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8'));

function extrairFuncao(src, nome, ficheiro) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em ${ficheiro}`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}
function extrairObjecto(src, nome, ficheiro) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em ${ficheiro}`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function(`${src.slice(ini, fim + 3)}; return ${nome};`)();
}
// Método de um objecto literal, indentado a 4 espaços (o estilo do officials.js).
function extrairMetodo(src, nome, ficheiro) {
    const cabeca = `    ${nome}: function (`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em ${ficheiro}`);
    const fim = src.indexOf(LF + '    },', ini);
    const assinatura = src.slice(ini + cabeca.length, src.indexOf(') {', ini));
    return { args: assinatura, corpo: src.slice(src.indexOf(') {', ini) + 3, fim) };
}

const GaitModel = extrairObjecto(srcConfig, 'GaitModel', 'js/config.js');
const LateralGait = extrairObjecto(srcConfig, 'LateralGait', 'js/config.js');
const RefereeModel = extrairObjecto(srcOfficials, 'RefereeModel', 'js/officials.js');

const lerp = (a, b, k) => a + (b - a) * k;
const lerpTo = (a, b, k) => a + (b - a) * (k === undefined ? 0.2 : k);
const THREE = { MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } };

const ambiente = { GaitModel, LateralGait, THREE, lerp, lerpTo };
const fns = new Function(...Object.keys(ambiente), `
    ${extrairFuncao(srcUtils, 'misturarAndamento', 'js/utils.js')}
    ${extrairFuncao(srcUtils, 'getGaitPose', 'js/utils.js')}
    return { misturarAndamento, getGaitPose };
`)(...Object.values(ambiente));

const m = extrairMetodo(srcOfficials, 'mover', 'js/officials.js');
const mover = new Function(...Object.keys(ambiente), 'getGaitPose', `
    return function (${m.args}) {${m.corpo}};
`)(...Object.values(ambiente), fns.getGaitPose);

const osso = () => ({ rotation: { x: 0, y: 0, z: 0 } });
function novoOficial(x, z) {
    const rig = {};
    for (const n of ['lLeg', 'rLeg', 'lKnee', 'rKnee', 'lArm', 'rArm',
        'lElbow', 'rElbow', 'chest', 'lFoot', 'rFoot']) rig[n] = osso();
    return { model: { position: { x, y: 0, z }, rotation: { x: 0, y: 0, z: 0 } }, rig, animTimer: 0 };
}

/*
Corre `frames` passos com o alvo e o ponto de olhar dados, e devolve o
escorregamento e a lateralidade média.
*/
function medir({ alvo, olharPara, velMax, frames = 600, dt = 1 / 60 }) {
    const o = novoOficial(0, 0);
    // Orientação inicial coerente com o que ele vai fazer, para não contar o
    // primeiro frame de viragem.
    o.model.rotation.y = Math.atan2(alvo.x, alvo.z);

    const x0 = o.model.position.x, z0 = o.model.position.z;
    const t0 = o.animTimer;
    let somaLat = 0, n = 0;

    for (let i = 0; i < frames; i++) {
        // Alvo sempre longe, para ele nunca abrandar: recoloca-se à frente.
        const ax = o.model.position.x + alvo.x * 100;
        const az = o.model.position.z + alvo.z * 100;
        const olhar = olharPara ? {
            x: o.model.position.x + olharPara.x * 100,
            z: o.model.position.z + olharPara.z * 100
        } : undefined;

        mover(o, ax, az, velMax, dt, olhar);

        const fx = Math.sin(o.model.rotation.y), fz = Math.cos(o.model.rotation.y);
        const alinhamento = fx * alvo.x + fz * alvo.z;
        const desvio = Math.acos(THREE.MathUtils.clamp(Math.abs(alinhamento), -1, 1));
        somaLat += desvio > LateralGait.anguloMin
            ? Math.min(1, (desvio - LateralGait.anguloMin) / (Math.PI / 2 - LateralGait.anguloMin))
            : 0;
        n++;
    }

    const percorrido = Math.hypot(o.model.position.x - x0, o.model.position.z - z0);
    const ciclos = o.animTimer - t0;
    const latMedia = somaLat / n;
    const passada = fns.getGaitPose(0, velMax).passada * (1 - latMedia * LateralGait.reducaoPassada);
    return { escorregamento: percorrido / (ciclos * passada), latMedia, percorrido, ciclos };
}

let falhas = 0;
const TOLERANCIA = 1.15;   // 15% de folga: a passada efectiva é uma média

console.log('escorregamento do árbitro (1.00 = pé colado ao chão)');
const casos = [
    { nome: 'a correr em frente         ', alvo: { x: 0, z: 1 }, olharPara: { x: 0, z: 1 } },
    { nome: 'bola a 90° (corrida rápida)', alvo: { x: 0, z: 1 }, olharPara: { x: 1, z: 0 } },
    { nome: 'bola atrás (de costas)     ', alvo: { x: 0, z: 1 }, olharPara: { x: 0, z: -1 } },
];
for (const c of casos) {
    const r = medir({ alvo: c.alvo, olharPara: c.olharPara, velMax: RefereeModel.velocidade });
    const mau = r.escorregamento > TOLERANCIA;
    if (mau) falhas++;
    console.log(`  ${c.nome} escorregamento=${r.escorregamento.toFixed(2)} ` +
        `lateralidade=${r.latMedia.toFixed(2)}${mau ? '   X DESLIZA' : ''}`);
}

/*
A passo de passeio o passo lateral é legítimo — é assim que os jogadores se
deslocam a marcar, e a essa velocidade não se lê como deslize.
*/
{
    const r = medir({ alvo: { x: 0, z: 1 }, olharPara: { x: 1, z: 0 }, velMax: 2.0 });
    console.log(`\n  devagar (2.0 m/s), bola a 90°: escorregamento=${r.escorregamento.toFixed(2)} ` +
        `lateralidade=${r.latMedia.toFixed(2)} (passo lateral é normal aqui)`);
    if (r.escorregamento > TOLERANCIA) {
        console.error('  X mesmo devagar o passo lateral desliza');
        falhas++;
    }
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos em que o árbitro percorre mais chão do que as pernas dão.`);
    process.exit(1);
}
console.log('\nOK: o avanço do árbitro corresponde à passada.');
