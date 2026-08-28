/*
A cobrança de falta tem três desfechos, decididos só pela posição da bola:

  'remate'      dentro do TRAPÉZIO — até 23 m do centro da baliza E dentro das
                rectas que saem dos POSTES a 30° da PERPENDICULAR à linha de
                fundo.
  'cruzamento'  ao lado da grande área e perto da linha de fundo (mini-canto).
  'passe'       o resto.

A `decisaoDeFalta` é extraída do js/utils.js e
corridas a sério, com as constantes lidas do js/config.js.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'shooting.js'), 'utf8')) + '\n' + semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'physics.js'), 'utf8'));

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

const FreeKickModel = extrairObjecto(srcConfig, 'FreeKickModel', 'js/config.js');
const CAMPO_COMP = 106, LARGURA_BALIZA = 7.32;

const ambiente = { FreeKickModel, CAMPO_COMP, LARGURA_BALIZA };
const decisaoDeFalta = new Function(...Object.keys(ambiente),
    `${extrairFuncao(srcUtils, 'decisaoDeFalta', 'js/utils.js')}; return decisaoDeFalta;`
)(...Object.values(ambiente));

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

const meiaBaliza = LARGURA_BALIZA / 2;
const tan30 = Math.tan(FreeKickModel.remateAnguloTrave);

// Posição a `dFundo` metros da linha de fundo atacada, para os dois sentidos.
const posicao = (x, dFundo, attDir) => ({ x, z: attDir * (CAMPO_COMP / 2) - attDir * dFundo });
const decidir = (x, dFundo, attDir) => {
    const p = posicao(x, dFundo, attDir);
    return decisaoDeFalta(p.x, p.z, attDir);
};

/*
1 — a fronteira da zona, dos dois lados e nos dois sentidos de ataque.

A zona é a INTERSECÇÃO das duas condições: o trapézio dos 30° E o arco dos 23 m
do centro da baliza. Perto da linha manda o trapézio; a partir dos ~19 m o arco
corta-lhe os cantos, e é ele que manda. As duas condições são o que foi pedido
("<= 23 metros num ângulo de 30 graus"), e o resultado é um trapézio de topo
arredondado.
*/
console.log('zona de remate directo (trapézio de 30° cortado pelo arco dos 23 m)');
const meiaLarguraEfectiva = (dFundo) => {
    const doTrapezio = meiaBaliza + dFundo * tan30;
    // Onde o arco corta: x tal que hypot(x, dFundo) = 23.
    const doArco = (dFundo >= FreeKickModel.remateDistMax) ? -1
        : Math.sqrt(FreeKickModel.remateDistMax ** 2 - dFundo ** 2);
    return Math.min(doTrapezio, doArco);
};

for (const attDir of [1, -1]) {
    for (const dFundo of [5, 10, 16, 19, 20, 22.5]) {
        const meiaLargura = meiaLarguraEfectiva(dFundo);
        if (meiaLargura <= 0) continue;

        for (const sinal of [1, -1]) {
            const dentro = decidir(sinal * (meiaLargura - 0.3), dFundo, attDir);
            if (dentro !== 'remate') {
                erro(`attDir=${attDir} d=${dFundo}: x=${(sinal * (meiaLargura - 0.3)).toFixed(1)} ` +
                    `devia ser remate, deu ${dentro}`);
            }
            const fora = decidir(sinal * (meiaLargura + 0.3), dFundo, attDir);
            if (fora === 'remate') {
                erro(`attDir=${attDir} d=${dFundo}: x=${(sinal * (meiaLargura + 0.3)).toFixed(1)} ` +
                    `está fora da zona e deu remate`);
            }
        }
        if (attDir === 1) {
            const manda = (meiaBaliza + dFundo * tan30) <= meiaLargura + 1e-9 ? 'trapézio' : 'arco';
            console.log(`  a ${String(dFundo).padStart(4)} m da linha: remata-se até ` +
                `|x| = ${meiaLargura.toFixed(1)} m (largura ${(2 * meiaLargura).toFixed(1)} m, ` +
                `manda o ${manda})`);
        }
    }
}

/*
2 — o corte da distância. De frente para a baliza, 23 m remata e 24 não.
*/
for (const attDir of [1, -1]) {
    if (decidir(0, FreeKickModel.remateDistMax - 0.2, attDir) !== 'remate') {
        erro(`de frente a ${FreeKickModel.remateDistMax - 0.2} m devia rematar`);
    }
    if (decidir(0, FreeKickModel.remateDistMax + 0.5, attDir) === 'remate') {
        erro(`de frente a ${FreeKickModel.remateDistMax + 0.5} m NÃO devia rematar`);
    }
}
console.log(`  corte da distância: ${FreeKickModel.remateDistMax} m do centro da baliza`);

/*
3 — mini-canto ao lado da área.
*/
console.log('\nmini-canto (ao lado da área, perto da linha de fundo)');
for (const attDir of [1, -1]) {
    for (const sinal of [1, -1]) {
        const x = sinal * (FreeKickModel.miniCornerXMin + 1.0);
        const d = decidir(x, 8, attDir);
        if (d !== 'cruzamento') erro(`x=${x.toFixed(1)} a 8 m da linha devia cruzar, deu ${d}`);

        /*
        NOTA: a zona de cruzamento deixou de ser só o mini-canto. A falta
        lateral junto à área (`cruzXMin`, mais para dentro, e até
        `cruzProfundidade`, mais fundo) também cruza — ver os quatro alvos em
        FreeKickModel.cruzamentos. Por isso o que aqui se testa é o LIMITE
        dessa zona maior, e já não o do mini-canto.
        */
        const longe = decidir(x, FreeKickModel.cruzProfundidade + 4, attDir);
        if (longe === 'cruzamento') {
            erro(`x=${x.toFixed(1)} a ${FreeKickModel.cruzProfundidade + 4} m ` +
                `é fundo de mais para cruzar, deu ${longe}`);
        }
        // Dentro do corredor central não se cruza: dali remata-se ou passa-se.
        const dentroX = decidir(sinal * (FreeKickModel.cruzXMin - 4.0), 12, attDir);
        if (dentroX === 'cruzamento') {
            erro(`x=${(sinal * (FreeKickModel.cruzXMin - 4)).toFixed(1)} é corredor central, não lateral`);
        }
    }
}
console.log(`  |x| >= ${FreeKickModel.miniCornerXMin} e até ` +
    `${FreeKickModel.miniCornerProfundidade} m da linha de fundo`);

/*
4 — o trapézio ganha ao mini-canto onde os dois se sobrepõem.

Perto da linha de fundo o trapézio é estreito, portanto não há sobreposição
real; mas a ordem tem de estar garantida na mesma. A 22 m o trapézio chega a
|x| = 16.4, e o mini-canto começa em 20.16: não colidem.
*/
{
    const larguraA22 = meiaBaliza + 22 * tan30;
    if (larguraA22 >= FreeKickModel.miniCornerXMin) {
        console.log(`\n  nota: o trapézio (|x| até ${larguraA22.toFixed(1)}) sobrepõe-se ao ` +
            `mini-canto (|x| >= ${FreeKickModel.miniCornerXMin}) — o remate ganha`);
        if (decidir(FreeKickModel.miniCornerXMin + 0.5, 22, 1) !== 'remate') {
            erro('na sobreposição o remate tinha de ganhar');
        }
    } else {
        console.log(`\n  o trapézio (|x| até ${larguraA22.toFixed(1)} a 22 m) e o mini-canto ` +
            `(|x| >= ${FreeKickModel.miniCornerXMin}) não se sobrepõem`);
    }
}

/*
5 — o resto é passe: meio-campo, longe da baliza.
*/
for (const attDir of [1, -1]) {
    // Longe da baliza: fora da zona de cruzamento (`cruzProfundidade`) e fora
    // do trapézio de remate.
    for (const [x, d] of [[0, 40], [15, 33], [-25, 35], [30, 45]]) {
        const r = decidir(x, d, attDir);
        if (r !== 'passe') erro(`x=${x} a ${d} m da linha devia ser passe, deu ${r}`);
    }
}
console.log('  o resto do campo: passe');

/*
6 — OS QUATRO CRUZAMENTOS. Primeira trave, segunda trave, marca do penálti e
entrada da área a meia altura. O que se fixa é o que os distingue: para onde
vão e a que ALTURA lá chegam — não a força de saída, que é consequência.
*/
{
    console.log('');
    console.log('os quatro alvos do cruzamento da falta');
    const nomes = FreeKickModel.cruzamentos.map(c => c.nome);
    for (const esperado of ['primeira_trave', 'segunda_trave', 'marca_penalti', 'entrada_da_area']) {
        if (nomes.indexOf(esperado) < 0) erro(`falta o alvo ${esperado}`);
    }

    const alto = FreeKickModel.cruzamentos.filter(c => c.altura >= 2.0);
    if (alto.length !== 3) erro(`deviam ser TRÊS cruzamentos pelo alto, são ${alto.length}`);

    const meia = FreeKickModel.cruzamentos.find(c => c.nome === 'entrada_da_area');
    if (!(meia.altura > 0.6 && meia.altura < 1.6)) {
        erro(`a entrada da área é MEIA ALTURA, não ${meia.altura} m`);
    }
    if (!(meia.elevacao < 20 * Math.PI / 180)) {
        erro('a bola para a entrada da área tem de sair TENSA, não chapelada');
    }
    if (!(meia.dist > 15)) erro('a entrada da área não pode estar dentro da pequena área');

    const p1 = FreeKickModel.cruzamentos.find(c => c.nome === 'primeira_trave');
    const p2 = FreeKickModel.cruzamentos.find(c => c.nome === 'segunda_trave');
    if (Math.sign(p1.relX) === Math.sign(p2.relX)) {
        erro('as duas traves têm de ficar em lados OPOSTOS do eixo da baliza');
    }
    if (!(Math.abs(p1.relX) > 2.5 && Math.abs(p1.relX) < 5.0)) {
        erro(`a primeira trave está em ${p1.relX}, e o poste está em 3.66`);
    }

    const pen = FreeKickModel.cruzamentos.find(c => c.nome === 'marca_penalti');
    if (Math.abs(pen.dist - 11.0) > 1.5) erro(`a marca do penálti é a 11 m, não a ${pen.dist}`);
    if (Math.abs(pen.relX) > 0.5) erro('a marca do penálti é no eixo');

    for (const c of FreeKickModel.cruzamentos) {
        console.log(`  ${c.nome.padEnd(16)} relX=${c.relX} dist=${c.dist} m ` +
            `chega a ${c.altura} m, elevação ${(c.elevacao * 180 / Math.PI).toFixed(0)}°`);
    }
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: falta decide entre remate directo, mini-canto e passe.');
