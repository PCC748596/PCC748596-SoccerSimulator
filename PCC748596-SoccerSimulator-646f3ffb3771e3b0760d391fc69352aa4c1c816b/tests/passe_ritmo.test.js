/*
Ritmo do passe rasteiro: com que velocidade sai, com que velocidade chega, e
quanto tempo demora.

A calibração deste projecto é pela velocidade de CHEGADA — é ela que decide se
o receptor domina a bola (`BallControl.easySpeed`) — e a de saída é
consequência da distância e do atrito. Ver velocidadeRasteiraPara em utils.js.

O que este teste tranca é a relação entre os dois: sempre que a chegada subir,
o `easySpeed` tem de a acompanhar, senão o passe fica mais rápido e ninguém o
consegue receber.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));
const srcConfig = ler('js/config/passing.js') + '\n' + ler('js/config/player_behavior.js') + '\n' + ler('js/config/physics.js');
const srcUtils = ler('js/utils.js');

function extrairObjecto(src, nome) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function('Math', 'ALTURA_CABECA', 'ALTURA_TESTA',
        `${src.slice(ini, fim + 3)}; return ${nome};`)(Math, 1.72, 1.62);
}
function extrairFuncao(src, nome) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const PassModel = extrairObjecto(srcConfig, 'PassModel');
const BallControl = extrairObjecto(srcConfig, 'BallControl');
const BallPhysics = {
    raio: 0.11, gravidade: 9.81, densidadeAr: 1.225, cd: 0.25, massa: 0.430,
    atritoRolamento: 0.38, vMinRolar: 0.25
};
BallPhysics.kArrasto = 0.5 * BallPhysics.densidadeAr * BallPhysics.cd *
    (Math.PI * BallPhysics.raio ** 2) / BallPhysics.massa;

const velocidadeRasteiraPara = new Function('BallPhysics',
    `${extrairFuncao(srcUtils, 'velocidadeRasteiraPara')}; return velocidadeRasteiraPara;`
)(BallPhysics);

/*
Rola a bola com a física real do `updateBall` (arrasto do ar + atrito de
rolamento) e devolve a velocidade e o tempo à distância pedida.
*/
function rolar(v0, dist) {
    const k = BallPhysics.kArrasto;
    const a = BallPhysics.atritoRolamento * BallPhysics.gravidade;
    const dt = 1 / 480;
    let x = 0, v = v0, t = 0;
    for (let i = 0; i < 20000; i++) {
        const dvAr = k * v * v * dt;
        const dvCh = Math.min(v, a * dt);
        v = Math.max(0, v - dvAr - dvCh);
        x += v * dt; t += dt;
        if (x >= dist) return { v, t };
        if (v <= BallPhysics.vMinRolar) return { v: 0, t: Infinity };
    }
    return { v: 0, t: Infinity };
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

console.log(`vChegadaRasteira = ${PassModel.vChegadaRasteira} m/s, ` +
    `easySpeed = ${BallControl.easySpeed} m/s`);
console.log('\n  dist   v saída   v chegada   tempo    dominável?');

let indominaveis = 0, medidos = 0;
for (const d of [3, 5, 8, 12, 16, 20, 25]) {
    const v0 = velocidadeRasteiraPara(d, PassModel.vChegadaRasteira);
    const r = rolar(v0, d);
    if (r.t === Infinity) {
        erro(`passe de ${d} m não chega ao destino (morre pelo caminho)`);
        continue;
    }
    medidos++;
    const dominavel = r.v < BallControl.easySpeed;
    if (!dominavel) indominaveis++;
    console.log(`  ${String(d).padStart(4)} m   ${v0.toFixed(1).padStart(5)}     ` +
        `${r.v.toFixed(2).padStart(6)}    ${r.t.toFixed(2)} s   ` +
        `${dominavel ? 'sim' : 'NÃO'}`);
}

/*
1 — nenhum passe pode chegar acima do `easySpeed`. É a invariante que faz o
receptor dominar sempre um passe bem dado; quebrá-la é acelerar a bola à custa
da competência de quem a recebe.
*/
if (indominaveis > 0) {
    erro(`${indominaveis} de ${medidos} passes chegam acima do easySpeed ` +
        `(${BallControl.easySpeed}) — os receptores vão falhar o primeiro toque`);
} else {
    console.log(`\ntodos os ${medidos} passes chegam domináveis`);
}

/*
2 — e o passe curto é o caso crítico, por causa do reforço `(12 - d) * 0.18`.
*/
{
    const d = 3;
    const chega = rolar(velocidadeRasteiraPara(d, PassModel.vChegadaRasteira), d).v;
    const reforco = (12 - d) * 0.18;
    console.log(`passe curto (${d} m): chega a ${chega.toFixed(2)} m/s ` +
        `(reforço de +${reforco.toFixed(2)} sobre os ${PassModel.vChegadaRasteira})`);
    if (chega >= BallControl.easySpeed) {
        erro(`o passe curto chega a ${chega.toFixed(2)}, acima do easySpeed — ` +
            `subir o vChegadaRasteira obriga a subir o easySpeed na mesma proporção`);
    }
}

/*
3 — o ritmo. Um passe rasteiro de 10 m num jogo real anda à volta de 1 s; muito
acima disso lê-se como câmara lenta, que era a queixa que levou a 2.8 -> 6.0 e
agora a 7.5.
*/
{
    const t10 = rolar(velocidadeRasteiraPara(10, PassModel.vChegadaRasteira), 10).t;
    console.log(`passe de 10 m: ${t10.toFixed(2)} s`);
    if (t10 > 1.15) erro(`passe de 10 m demora ${t10.toFixed(2)} s — lento de mais`);
    if (t10 < 0.55) erro(`passe de 10 m demora ${t10.toFixed(2)} s — isso é um remate`);
}

/*
4 — a saída tem de crescer com a distância, senão o passe deixa de responder ao
que lhe é pedido.
*/
{
    let anterior = 0, mau = 0;
    for (const d of [3, 5, 8, 12, 16, 20, 25]) {
        const v0 = velocidadeRasteiraPara(d, PassModel.vChegadaRasteira);
        if (v0 < anterior - 1e-9) { mau++; }
        anterior = v0;
    }
    if (mau) erro('a velocidade de saída não é monótona na distância');
    else console.log('a velocidade de saída cresce com a distância');
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: o passe chega vivo e continua dominável.');
