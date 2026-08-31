/*
TESTE: Acompanhamento da linha da bola pela linha de defesa na saída de jogo.

A linha de defesa tem de acompanhar a linha da bola na saída de jogo e na progressão
cerca de 3 metros atrás até ao círculo central (meio-campo), evitando que os defesas
fiquem desgarrados 15 a 20 metros para trás durante a construção de jogo.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcTeam = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8'));
const srcTactics = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'tactics.js'), 'utf8'));

const CAMPO_LARG = 68, CAMPO_COMP = 106;
const THREE = {
    MathUtils: {
        clamp: (val, min, max) => Math.max(min, Math.min(max, val))
    }
};

const LineShape = {
    def: { comBola: 0.05, semBola: -0.03 },
    mid: { comBola: 0.01, semBola: -0.07 },
    atk: { comBola: -0.04, semBola: -0.13 },
    fecho: {
        def: { comBola: 0.92, semBola: 0.78 },
        mid: { comBola: 1.00, semBola: 0.88 },
        atk: { comBola: 1.00, semBola: 0.80 }
    }
};

const PositionDepthNudge = {
    LB: { comBola: 0.04, semBola: 0.0 },
    RB: { comBola: 0.04, semBola: 0.0 },
    RM: { comBola: 0.08, semBola: 0.0 },
    LM: { comBola: 0.08, semBola: 0.0 }
};

const FullBackStyle = {
    balanced: { comBolaMult: 1.0 },
    defensive: { comBolaMult: 0.2 },
    offensive: { comBolaMult: 1.8 }
};

const TeamShape = {
    linhaDefensiva: { low: -32.5, medium: -18.25, high: -2.0 },
    distanciaDefesaSaida: 3.0,
    limiteSaidaCirculoCentral: 0.0
};

const Tatics = {
    estilo: 'equilibrada',
    linhaDefensiva: 'medium',
    compactness: 'median',
    lengthCompactness: 'median'
};

function extrairFuncao(src, nome) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const deslocamentoDeCorredor = () => 0;

// O `limitesDoBloco` entra junto: é dele que sai a moldura que o slot passou a
// respeitar (ver o corte no fim do ramo isAttacking, team_bt.js).
const calcularPontoDoSlot = new Function(
    'CAMPO_LARG', 'CAMPO_COMP', 'THREE', 'LineShape', 'PositionDepthNudge', 'FullBackStyle', 'TeamShape', 'Tatics', 'deslocamentoDeCorredor',
    `${extrairFuncao(srcTeam, 'limitesDoBloco')}
     ${extrairFuncao(srcTeam, 'calcularPontoDoSlot')}; return calcularPontoDoSlot;`
)(CAMPO_LARG, CAMPO_COMP, THREE, LineShape, PositionDepthNudge, FullBackStyle, TeamShape, Tatics, deslocamentoDeCorredor);

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

console.log('\n1 — Acompanhamento da linha da bola na saída de jogo');
{
    const profundidade = 50;
    const centroZ = -30 + 5.0; // bola em -30m
    const bb = {
        dir: 1,
        isAttacking: true,
        bolaZSuave: -30,
        ballX: 0,
        bloco: {
            x0: -20, x1: 20,
            z0: centroZ - profundidade / 2, // -50
            z1: centroZ + profundidade / 2  // 0
        }
    };

    const slotCB = { u: 0.5, v: 0.0 };
    const posCB = calcularPontoDoSlot(slotCB, 'CB', 'def', 'balanced', bb);

    // Bola em -30m, o CB deve estar a ~3m atrás (-33m), e não a -47.5m
    const zEsperado = -33.0;
    const diff = Math.abs(posCB.z - zEsperado);
    if (diff > 0.5) {
        erro(`CB em saída de jogo: obtido ${posCB.z.toFixed(2)} m, esperado ~${zEsperado} m`);
    } else {
        ok(`CB a -30m na saída fica em ${posCB.z.toFixed(2)} m (3 m atrás da bola)`);
    }
}

console.log('\n2 — Progressão contínua da linha de defesa até ao círculo central');
{
    const profundidade = 50;
    const testPoints = [-35, -25, -15, -5, 0];
    for (const bz of testPoints) {
        const centroZ = bz + 5.0;
        const bb = {
            dir: 1,
            isAttacking: true,
            bolaZSuave: bz,
            ballX: 0,
            bloco: {
                x0: -20, x1: 20,
                z0: centroZ - profundidade / 2,
                z1: centroZ + profundidade / 2
            }
        };

        const slotCB = { u: 0.5, v: 0.0 };
        const posCB = calcularPontoDoSlot(slotCB, 'CB', 'def', 'balanced', bb);
        const zEsperado = Math.min(bz - 3.0, 0.0);
        const diff = Math.abs(posCB.z - zEsperado);
        if (diff > 0.5) {
            erro(`Bola em ${bz} m: CB em ${posCB.z.toFixed(2)} m, esperado ${zEsperado.toFixed(2)} m`);
        } else {
            ok(`Bola em ${bz.toString().padStart(3)} m -> CB em ${posCB.z.toFixed(2).padStart(6)} m (acompanha a ~3 m)`);
        }
    }
}

console.log('\n3 — Não recua para lá do fundo do campo quando a bola está muito recuada');
{
    const profundidade = 50;
    const bz = -51; // Bola quase em cima da linha de fundo
    const centroZ = bz + 5.0;
    const bb = {
        dir: 1,
        isAttacking: true,
        bolaZSuave: bz,
        ballX: 0,
        bloco: {
            x0: -20, x1: 20,
            z0: centroZ - profundidade / 2,
            z1: centroZ + profundidade / 2
        }
    };

    const slotCB = { u: 0.5, v: 0.0 };
    const posCB = calcularPontoDoSlot(slotCB, 'CB', 'def', 'balanced', bb);
    const minZPermitido = -(CAMPO_COMP / 2 - 1.5);
    if (posCB.z < minZPermitido - 0.01) {
        erro(`CB saiu do campo: ${posCB.z} < ${minZPermitido}`);
    } else {
        ok(`CB respeita o limite do campo em bola no fundo: ${posCB.z.toFixed(2)} m >= ${minZPermitido} m`);
    }
}

if (falhas > 0) {
    console.error(`\nFALHAS: ${falhas}`);
    process.exit(1);
} else {
    console.log('\nOK: Todos os testes de acompanhamento da linha de defesa na saída de jogo passaram.');
}
