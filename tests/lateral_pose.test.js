/*
Gesto do lateral: o giro da cintura acompanha o lado do arremesso, e o clip
está coerente de ponta a ponta.

O fecho das mãos na bola (`fecharMaosNaBola`) não se testa aqui — depende do rig
THREE, que não existe no node. O que se garante aqui é o que é geometria pura: a
curva do giro, os limites, e a integridade dos keyframes.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8'));
const srcPlayer = semCR(fs.readFileSync(path.join(raiz, 'js', 'player.js'), 'utf8'));

function extrairObjecto(src, nome, ficheiro) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em ${ficheiro}`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function('ALTURA_TESTA', 'Math',
        `${src.slice(ini, fim + 3)}; return ${nome};`)(1.62, Math);
}
function extrairFuncao(src, nome, ficheiro) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em ${ficheiro}`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const LateralPose = extrairObjecto(srcConfig, 'LateralPose', 'js/config.js');
const ThrowInClip = extrairObjecto(srcConfig, 'ThrowInClip', 'js/config.js');

const THREE = { MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } };
const amostrarClipLateral = new Function('ThrowInClip', 'THREE',
    `${extrairFuncao(srcPlayer, 'amostrarClipLateral', 'js/player.js')}; return amostrarClipLateral;`
)(ThrowInClip, THREE);

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

/*
1 — todos os keyframes têm todos os campos. Um `undefined` a meio do clip vira
NaN no rig e o boneco desaparece.
*/
const campos = ['chest', 'pelvisX', 'bracoX', 'bracoZ', 'cotovelo', 'giro',
    'coxaFrente', 'joelhoFrente', 'coxaTras', 'joelhoTras', 'altura'];
ThrowInClip.frames.forEach((f, i) => {
    for (const c of campos) {
        if (typeof f[c] !== 'number' || !isFinite(f[c])) {
            erro(`keyframe ${i + 1} sem \`${c}\` (${f[c]})`);
        }
    }
});
console.log(`clip do lateral: ${ThrowInClip.frames.length} keyframes, ` +
    `${campos.length} campos cada, todos presentes`);

/*
2 — a CINTURA carrega para trás na armação e vira para o lado do arremesso no
chicote. É a assinatura do gesto: sem o valor negativo antes do contacto, a
cintura não "carrega", só acompanha.
*/
const contacto = ThrowInClip.contactFrame - 1;   // o campo é 1-based
const giros = ThrowInClip.frames.map(f => f.giro);
const minAntes = Math.min(...giros.slice(0, contacto));
const maxDepois = Math.max(...giros.slice(contacto));

console.log('\ngiro da cintura ao longo do gesto (fracção do ângulo ao alvo)');
console.log('  ' + giros.map((g, i) => `${i + 1}:${g.toFixed(2)}`).join('  '));

if (!(minAntes < -0.2)) {
    erro(`a cintura não carrega para trás antes do contacto (mínimo ${minAntes})`);
} else {
    console.log(`  carrega até ${minAntes.toFixed(2)} antes do contacto (keyframe ${contacto + 1})`);
}
if (!(maxDepois >= 1.0 - 1e-9)) {
    erro(`a cintura não chega ao ângulo cheio no chicote (máximo ${maxDepois})`);
} else {
    console.log(`  chega a ${maxDepois.toFixed(2)} no chicote`);
}
if (giros[0] !== 0 || giros[giros.length - 1] !== 0) {
    erro('o gesto tem de começar e acabar com a cintura a zero');
}

/*
3 — os braços estão FECHADOS enquanto a bola está nas mãos.

`bracoZ` positivo é abdução (abre); negativo é adução (fecha). Até largar a
bola tem de ser negativo — era 0.05, positivo, e as mãos ficavam à largura dos
ombros com a bola a flutuar entre elas.
*/
console.log('\nabertura dos braços (bracoZ; negativo = fechado)');
let algumAberto = 0;
for (let i = 0; i <= contacto; i++) {
    const z = ThrowInClip.frames[i].bracoZ;
    if (z > 0) { erro(`keyframe ${i + 1} tem os braços abertos (bracoZ=${z})`); algumAberto++; }
}
if (!algumAberto) {
    const zs = ThrowInClip.frames.slice(0, contacto + 1).map(f => f.bracoZ);
    console.log(`  até largar a bola: de ${Math.max(...zs).toFixed(2)} a ` +
        `${Math.min(...zs).toFixed(2)} — todos fechados`);
}
if (LateralPose.bracoZ > 0) {
    erro(`LateralPose.bracoZ=${LateralPose.bracoZ} abre os braços na pose de espera`);
} else {
    console.log(`  pose de espera: ${LateralPose.bracoZ.toFixed(2)}`);
}

/*
4 — a interpolação devolve o giro, e é contínua.
*/
{
    let anterior = null, saltoMax = 0;
    for (let i = 0; i <= 100; i++) {
        const K = amostrarClipLateral(i / 100);
        if (typeof K.giro !== 'number' || !isFinite(K.giro)) {
            erro(`amostrarClipLateral(${(i / 100).toFixed(2)}) não devolve giro`);
            break;
        }
        if (anterior !== null) saltoMax = Math.max(saltoMax, Math.abs(K.giro - anterior));
        anterior = K.giro;
    }
    // 1/100 do gesto não pode saltar mais do que um passo entre keyframes.
    const maiorPasso = Math.max(...giros.slice(1).map((g, i) => Math.abs(g - giros[i])));
    if (saltoMax > maiorPasso / 2) {
        erro(`o giro salta ${saltoMax.toFixed(3)} entre amostras vizinhas`);
    } else {
        console.log(`\ninterpolação contínua: maior salto entre amostras ${saltoMax.toFixed(3)}`);
    }
}

/*
5 — o tecto do giro existe e é sóbrio. Acima de ~45° a cintura deixa de ser
uma cintura.
*/
if (!(LateralPose.giroMax > 0 && LateralPose.giroMax <= 0.8)) {
    erro(`LateralPose.giroMax=${LateralPose.giroMax} fora do razoável (0, 0.8]`);
} else {
    console.log(`tecto do giro: ${LateralPose.giroMax} rad ` +
        `(${(LateralPose.giroMax * 180 / Math.PI).toFixed(0)}°)`);
}

/*
6 — as constantes do fecho das mãos existem e são sãs.
*/
for (const [k, min, max] of [['fechoIteracoes', 1, 12], ['fechoLimite', 0.05, 1.5],
    ['fechoTolerancia', 0.001, 0.05]]) {
    const v = LateralPose[k];
    if (typeof v !== 'number' || v < min || v > max) {
        erro(`LateralPose.${k}=${v} fora de [${min}, ${max}]`);
    }
}
if (!/fecharMaosNaBola/.test(srcPlayer)) erro('fecharMaosNaBola desapareceu do player.js');
if (!/colarBolaAsMaos/.test(srcPlayer)) erro('colarBolaAsMaos desapareceu do player.js');

/*
7 — a bola fica ACIMA do ponto medio das maos, e o offset e so isso: um
deslocamento pequeno, nao meia altura de jogador.
*/
{
    const off = LateralPose.bolaAcimaDasMaos;
    if (typeof off !== 'number' || off <= 0 || off > 0.30) {
        erro(`LateralPose.bolaAcimaDasMaos=${off} fora de (0, 0.30]`);
    } else {
        console.log(`bola ${(off * 100).toFixed(0)} cm acima do ponto medio das maos`);
    }
    if (LateralPose.bolaAltura !== undefined || LateralPose.bolaRecuo !== undefined) {
        erro('bolaAltura/bolaRecuo voltaram — a bola nao pode ter altura absoluta');
    }
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: braços fechados na bola e cintura a girar para o lado do arremesso.');
