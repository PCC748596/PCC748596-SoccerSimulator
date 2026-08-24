/*
Lateral com alvo em altura (pés ou peito do receptor) e matada no peito com a
queda contínua na TEC.

As três funções puras são extraídas do js/utils.js e corridas a sério; as
constantes são as do js/config.js, lidas do ficheiro para o teste falhar se
alguém lhes mexer sem olhar para aqui.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8'));

function extrairFuncao(src, nome, ficheiro) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em ${ficheiro}`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

// Lê um objecto de config pelo nome, avaliando só a sua declaração.
function extrairObjecto(nome) {
    const cabeca = `const ${nome} = {`;
    const ini = srcConfig.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em js/config.js`);
    const fim = srcConfig.indexOf(LF + '};', ini);
    const corpo = srcConfig.slice(ini, fim + 3);
    return new Function(`${corpo}; return ${nome};`)();
}

const ThrowInModel = extrairObjecto('ThrowInModel');
const BallControl = extrairObjecto('BallControl');
const BallPhysics = { raio: 0.11, gravidade: 9.81 };

const chamar = nome => new Function(
    'ThrowInModel', 'BallControl',
    `${extrairFuncao(srcUtils, nome, 'js/utils.js')}; return ${nome};`
)(ThrowInModel, BallControl);

const velocidadeDeLancamento = chamar('velocidadeDeLancamento');
const sigmaDeLateral = chamar('sigmaDeLateral');
const quedaNoPeito = chamar('quedaNoPeito');
const amostraGaussiana = chamar('amostraGaussiana');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  ' + m);

const g = BallPhysics.gravidade;
const ALT_PEITO = BallControl.peitoAltura;
const ALT_MAOS = 2.0;   // a bola vai nas mãos, acima da cabeça

/*
Integra a parábola e devolve a altura da bola quando ela passa por `D` metros
em planta. Sem arrasto, que é o que a fórmula assume.
*/
function alturaA(D, v, elev, alturaSaida) {
    const vh = v * Math.cos(elev);
    const t = D / vh;
    return alturaSaida + v * Math.sin(elev) * t - 0.5 * g * t * t;
}

/*
1 — a balística acerta na altura pedida.
*/
console.log('balística: altura de chegada face ao alvo');
for (const alvo of [BallPhysics.raio, ALT_PEITO]) {
    const nome = (alvo === ALT_PEITO) ? 'peito' : 'pés  ';
    for (const D of [5, 8, 11, 14, 18]) {
        const elev = ThrowInModel.elevMin;
        const r = velocidadeDeLancamento(D, ALT_MAOS, alvo, elev, g, ThrowInModel.elevMax * 2);
        if (!r) { erro(`${nome} a ${D} m: sem solução`); continue; }
        const h = alturaA(D, r.v, r.elev, ALT_MAOS);
        const dif = Math.abs(h - alvo);
        if (dif > 0.05) erro(`${nome} a ${D} m: chega a ${h.toFixed(2)} m, alvo ${alvo.toFixed(2)} m`);
        else ok(`${nome} a ${String(D).padStart(2)} m -> chega a ${h.toFixed(2)} m ` +
            `(v=${r.v.toFixed(1)} m/s, elev=${(r.elev * 180 / Math.PI).toFixed(0)}°)`);
    }
}

/*
2 — a fórmula de alcance antiga NÃO acertava. É o defeito que isto corrige, e
fica escrito para ninguém "simplificar" de volta.
*/
{
    const D = 14, elev = ThrowInModel.elevMin;
    const vAntigo = Math.sqrt((D * g) / Math.sin(2 * elev));
    const h = alturaA(D, vAntigo, elev, ALT_MAOS);
    if (Math.abs(h - ALT_PEITO) < 0.3) {
        erro(`a fórmula de alcance já acertava no peito (${h.toFixed(2)} m) — teste inútil`);
    } else {
        ok(`\nfórmula de alcance a ${D} m: chegava a ${h.toFixed(2)} m ` +
            `(alvo do peito ${ALT_PEITO.toFixed(2)} m) — erro de ${Math.abs(h - ALT_PEITO).toFixed(2)} m`);
    }
}

/*
3 — alvo alto e ângulo baixo de mais: sobe o ângulo em vez de devolver NaN.
*/
{
    const r = velocidadeDeLancamento(2.0, 2.0, 6.0, 0.05, g, 80 * Math.PI / 180);
    if (r === null) {
        ok('alvo inalcançável no ângulo pedido -> null (e o chamador cai na fórmula de sempre)');
    } else if (!isFinite(r.v) || r.v <= 0) {
        erro(`devolveu v=${r.v} em vez de null`);
    } else if (r.elev <= 0.05) {
        erro('devolveu solução sem subir o ângulo');
    } else {
        const h = alturaA(2.0, r.v, r.elev, 2.0);
        if (Math.abs(h - 6.0) > 0.05) erro(`subiu o ângulo mas falhou a altura: ${h.toFixed(2)}`);
        else ok(`ângulo subido de 3° para ${(r.elev * 180 / Math.PI).toFixed(0)}° para chegar ao alvo`);
    }
}

/*
4 — o alvo comuta de pés para peito na distância certa.
*/
{
    const alvoPara = d => (d > ThrowInModel.distanciaAosPes) ? 'peito' : 'pés';
    const d = ThrowInModel.distanciaAosPes;
    if (alvoPara(d - 0.1) !== 'pés' || alvoPara(d + 0.1) !== 'peito') {
        erro('o alvo não comuta em distanciaAosPes');
    } else {
        ok(`\nalvo: ${(d - 0.1).toFixed(1)} m -> pés; ${(d + 0.1).toFixed(1)} m -> peito`);
    }
}

/*
5 — sigma do lateral: monótono em TEC e dentro dos limites.
*/
console.log('\ndispersão do lateral por TEC');
{
    let anterior = Infinity;
    for (const tec of [0, 25, 50, 75, 100]) {
        const s = sigmaDeLateral(tec);
        if (s > anterior) erro(`sigma não é monótono: TEC ${tec} deu ${s}`);
        if (s < ThrowInModel.sigmaMin - 1e-9 || s > ThrowInModel.sigmaMax + 1e-9) {
            erro(`sigma fora dos limites em TEC ${tec}: ${s}`);
        }
        anterior = s;
        ok(`TEC ${String(tec).padStart(3)} -> ${(s * 180 / Math.PI).toFixed(2)}°`);
    }
    if (Math.abs(sigmaDeLateral(0) - ThrowInModel.sigmaMax) > 1e-9) erro('TEC 0 devia dar sigmaMax');
    if (Math.abs(sigmaDeLateral(100) - ThrowInModel.sigmaMin) > 1e-9) erro('TEC 100 devia dar sigmaMin');
}

/*
6 — a forma da distribuição do desvio. Com o gerador injectado dá para medir a
média e o desvio padrão, não só esperar que se portem bem.
*/
{
    let semente = 12345;
    const rnd = () => {
        semente = (semente * 1103515245 + 12345) & 0x7fffffff;
        return semente / 0x7fffffff;
    };
    const sigma = sigmaDeLateral(50);
    const N = 20000;
    let soma = 0, soma2 = 0;
    for (let i = 0; i < N; i++) {
        const x = amostraGaussiana(rnd) * sigma;
        soma += x; soma2 += x * x;
    }
    const media = soma / N;
    const desvio = Math.sqrt(soma2 / N - media * media);
    if (Math.abs(media) > sigma * 0.05) erro(`média do desvio ${media.toFixed(4)}, devia ser ~0`);
    else if (Math.abs(desvio - sigma) > sigma * 0.05) {
        erro(`desvio padrão ${desvio.toFixed(4)}, pedido ${sigma.toFixed(4)}`);
    } else {
        ok(`\n${N} amostras a TEC 50: média ${media.toFixed(4)}, ` +
            `desvio ${desvio.toFixed(4)} (pedido ${sigma.toFixed(4)})`);
    }
}

/*
7 — matada no peito: a queda é monótona em TEC, fica nos limites, e a TEC 100
a bola cai MESMO no pé. É o pedido original.
*/
console.log('\nqueda no peito por TEC (sem dispersão)');
{
    let anterior = Infinity;
    for (const tec of [0, 25, 50, 75, 100]) {
        const d = quedaNoPeito(tec, 0);
        if (d > anterior) erro(`queda não é monótona: TEC ${tec} deu ${d}`);
        anterior = d;
        ok(`TEC ${String(tec).padStart(3)} -> ${d.toFixed(2)} m à frente`);
    }
    const noPe = quedaNoPeito(100, 0);
    if (noPe > 0.5) erro(`TEC 100 devia pôr a bola a menos de 0.5 m, deu ${noPe.toFixed(2)}`);
    if (Math.abs(quedaNoPeito(0, 0) - BallControl.peitoQuedaMax) > 1e-9) {
        erro('TEC 0 devia dar peitoQuedaMax');
    }
}

/*
8 — a dispersão nunca sai dos cortes duros.
*/
{
    let fora = 0;
    const min = BallControl.peitoQuedaMin * 0.6, max = BallControl.peitoQuedaMax * 1.3;
    for (const tec of [0, 50, 100]) for (const gauss of [-6, -3, -1, 0, 1, 3, 6]) {
        const d = quedaNoPeito(tec, gauss);
        if (d < min - 1e-9 || d > max + 1e-9) {
            erro(`queda ${d.toFixed(2)} fora de [${min.toFixed(2)}, ${max.toFixed(2)}] ` +
                `com TEC ${tec} e gauss ${gauss}`);
            fora++;
        }
    }
    if (!fora) ok(`\ndispersão sempre dentro de [${min.toFixed(2)}, ${max.toFixed(2)}] m`);
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: lateral mira pés/peito com erro por TEC, e a matada no peito cai no pé.');
