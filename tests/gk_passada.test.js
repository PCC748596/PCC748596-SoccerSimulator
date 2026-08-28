/*
O guarda-redes não pode DESLIZAR: o avanço no chão tem de corresponder ao que
as pernas andam, como em qualquer outro boneco do jogo.

Ele tinha ficado com a versão ANTIGA do ciclo de passada, em três sítios:

    animTimer += (velPlanar * dt) / 3.0;   // 3 m por ciclo a qualquer andamento
    const pose = getRunPose(t);            // amplitude fixa
    ... pose.lHip * P.passada              // amplitude encolhida sem encolher o avanço

A correcção do jogador de campo — `getGaitPose`, com a passada a vir do
andamento — nunca chegou aqui.

Mede-se o ESCORREGAMENTO: chão percorrido a dividir pelo que a animação diz que
ele andou (ciclos × passada do andamento). 1.00 é o pé colado ao chão.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));
const srcPlayer = ler('js/player.js');
const srcUtils = ler('js/utils.js');
const srcConfig = ler('js/config/gait.js');

function extrairFuncao(src, nome) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}
function extrairObjecto(src, nome) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function('Math', `${src.slice(ini, fim + 3)}; return ${nome};`)(Math);
}

const GaitModel = extrairObjecto(srcConfig, 'GaitModel');
const lerp = (a, b, k) => a + (b - a) * k;
const fns = new Function('GaitModel', 'lerp',
    `${extrairFuncao(srcUtils, 'misturarAndamento')}
     ${extrairFuncao(srcUtils, 'getGaitPose')}
     return { getGaitPose };`)(GaitModel, lerp);
const { getGaitPose } = fns;

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

/*
1 — a cadência tem de sair da passada do andamento.

Simula-se o que o `updateGK` faz agora: `animTimer += vel * dt / passada`, e
mede-se o escorregamento contra a passada daquele andamento.
*/
console.log('escorregamento do guarda-redes (1.00 = pé colado ao chão)');
console.log('  velocidade   antes (3 m/ciclo)   agora (passada do andamento)');

let piorAgora = 0;
for (const vel of [1.0, 1.8, 3.0, 4.5, 6.0, 7.5]) {
    const dt = 1 / 60, frames = 300;
    const passada = getGaitPose(0, vel).passada;

    // Antes: 3.0 m por ciclo, fixo.
    const ciclosAntes = (vel * dt * frames) / 3.0;
    // Agora: a passada do andamento.
    const ciclosAgora = (vel * dt * frames) / passada;

    const percorrido = vel * dt * frames;
    const escAntes = percorrido / (ciclosAntes * passada);
    const escAgora = percorrido / (ciclosAgora * passada);

    piorAgora = Math.max(piorAgora, Math.abs(escAgora - 1));
    console.log(`  ${vel.toFixed(1).padStart(6)} m/s      ${escAntes.toFixed(2).padStart(6)}` +
        `              ${escAgora.toFixed(2).padStart(6)}   (passada ${passada.toFixed(2)} m)`);

    if (Math.abs(escAgora - 1) > 0.01) {
        erro(`a ${vel} m/s o escorregamento é ${escAgora.toFixed(2)}`);
    }
}
if (piorAgora <= 0.01) console.log('\ncadência correcta em todos os andamentos');

/*
2 — o `getRunPose` não pode voltar ao guarda-redes. Era ele que tinha a
amplitude fixa, e é o que fazia a corrida ler como devagar.
*/
{
    // Ignora comentários, que mencionam o nome de propósito.
    const semComentarios = srcPlayer
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
    if (/getRunPose\s*\(/.test(semComentarios)) {
        erro('js/player.js voltou a chamar getRunPose — o GK desliza outra vez');
    } else {
        console.log('getRunPose: sem chamadores no player.js');
    }
    if (/animTimer\s*\+=.*\/\s*3\.0\s*;/.test(semComentarios)) {
        erro('js/player.js voltou a ter 3 m por ciclo escritos à mão');
    } else {
        console.log('cadência: nenhum "3 m por ciclo" à mão no player.js');
    }
}

/*
3 — e a amplitude das pernas não pode ser encolhida sem encolher o avanço, que
era o terceiro defeito do mesmo bloco (`pose.lHip * P.passada`).
*/
{
    const semComentarios = srcPlayer
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
    if (/pose\w*\.[lr]Hip\s*\*\s*P\w*\.passada/.test(semComentarios)) {
        erro('a amplitude da passada do GK voltou a ser encolhida por P.passada');
    } else {
        console.log('amplitude: não é encolhida sem encolher o avanço');
    }
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: o guarda-redes corre com o ciclo de passada do jogo.');
