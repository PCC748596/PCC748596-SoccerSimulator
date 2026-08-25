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

const ambiente = { GaitModel, LateralGait, RefereeModel, THREE, lerp, lerpTo };
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

/*
=============================================================================
O TREMOR AO PARAR
=============================================================================
Com o alvo estabilizado em cima dele, o árbitro TREMIA. A conta: o passo de um
frame é `min(d, velMax*amp*dt)`, portanto perto do alvo o passo é o próprio
`d`, e a velocidade que alimenta a animação é `d/dt` — a 1/60, seis
centímetros dão 3.6 m/s. O movimento parava em `d <= 0.05` e o ciclo de
passada ligava em `vel > 0.1`: a velocidade saltava entre 0 e vários m/s sem
nada pelo meio, e o boneco alternava entre correr e parar a cada frame, com o
ressalto vertical a acompanhar.

A medida é o número de VEZES que a animação liga e desliga. Um árbitro que
chegou ao sítio faz isso zero vezes.
=============================================================================
*/
console.log('\ntremor com o alvo estabilizado');
{
    const medirTremor = (amplitude) => {
        const o = novoOficial(0, 0);
        const dt = 1 / 60;
        // Deixa-o chegar ao alvo antes de medir.
        for (let i = 0; i < 240; i++) mover(o, 0, 0, RefereeModel.velocidade, dt, { x: 0, z: 10 });

        let trocas = 0, antes = null, ySalto = 0, yAnt = o.model.position.y;
        for (let i = 0; i < 600; i++) {
            // O alvo vibra em torno do sítio onde ele está: a bola parada não
            // fica perfeitamente imóvel, e era isto que despoletava o tremor.
            mover(o, Math.sin(i * 0.7) * amplitude, Math.cos(i * 1.1) * amplitude,
                RefereeModel.velocidade, dt, { x: 0, z: 10 });

            const aAndar = (o.velAnim || 0) > 0.1;
            if (antes !== null && aAndar !== antes) trocas++;
            antes = aAndar;

            ySalto = Math.max(ySalto, Math.abs(o.model.position.y - yAnt));
            yAnt = o.model.position.y;
        }
        console.log(`  alvo a vibrar ${(amplitude * 100).toFixed(0)} cm: ${trocas} troca(s) ` +
            `da passada, salto vertical máx ${(ySalto * 1000).toFixed(1)} mm`);
        return { trocas, ySalto };
    };

    // Vibração dentro da zona morta: não pode mexer uma palha.
    const perto = medirTremor(0.06);
    if (perto.trocas > 0) {
        console.error(`  X ainda treme com o alvo a vibrar 6 cm: ${perto.trocas} trocas`);
        falhas++;
    }
    if (perto.ySalto > 0.005) {
        console.error(`  X o ressalto vertical salta ${(perto.ySalto * 1000).toFixed(1)} mm por frame`);
        falhas++;
    }

    /*
    Com o alvo a vibrar MAIS do que a zona morta ele tem de andar — a correcção
    não pode ser "deixar de seguir a bola". Aqui as trocas são legítimas, mas
    poucas: é a histerese a segurar.
    */
    const longe = medirTremor(0.9);
    if (longe.trocas > 40) {
        console.error(`  X a histerese não segura: ${longe.trocas} trocas em 600 frames`);
        falhas++;
    }
}

/*
=============================================================================
OS SOLAVANCOS DO ASSISTENTE
=============================================================================
A correcção do tremor trouxe um defeito novo. A zona morta com histerese
esteve em 0.25/0.60 m, e o alvo de um assistente NÃO ESTÁ PARADO: corre ao
longo da linha atrás da bola, portanto afasta-se sempre. Com 60 cm de folga o
boneco esperava, acumulava distância e arrancava de repente para a recuperar
— parar e disparar, em ciclo, que foi o que se viu no ecrã.

A medida é a variação de velocidade entre frames. Um oficial a acompanhar um
alvo que se desloca a ritmo constante tem de andar a ritmo aproximadamente
constante: se a velocidade salta de zero para o máximo e volta a zero, são
solavancos.
=============================================================================
*/
console.log(String.fromCharCode(10) + 'solavancos com o alvo em fuga contínua');
{
    const dt = 1 / 60;
    const o = novoOficial(0, 0);

    // O alvo desliza ao longo da linha a 3 m/s — o caso do assistente a
    // acompanhar uma jogada, bem abaixo da velocidade máxima dele.
    const velAlvo = 3.0;
    let alvoZ = 0;

    // Deixa arrancar antes de medir.
    for (let i = 0; i < 120; i++) {
        alvoZ += velAlvo * dt;
        mover(o, 0, alvoZ, RefereeModel.velocidadeAssistente, dt, { x: 20, z: alvoZ });
    }

    let zAnt = o.model.position.z;
    let paradoFrames = 0, maxSalto = 0, vAnt = null;
    const N = 600;
    for (let i = 0; i < N; i++) {
        alvoZ += velAlvo * dt;
        mover(o, 0, alvoZ, RefereeModel.velocidadeAssistente, dt, { x: 20, z: alvoZ });

        const v = Math.abs(o.model.position.z - zAnt) / dt;
        zAnt = o.model.position.z;
        if (v < 0.05) paradoFrames++;
        if (vAnt !== null) maxSalto = Math.max(maxSalto, Math.abs(v - vAnt));
        vAnt = v;
    }

    const pctParado = 100 * paradoFrames / N;
    console.log(`  alvo a ${velAlvo} m/s: ${pctParado.toFixed(0)}% dos frames parado, ` +
        `maior salto de velocidade ${maxSalto.toFixed(2)} m/s`);

    /*
    Acompanhar um alvo mais lento do que ele não pode implicar paragens: se
    para em mais de um quinto dos frames, é stop-and-go.
    */
    if (pctParado > 20) {
        console.error(`  X fica parado ${pctParado.toFixed(0)}% do tempo a seguir um alvo contínuo — são os solavancos`);
        falhas++;
    } else console.log(`  . segue o alvo sem parar (${pctParado.toFixed(0)}% dos frames parado)`);

    // E sem arranques bruscos: o alvo anda a 3 m/s, portanto saltos muito
    // acima disso num único frame são o boneco a disparar para recuperar.
    if (maxSalto > velAlvo) {
        console.error(`  X salto de ${maxSalto.toFixed(2)} m/s num frame — arranca de repente`);
        falhas++;
    } else console.log(`  . sem arranques bruscos (máximo ${maxSalto.toFixed(2)} m/s por frame)`);
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} problema(s) no movimento do árbitro.`);
    process.exit(1);
}
console.log('\nOK: o avanço corresponde à passada, e ele não treme parado.');
