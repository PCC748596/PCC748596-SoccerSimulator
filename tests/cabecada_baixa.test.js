/*
Fora da zona de remate a cabeçada tem de ir PARA BAIXO — bater no chão perto e
sair rasteira, em vez de subir e voltar a cair à altura da testa do jogador
seguinte, que era o que alimentava o ping-pong aéreo.

A medida que interessa é o TEMPO E A DISTÂNCIA ATÉ AO PRIMEIRO RESSALTO e a
altura máxima da trajectória: uma bola que nunca volta a passar por
ALTURA_TESTA não pode ser cabeceada outra vez.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'shooting.js'), 'utf8')) + '\n' + semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'physics.js'), 'utf8')) + '\n' + semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'player_behavior.js'), 'utf8'));
const srcPlayer = semCR(fs.readFileSync(path.join(raiz, 'js', 'player.js'), 'utf8'));

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

const HeaderModel = extrairObjecto(srcConfig, 'HeaderModel', 'js/config.js');
const BallPhysics = {
    raio: 0.11, gravidade: 9.81, densidadeAr: 1.225, cd: 0.25, massa: 0.430,
    restituicao: 0.60, atritoRessalto: 0.75
};
BallPhysics.kArrasto = 0.5 * BallPhysics.densidadeAr * BallPhysics.cd *
    (Math.PI * BallPhysics.raio ** 2) / BallPhysics.massa;

const ALTURA_CABECA = 1.72, ALTURA_TESTA = ALTURA_CABECA - 0.10;

const velocidadeDeLancamento = new Function('BallPhysics',
    extrairFuncao(srcUtils,'velocidadeDeLancamento','js/utils.js')+'; return velocidadeDeLancamento;')(BallPhysics);
const velocidadeParaAlcance = new Function('BallPhysics',
    `${extrairFuncao(srcUtils, 'velocidadeParaAlcance', 'js/utils.js')}; return velocidadeParaAlcance;`
)(BallPhysics);

/*
Voa a bola a partir da testa e devolve a altura máxima, e onde/quando toca o
chão pela primeira vez.
*/
function voo(dist, elev) {
    const bal = velocidadeDeLancamento(dist, ALTURA_TESTA, BallPhysics.raio, elev, BallPhysics.gravidade);
    const v = Math.min(bal ? bal.v : velocidadeParaAlcance(dist, elev), HeaderModel.velocidadeMax);
    elev = bal ? bal.elev : elev;
    const g = BallPhysics.gravidade, k = BallPhysics.kArrasto, r = BallPhysics.raio;
    let x = 0, y = ALTURA_TESTA, vx = v * Math.cos(elev), vy = v * Math.sin(elev);
    const dt = 1 / 240;
    let alturaMax = y;
    for (let i = 0; i < 4000; i++) {
        const s = Math.hypot(vx, vy);
        if (s > 0.001) { const dv = k * s * s * dt; vx -= vx / s * dv; vy -= vy / s * dv; }
        vy -= g * dt;
        x += vx * dt; y += vy * dt;
        if (y > alturaMax) alturaMax = y;
        if (y <= r) return { v, alturaMax, distChao: x, tempoChao: i * dt };
    }
    return { v, alturaMax, distChao: Infinity, tempoChao: Infinity };
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

const elevBaixa = HeaderModel.elevacaoEscora;
const tecto = HeaderModel.alcanceAlivioBaixo;

console.log('cabeçada fora da zona de remate (parte de ALTURA_TESTA = ' +
    ALTURA_TESTA.toFixed(2) + ' m)');
console.log('  dist  ângulo  v saída  altura máx  bate no chão a  ao fim de');
for (const d of [4, 7, 9, tecto]) {
    const r = voo(d, elevBaixa);
    console.log(`  ${d.toFixed(1).padStart(4)} m  ${(elevBaixa * 180 / Math.PI).toFixed(0).padStart(3)}°  ` +
        `${r.v.toFixed(1).padStart(6)} m/s  ${r.alturaMax.toFixed(2).padStart(8)} m  ` +
        `${r.distChao.toFixed(1).padStart(12)} m  ${r.tempoChao.toFixed(2).padStart(7)} s`);

    /*
    A bola não pode subir acima da testa: se subir, volta a passar pela altura
    de cabeceio na descida e o ping-pong recomeça.
    */
    if (r.alturaMax > ALTURA_TESTA + 0.05) {
        erro(`a ${d} m a bola sobe até ${r.alturaMax.toFixed(2)} m, acima da testa`);
    }
    if (r.v > HeaderModel.velocidadeMax + 0.01) {
        erro(`a ${d} m sai a ${r.v.toFixed(1)} m/s, acima do tecto de ${HeaderModel.velocidadeMax}`);
    }
    // E tem de chegar ao chão depressa, senão anda no ar à espera do próximo.
    if (r.tempoChao > 1.2) {
        erro(`a ${d} m demora ${r.tempoChao.toFixed(2)} s a chegar ao chão`);
    }
}

/*
O ângulo antigo do alívio, para o teste dizer de quanto foi a diferença. 28°
era o `elevacaoAlivio`, removido.
*/
{
    const antigo = 28 * Math.PI / 180;
    const r = voo(16.0, antigo);
    console.log(`\n  antes (alívio a 28°, 16 m): sobe a ${r.alturaMax.toFixed(2)} m ` +
        `e só chega ao chão ${r.tempoChao.toFixed(2)} s depois`);
    if (r.alturaMax <= ALTURA_TESTA + 0.05) {
        erro('o ângulo antigo já não subia acima da testa — o teste não mede nada');
    }
}

/*
O `elevacaoAlivio` tem de continuar removido: é a única forma de garantir que
ninguém lhe volta a pegar.
*/
if (HeaderModel.elevacaoAlivio !== undefined) {
    erro('HeaderModel.elevacaoAlivio voltou a existir');
}
if (/elevacaoAlivio\s*\|\|/.test(srcPlayer)) {
    erro('js/player.js voltou a usar elevacaoAlivio');
}

/*
8 — DUAS CABEÇADAS SEGUIDAS DO MESMO JOGADOR.

A distância pedida era `min(distância ao colega, alcanceAlivioBaixo)`, sem
mínimo: com um colega a 1 m a balística resolvia para **1.93 m/s**, e em 0.35 s
— o `BallControl.touchLock` — a bola percorria 66 cm e ficava à frente da cara
de quem a cabeceou, ainda à altura da testa. Passado o lock, ele cabeceava
outra vez.

Mede-se onde a bola está quando o lock acaba: tem de estar fora do alcance de
contacto do próprio cabeceador, OU fora da janela de altura do cabeceio.
*/
{
    const BallControl = extrairObjecto(srcConfig, 'BallControl', 'js/config.js');
    const alcanceContacto = BallControl.reach;

    console.log(`\nposição da bola quando o touchLock (${BallControl.touchLock} s) acaba`);
    console.log('  colega a   dist pedida   v saída   bola a   altura   pode recabecear?');

    let maus = 0;
    for (const dColega of [0.5, 1, 2, 3.5, 5, 8, 12]) {
        const distDesejada = Math.max(HeaderModel.alcanceMin,
            Math.min(dColega, HeaderModel.alcanceAlivioBaixo));
        const bal = velocidadeDeLancamento(distDesejada, ALTURA_TESTA, BallPhysics.raio,
            HeaderModel.elevacaoEscora, BallPhysics.gravidade);
        const v = Math.max(HeaderModel.velocidadeMin,
            Math.min(bal ? bal.v : 0, HeaderModel.velocidadeMax));
        const ang = bal ? bal.elev : HeaderModel.elevacaoEscora;

        // Integra até ao fim do touchLock, com ressalto no chão.
        const g = BallPhysics.gravidade, k = BallPhysics.kArrasto, r = BallPhysics.raio;
        let x = 0, y = ALTURA_TESTA, vx = v * Math.cos(ang), vy = v * Math.sin(ang);
        const dt = 1 / 480;
        for (let i = 0; i < Math.round(BallControl.touchLock / dt); i++) {
            const s = Math.hypot(vx, vy);
            if (s > 0.001) { const dv = k * s * s * dt; vx -= vx / s * dv; vy -= vy / s * dv; }
            if (y > r + 0.001) vy -= g * dt;
            x += vx * dt; y += vy * dt;
            if (y <= r) {
                y = r;
                if (vy < 0) {
                    if (-vy > BallPhysics.restituicao * 0 + 0.6) {
                        vy *= -BallPhysics.restituicao; vx *= BallPhysics.atritoRessalto;
                    } else vy = 0;
                }
            }
        }

        // Ele pode voltar a cabecear se a bola ainda estiver ao alcance E na
        // janela de altura da testa.
        const naJanela = Math.abs(y - ALTURA_TESTA) <= HeaderModel.janelaContacto;
        const aoAlcance = x <= alcanceContacto;
        const recabeceia = naJanela && aoAlcance;
        if (recabeceia) maus++;

        console.log(`  ${dColega.toFixed(1).padStart(5)} m   ${distDesejada.toFixed(1).padStart(6)} m   ` +
            `${v.toFixed(2).padStart(6)}   ${x.toFixed(2).padStart(5)} m   ${y.toFixed(2)} m   ` +
            `${recabeceia ? 'SIM  X' : 'não'}`);
    }
    if (maus > 0) {
        erro(`${maus} casos em que o mesmo jogador volta a ter a bola na testa ` +
            `assim que o touchLock acaba`);
    } else {
        console.log('  nunca: a bola sai sempre do alcance ou da altura da testa');
    }

    // E o piso de velocidade tem de existir mesmo.
    if (!(HeaderModel.velocidadeMin > 0 && HeaderModel.velocidadeMin < HeaderModel.velocidadeMax)) {
        erro(`HeaderModel.velocidadeMin=${HeaderModel.velocidadeMin} inválido`);
    }
    if (!(HeaderModel.alcanceMin > 0 && HeaderModel.alcanceMin < HeaderModel.alcanceAlivioBaixo)) {
        erro(`HeaderModel.alcanceMin=${HeaderModel.alcanceMin} inválido`);
    }
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: cabeçada para baixo, com pancada, e sem recabeceio do mesmo jogador.');
