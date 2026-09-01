/*
O remate tem de ir para onde é apontado.

Mede-se o que interessa: a bola sai do pé com a potência e a elevação que o
`executeShotGameplay` calcula, e vê-se ONDE cruza a linha de golo — altura e
desvio lateral face ao ponto visado.

A `elevacaoParaAlvo` é extraída do js/utils.js e corrida a sério; a potência
usa a mesma fórmula do js/fsm.js.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcFsm = semCR(fs.readFileSync(path.join(raiz, 'js', 'fsm.js'), 'utf8'));

function extrairFuncao(src, nome, ficheiro) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em ${ficheiro}`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const BallPhysics = {
    raio: 0.11, gravidade: 9.81, densidadeAr: 1.225, cd: 0.25, massa: 0.430
};
BallPhysics.kArrasto = 0.5 * BallPhysics.densidadeAr * BallPhysics.cd *
    (Math.PI * BallPhysics.raio ** 2) / BallPhysics.massa;

const ALTURA_BALIZA = 2.44, LARGURA_BALIZA = 7.32;

const elevacaoParaAlvo = new Function('BallPhysics',
    `${extrairFuncao(srcUtils, 'elevacaoParaAlvo', 'js/utils.js')}; return elevacaoParaAlvo;`
)(BallPhysics);

/*
A potência do remate vem do `ShotModel` (config.js), e a fórmula é a mesma que
o `executeShotGameplay` corre — verificada mais abaixo contra o texto do fsm.js,
para o teste falhar se lá deixar de ser assim.
*/
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'shooting.js'), 'utf8')) + '\n' + semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'physics.js'), 'utf8'));
function extrairObjecto(src, nome, ficheiro) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em ${ficheiro}`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function('Math', `${src.slice(ini, fim + 3)}; return ${nome};`)(Math);
}
const ShotModel = extrairObjecto(srcConfig, 'ShotModel', 'js/config.js');

const potencia = (TEC) => Math.max(ShotModel.potenciaMin,
    ShotModel.potenciaBase + ((TEC - 50) / 50) * ShotModel.potenciaPorSkill);

/*
Voa a bola e devolve a altura a que cruza `distH`, ou null se não chegar lá.
*/
function alturaAoCruzar(distH, v, elev) {
    const g = BallPhysics.gravidade, k = BallPhysics.kArrasto;
    let x = 0, y = BallPhysics.raio;
    let vx = v * Math.cos(elev), vy = v * Math.sin(elev);
    const dt = 1 / 480;
    for (let i = 0; i < 4000; i++) {
        const s = Math.hypot(vx, vy);
        if (s > 0.001) { const dv = k * s * s * dt; vx -= vx / s * dv; vy -= vy / s * dv; }
        vy -= g * dt;
        const xA = x, yA = y;
        x += vx * dt; y += vy * dt;
        if (x >= distH) {
            const f = (distH - xA) / Math.max(1e-6, x - xA);
            return yA + (y - yA) * f;
        }
        if (y < 0) return null;   // enterrou antes de lá chegar
    }
    return null;
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

console.log('potência do remate por TEC');
for (const tec of [20, 50, 80, 100]) {
    console.log(`  TEC ${String(tec).padStart(3)} -> ${potencia(tec).toFixed(1)} m/s`);
}

/*
Percorre as distâncias de remate reais e vê se a bola chega ao ponto visado.
`alvoY` 2.0 é o canto superior, 0.4 o rasteiro — os dois do caso 'GOL'.
*/
console.log('\nonde a bola cruza a linha de golo (TEC 50)');
console.log('  dist   alvo   elevação   altura ao cruzar   erro');
const tec = 50;
const pow = potencia(tec);
let semSolucao = 0, forte = 0;

for (const dist of [6, 10, 14, 18, 22, 26, 30]) {
    for (const alvoY of [0.4, 2.0]) {
        const elev = elevacaoParaAlvo(dist, alvoY, pow);
        if (elev === null) {
            semSolucao++;
            console.log(`  ${String(dist).padStart(4)} m  ${alvoY.toFixed(1)} m   SEM SOLUÇÃO ` +
                `(nem a 45° a bola lá chega com ${pow.toFixed(1)} m/s)`);
            continue;
        }
        const h = alturaAoCruzar(dist, pow, elev);
        const desvio = (h === null) ? null : h - alvoY;
        const grau = (elev * 180 / Math.PI).toFixed(1);
        if (h === null) {
            erro(`${dist} m alvo ${alvoY}: a bola nem chega à linha`);
            continue;
        }
        const mau = Math.abs(desvio) > 0.25;
        if (mau) forte++;
        console.log(`  ${String(dist).padStart(4)} m  ${alvoY.toFixed(1)} m   ` +
            `${grau.padStart(6)}°   ${h.toFixed(2).padStart(9)} m   ` +
            `${(desvio >= 0 ? '+' : '') + desvio.toFixed(2)}${mau ? '  X' : ''}`);
        if (mau) erro(`${dist} m alvo ${alvoY}: cruza a ${h.toFixed(2)} m, erro de ${desvio.toFixed(2)} m`);
    }
}

/*
Nenhum remate de uma distância de que se remata pode ficar SEM SOLUÇÃO: é isso
que o manda para a elevação de recurso — um balão que não vai à baliza.
*/
if (semSolucao > 0) {
    erro(`${semSolucao} remates sem solução de elevação — saem na elevação de recurso`);
}

/*
O fsm.js tem de continuar a usar o ShotModel, e não uma fórmula à mão. Foi
assim que a potência ficou esquecida a 17.6 m/s.
*/
if (!/ShotModel\.potenciaBase/.test(srcFsm)) {
    erro('js/fsm.js deixou de calcular a potência do remate a partir do ShotModel');
}
if (/pow = \(2[0-9]\.0 \+/.test(srcFsm)) {
    erro('js/fsm.js voltou a ter a potência do remate escrita à mão');
}

/*
A elevação de recurso tem de ser tensa. Estava em Math.PI/5 (36°), um balão.
*/
if (!(ShotModel.elevacaoRecurso > 0 && ShotModel.elevacaoRecurso <= 25 * Math.PI / 180)) {
    erro(`ShotModel.elevacaoRecurso = ${(ShotModel.elevacaoRecurso * 180 / Math.PI).toFixed(0)}° ` +
        `— acima de 25° é um balão`);
}
if (/Math\.PI \/ 5 : elev/.test(srcFsm)) {
    erro('js/fsm.js voltou aos 36° de recurso escritos à mão');
}

/*
Alcance máximo com esta potência, para se saber de onde ainda dá para rematar.
*/
{
    let alcance = 0;
    for (let d = 5; d <= 45; d += 0.5) {
        if (elevacaoParaAlvo(d, 0.4, pow) !== null) alcance = d;
    }
    console.log(`\nalcance útil a TEC ${tec} (${pow.toFixed(1)} m/s): ${alcance.toFixed(1)} m`);
    if (alcance < 25) {
        erro(`só se consegue mirar a baliza até ${alcance.toFixed(1)} m — remata-se de mais longe do que isso`);
    }
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: o remate vai para onde é apontado.');
