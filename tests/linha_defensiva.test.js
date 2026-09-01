/*
A Linha Defensiva do painel (`TeamShape.linhaDefensiva`) é a ÂNCORA da traseira
do bloco (`bb.bloco.z0`), que é o slot da última linha: a linha põe-se onde o
painel manda, e só recua de lá por uma razão de jogo — o adversário mais
recuado ou o piso do guarda-redes.

Corre o `computeBlock` do js/bt/team_bt.js e a `recuoDaUltimaLinha` do
js/config.js a sério, extraídos por texto, com as globais stubbadas.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcTeam = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8'));
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8')) + '\n' + semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'defense.js'), 'utf8')) + '\n' + semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'physics.js'), 'utf8')) + '\n' + semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'tactics.js'), 'utf8'));

const CAMPO_LARG = 68, CAMPO_COMP = 106, AREA_GRANDE_PROF = 16.5;

// Le um numero simples do BlockShape do config real, pelo nome.
function valorDoConfig(nome) {
    const i = srcConfig.indexOf(nome + ':');
    if (i < 0) throw new Error(nome + ' nao encontrado no config');
    const resto = srcConfig.slice(i + nome.length + 1);
    const v = parseFloat(resto);
    if (!isFinite(v)) throw new Error(nome + ' nao e um numero no config');
    return v;
}

const BlockShape = {
    amplitude: { short: 0.60, median: 0.70, large: 0.80 },
    profundidade: {
        short: 30 / 106, mediumSmall: 40 / 106, median: 50 / 106,
        mediumLarge: 60 / 106, large: 70 / 106
    },
    seguimentoBola: 3.0,
    profundidadeMinima: 20.0,
    /*
    O avanco/recuo do CENTRO do bloco em relacao a bola. Le-se do config a
    serio (nao se copia): se alguem mexer nos 8 m com bola, este teste passa a
    correr com o valor novo em vez de falhar em NaN.
    */
    avancoDoCentroComBola: valorDoConfig('avancoDoCentroComBola'),
    recuoDoCentroSemBola: valorDoConfig('recuoDoCentroSemBola')
};
const TeamShape = { linhaDefensiva: { low: -32.5, medium: -18.25, high: -2.0 } };
const MarkingModel = { distanciaPorPressao: { low: 4.5, balanced: 3.0, high: 1.5 } };

function extrairFuncao(src, nome, ficheiro) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em ${ficheiro}`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

// seguirBola vive em utils.js; aqui basta o comportamento de convergência.
const seguirBola = (atual, alvo, k, dt, imediato) =>
    imediato ? alvo : atual + (alvo - atual) * Math.min(1, k * dt);

const recuoDaUltimaLinha = new Function(
    `${extrairFuncao(srcConfig, 'recuoDaUltimaLinha', 'js/config.js')}; return recuoDaUltimaLinha;`
)();

/*
A escolha do comprimento saiu do computeBlock para funcao propria quando a FASE
passou a mandar nela (a defender e sempre 'short'). Extrai-se do mesmo
ficheiro, para o teste correr a regra a serio e nao uma copia dela.
*/
const Tatics = {
    linhaDefensiva: 'medium', lengthCompactness: 'median',
    compactness: 'median', pressaoDefensiva: 'balanced'
};
const escolherProfundidade = new Function(
    'BlockShape', 'Tatics', 'MentalidadeModel',
    `${extrairFuncao(srcTeam, 'escolherProfundidade', 'js/bt/team_bt.js')}; return escolherProfundidade;`
)(BlockShape, Tatics, undefined);

const sandbox = {
    CAMPO_LARG, CAMPO_COMP, AREA_GRANDE_PROF, BlockShape, TeamShape, MarkingModel,
    seguirBola, recuoDaUltimaLinha, escolherProfundidade,
    Match: { delta: 0.016, state: 'PLAY' },
    Tatics
};
const computeBlock = new Function(
    ...Object.keys(sandbox),
    `${extrairFuncao(srcTeam, 'computeBlock', 'js/bt/team_bt.js')}; return computeBlock;`
)(...Object.values(sandbox));

const jogador = (role, zDir) => ({ role, model: { position: { x: 0, z: zDir } } });

/*
Corre o bloco até o suavizador assentar e devolve a traseira, no referencial de
ataque da equipa (o mesmo do valor do painel).
*/
function traseiraDoBloco(o) {
    sandbox.Tatics.linhaDefensiva = o.linha;
    sandbox.Tatics.lengthCompactness = o.comprimento;
    sandbox.Tatics.pressaoDefensiva = o.pressao || 'balanced';
    const bb = {
        dir: 1, isAttacking: !!o.isAttacking,
        bolaZSuave: o.bolaZDir, bolaXSuave: 0, ballX: 0, blocoZSuave: undefined,
        opp: o.opp || [], own: o.own || []
    };
    let bloco;
    for (let i = 0; i < 400; i++) bloco = computeBlock(bb);
    return bloco;
}

const comprimentos = ['short', 'mediumSmall', 'median', 'mediumLarge', 'large'];
const linhas = ['low', 'medium', 'high'];

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

/*
Caso 1 — sem ninguém a marcar, a traseira É o valor do painel.

Sem adversários e sem guarda-redes não há razão de jogo para recuar, portanto a
âncora manda sozinha, em qualquer Length Compactness e com a bola em qualquer
sítio. É isto que faz o botão comandar.
*/
console.log('traseira do bloco (z0) sem posse, sem adversários — deve ser o valor do painel');
console.log('linha      painel |  ' + comprimentos.map(c => c.padStart(11)).join(''));
for (const linha of linhas) {
    const pedido = TeamShape.linhaDefensiva[linha];
    const celulas = comprimentos.map(c => {
        const z0 = traseiraDoBloco({ linha, comprimento: c, bolaZDir: 20 }).z0;
        const mau = Math.abs(z0 - pedido) > 0.01;
        if (mau) falhas++;
        return `${z0.toFixed(1)}${mau ? ' X' : '  '}`.padStart(11);
    });
    console.log(`${linha.padEnd(7)} ${pedido.toFixed(2).padStart(7)} |  ${celulas.join('')}`);
}

/*
Caso 2 — o botão separa sempre os três níveis.

Era aqui que o defeito aparecia: com Length `large`, `medium` e `high` davam os
dois -20.0.
*/
console.log('\ndiferença entre níveis do painel');
for (const c of comprimentos) {
    const z = linhas.map(l => traseiraDoBloco({ linha: l, comprimento: c, bolaZDir: 20 }).z0);
    const amplitude = z[2] - z[0];
    const mau = z[1] - z[0] < 0.5 || z[2] - z[1] < 0.5;
    if (mau) falhas++;
    console.log(`  ${c.padEnd(12)} low=${z[0].toFixed(1).padStart(6)} ` +
        `medium=${z[1].toFixed(1).padStart(6)} high=${z[2].toFixed(1).padStart(6)} ` +
        `amplitude=${amplitude.toFixed(1).padStart(5)} m${mau ? '   X' : ''}`);
}

/*
Caso 3 — a linha recua por causa do adversário mais recuado.

Um atacante atrás da linha pedida obriga-a a descer para `distancia` metros
atrás dele (Defensive Pressure). Não recuar é deixá-lo nas costas.
*/
console.log('\nrecuo pelo adversário mais recuado (linha pedida: high = -2.0)');
for (const pressao of ['low', 'balanced', 'high']) {
    const dist = MarkingModel.distanciaPorPressao[pressao];
    const atacanteZ = -25;
    const z0 = traseiraDoBloco({
        linha: 'high', comprimento: 'median', bolaZDir: 20, pressao,
        opp: [jogador('gk', -50), jogador('ata', atacanteZ), jogador('mid', 5)]
    }).z0;
    const esperado = atacanteZ - dist;
    const ok = Math.abs(z0 - esperado) < 0.01;
    if (!ok) erro(`pressão ${pressao}: z0=${z0.toFixed(2)}, esperado ${esperado.toFixed(2)}`);
    else console.log(`  pressão ${pressao.padEnd(9)} atacante em ${atacanteZ} -> z0=${z0.toFixed(2)} ` +
        `(${dist} m atrás dele)`);
}

/*
Caso 4 — a linha NÃO recua por um adversário que está à frente dela.

O recuo é o mínimo entre a âncora e o ponto de marcação, nunca uma subida.
*/
{
    const z0 = traseiraDoBloco({
        linha: 'low', comprimento: 'median', bolaZDir: 20,
        opp: [jogador('gk', -50), jogador('ata', 10)]
    }).z0;
    if (Math.abs(z0 - TeamShape.linhaDefensiva.low) > 0.01) {
        erro(`adversário à frente não pode subir a linha: z0=${z0.toFixed(2)}, ` +
            `esperado ${TeamShape.linhaDefensiva.low}`);
    } else {
        console.log(`\nadversário mais recuado em +10 com linha low: z0=${z0.toFixed(2)} (não sobe) OK`);
    }
}

/*
Caso 5 — o piso do guarda-redes ganha ao ponto de marcação.

Com o atacante em cima da baliza, a linha não pode ir para trás do guarda-redes:
o ponto de marcação daria -55, o piso põe-na em gk+1.

O guarda-redes é posto em -34 de propósito, e não em cima da linha de golo: o
bloco não desce abaixo da linha da própria grande área (`minZ` = -36.5), e com o
GK lá atrás o piso ficava fora do alcance e o teste não media nada.
*/
{
    const gkZ = -34;
    const z0 = traseiraDoBloco({
        linha: 'high', comprimento: 'median', bolaZDir: -30,
        opp: [jogador('gk', 50), jogador('ata', -52)],
        own: [jogador('gk', gkZ)]
    }).z0;
    const piso = gkZ + 1.0;
    if (Math.abs(z0 - piso) > 0.01) {
        erro(`piso do guarda-redes: z0=${z0.toFixed(2)}, esperado ${piso.toFixed(2)}`);
    } else {
        console.log(`atacante em -52 com GK em ${gkZ}: z0=${z0.toFixed(2)} (piso gk+1) OK`);
    }
}

/*
Caso 6 — com posse a âncora não se aplica.

O bloco sobe com a jogada; quem trava a frente é o fora-de-jogo.
*/
{
    const comBola = traseiraDoBloco({ linha: 'low', comprimento: 'median', bolaZDir: 20, isAttacking: true }).z0;
    const semBola = traseiraDoBloco({ linha: 'low', comprimento: 'median', bolaZDir: 20 }).z0;
    if (Math.abs(comBola - semBola) < 0.5) {
        erro(`com posse a linha devia deixar de estar ancorada: comBola=${comBola.toFixed(2)}, ` +
            `semBola=${semBola.toFixed(2)}`);
    } else {
        console.log(`com posse: z0=${comBola.toFixed(2)}; sem posse: z0=${semBola.toFixed(2)} OK`);
    }
}

/*
Caso 7 — a profundidade do bloco nunca colapsa.

Quando a linha pedida e o comprimento pedido não cabem até à marca de penálti
adversária, quem cede é a frente — mas nunca abaixo de `profundidadeMinima`.
*/
{
    let mau = 0;
    for (const linha of linhas) for (const c of comprimentos) {
        const b = traseiraDoBloco({ linha, comprimento: c, bolaZDir: 20 });
        const prof = b.z1 - b.z0;
        if (prof < BlockShape.profundidadeMinima - 0.01) {
            erro(`profundidade ${prof.toFixed(1)} m com linha=${linha} length=${c}`);
            mau++;
        }
    }
    if (!mau) console.log(`profundidade do bloco nunca abaixo de ${BlockShape.profundidadeMinima} m OK`);
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: a traseira do bloco assume a Linha Defensiva do painel.');
