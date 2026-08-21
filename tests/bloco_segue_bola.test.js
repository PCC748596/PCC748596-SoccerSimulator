/*
O BLOCO ACOMPANHA A BOLA.

O centro do rectângulo do TeamBT é a bola mais o deslocamento da Mentalidade,
nos dois eixos. Se não for, o portador chega à borda do bloco e os companheiros
não o acompanham — sem isso não há jogo.

Media-se a SENSIBILIDADE: quantos metros anda o centro do bloco por cada metro
que a bola anda. A bola é arrastada à mão, a velocidade constante, para o
resultado não depender do jogo que calhar acontecer — a primeira versão deste
teste usava jogo emergente e alternava entre passar e falhar.

Havia três coisas a comer o seguimento: os offsets de estado (+10/+7/-7 m), o
`tectoBloco` da Mentalidade a correr depois de tudo e a `basculacao` (0.6-0.8)
no eixo X. O que este teste impede de voltar é o zero.
*/
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { ctx, novoJogo } = require('./headless.js');

/*
Arrasta a bola (e o portador com ela) por `passos` frames, `dxPorFrame` e
`dzPorFrame` metros de cada vez, e devolve quanto andou o centro do bloco por
cada metro andado pela bola.
*/
function arrastar(dxPorFrame, dzPorFrame, x0, z0) {
    return vm.runInContext(`
        (function () {
            Tatics.estilo = 'balanceado';
            Match.resetPlay(true);

            const portador = Match.players.find(p => p.pos === 'CM');
            let bx = ${x0}, bz = ${z0};

            const por = () => {
                portador.model.position.set(bx, ALTURA_BASE_Y, bz);
                portador.hasBall = true;
                Match.ballCarrier = portador;
                Match.possessionTeam = 'TeamA';
                Match.ball.position.set(bx, 0.11, bz);
                Match.ballVel.set(0, 0, 0);
            };

            // Assenta o seguimento no ponto de partida antes de medir.
            por();
            for (let i = 0; i < 120; i++) { por(); Match.update(0.016); }

            const centro = () => {
                const bloco = TeamAI.get('TeamA').bloco;
                return { x: (bloco.x0 + bloco.x1) / 2, z: (bloco.z0 + bloco.z1) / 2 };
            };

            const antes = centro();
            const bolaAntes = { x: bx, z: bz };

            for (let i = 0; i < 240; i++) {
                bx += ${dxPorFrame};
                bz += ${dzPorFrame};
                por();
                Match.update(0.016);
            }

            const depois = centro();
            return {
                x: (depois.x - antes.x) / ((bx - bolaAntes.x) || 1),
                z: (depois.z - antes.z) / ((bz - bolaAntes.z) || 1),
                bolaX: bx, bolaZ: bz
            };
        })();
    `, ctx);
}

test('o centro do bloco acompanha a bola ao longo do campo', () => {
    novoJogo();
    // 4 m/s de -30 até +[-30 + 16] em Z, pelo eixo do campo.
    const r = arrastar(0, 4 * 0.016, 0, -30);
    assert.ok(r.z > 0.85, 'seguimento em Z: ' + r.z.toFixed(2) + ' m por metro de bola');
});

test('o centro do bloco acompanha a bola na largura', () => {
    novoJogo();
    // Do eixo para a ala direita, a 3 m/s.
    const r = arrastar(3 * 0.016, 0, 0, 0);
    assert.ok(r.x > 0.85, 'seguimento em X: ' + r.x.toFixed(2) + ' m por metro de bola');
});

test('a Mentalidade desloca o centro em relação à bola, e só ela', () => {
    novoJogo();
    /*
    Os adversários são postos junto à baliza deles de propósito: a linha de
    fora-de-jogo trava a FRENTE do bloco, e com a última linha adversária ao
    pé da bola é ela que manda no rectângulo, não a Mentalidade. Aqui quer-se
    medir a Mentalidade sozinha.
    */
    const comEstilo = (estilo) => vm.runInContext(`
        (function () {
            Tatics.estilo = '${estilo}';
            Match.resetPlay(true);
            const portador = Match.players.find(p => p.pos === 'CM');
            const por = () => {
                portador.model.position.set(0, ALTURA_BASE_Y, 0);
                portador.hasBall = true;
                Match.ballCarrier = portador;
                Match.possessionTeam = 'TeamA';
                Match.ball.position.set(0, 0.11, 0);
                Match.ballVel.set(0, 0, 0);
                for (const o of Match.opponents) {
                    o.model.position.set(o.model.position.x, ALTURA_BASE_Y, 42 * portador.dirZ);
                }
            };
            for (let i = 0; i < 240; i++) { por(); Match.update(0.016); }
            const bloco = TeamAI.get('TeamA').bloco;
            return ((bloco.z0 + bloco.z1) / 2) * portador.dirZ;
        })();
    `, ctx);

    const equilibrado = comEstilo('balanceado');
    const ofensivo = comEstilo('ataque');

    // A bola está no mesmo sítio nas duas medições; a diferença é a postura.
    const esperado = vm.runInContext(
        'MentalidadeModel.ataque.blocoZ - MentalidadeModel.balanceado.blocoZ', ctx);
    assert.ok(Math.abs((ofensivo - equilibrado) - esperado) < 2.0,
        'o deslocamento da Mentalidade não bate certo: ' +
        (ofensivo - equilibrado).toFixed(1) + ' m contra ' + esperado + ' m pedidos');
});

/*
E em jogo a sério, não só com a bola arrastada à mão: o centro do rectângulo
tem de ficar EM CIMA da bola (mais a Mentalidade), nas duas equipas.

Este é o teste que apanha os travões de borda. Eles não mexiam no cálculo do
centro — mexiam nas bordas e recalculavam a outra (`z1 = z0 + profundidade`),
o que arrasta o rectângulo inteiro. Com o fora-de-jogo a prender a frente na
última linha adversária, o centro ficava meia profundidade (~15 m) atrás da
bola, e era isso que se via no ecrã.

Atenção ao referencial: `bloco.z0/z1` estão no referencial de ATAQUE da equipa
(z * dir) e `bloco.x0/x1` em coordenadas do mundo. Comparar um com o outro sem
converter dá 75 m de erro numa das equipas e nenhum na outra.
*/
test('em jogo, o centro do bloco fica sobre a bola nas duas equipas', () => {
    novoJogo();
    const r = vm.runInContext(`
        (function () {
            let _s = 7 >>> 0;
            Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
            Tatics.estilo = 'balanceado';
            Match.resetPlay(true);

            const err = { TeamA: [], TeamB: [] };
            for (let i = 0; i < 3000; i++) {
                Match.update(0.016);
                if (Match.state !== 'PLAY') continue;
                const ment = MentalidadeModel[Tatics.estilo].blocoZ;
                for (const t of ['TeamA', 'TeamB']) {
                    const bb = TeamAI.get(t);
                    if (!bb || !bb.bloco) continue;
                    const cz = (bb.bloco.z0 + bb.bloco.z1) / 2;
                    const cx = (bb.bloco.x0 + bb.bloco.x1) / 2;
                    err[t].push(Math.max(
                        Math.abs(cz - Match.ball.position.z * bb.dir - ment),
                        Math.abs(cx - Match.ball.position.x)));
                }
            }
            const mediana = (v) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)];
            return { A: mediana(err.TeamA), B: mediana(err.TeamB), n: err.TeamA.length };
        })();
    `, ctx);

    assert.ok(r.n > 1000, 'amostra pequena de mais: ' + r.n);
    // Folga larga: o seguimento é suavizado e as linhas do campo cortam o
    // rectângulo. O que isto impede é o erro de meia profundidade (~15 m).
    assert.ok(r.A < 8.0, 'TeamA: centro a ' + r.A.toFixed(1) + ' m da bola');
    assert.ok(r.B < 8.0, 'TeamB: centro a ' + r.B.toFixed(1) + ' m da bola');
});
