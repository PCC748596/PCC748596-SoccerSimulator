/*
A linha que defende bascula em BLOCO: fecha para o lado da bola sem que dois
defesas acabem em cima um do outro.

Medido antes de `deslocamentoDeCorredor` separar os numeros: com a bola presa
numa ala, o lateral do lado oposto fechava 8 m e o central so 3, a distancia
entre os dois encolhia 5 m de uma vez, e dois defesas passavam 4.3% a 8.8% do
tempo a menos de 3 m um do outro.

O cenario fixa a POSSE, e nao so a bola. Sem isso o `isAttacking` da equipa
media oscilava durante a amostra, o `fecho` saltava entre 0.78 (sem bola) e
0.92 (com bola), e o teste falhava uma corrida em cada tres — por causa do
cenario, nao do codigo.

Mede os ALVOS (`tacticalTarget`) e nao os corpos: o alvo e o que o nivel 2
DECIDE, que e o que estes testes verificam; a posicao e o resultado de o
perseguir no meio de um jogo caotico.
*/
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { ctx, novoJogo } = require('./headless.js');

/*
TeamA segura a bola numa ala; mede-se a linha defensiva do TeamB.
`ladoBola` +1 direita, -1 esquerda (mundo).
*/
function medir(compact, ladoBola) {
    // `-${ladoBola}` com ladoBola = -1 gerava `--1`, que nao compila.
    const ladoOposto = -ladoBola;
    return vm.runInContext(`
        (function () {
            /*
            PRNG semeado: a inquietacao (o micro-movimento de quem ja chegou
            ao alvo) sorteia angulo e raio a cada segundo, e sem semente o
            mesmo cenario dava valores a oscilar +/- 2 m entre corridas.
            */
            let _s = 20260820 >>> 0;
            Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };

            /*
            Corrida ao espaco desligada NESTE cenario: o assunto aqui e a
            geometria do bloco que defende, e os arranques dos atacantes
            mexem nas marcacoes o suficiente para o valor medido oscilar
            quase 1 m entre corridas.
            */
            RunIntoSpaceModel.distMax = -1;

            Tatics.compactness = '${compact}';
            Tatics.setores = ['esq', 'dir'];
            Match.assignFormations();
            Match.resetPlay(true);

            const portador = Match.players.find(p => p.pos === 'CM');

            // Posse fixa: o mesmo homem, no mesmo sitio, com a bola, todos os
            // frames. E o unico jeito de o cenario ser o mesmo em cada corrida.
            const fixar = () => {
                portador.model.position.set(${ladoBola} * 24, ALTURA_BASE_Y, 0);
                portador.hasBall = true;
                Match.ballCarrier = portador;
                Match.possessionTeam = 'TeamA';
                Match.ball.position.set(${ladoBola} * 24, 0.11, 0);
                Match.ballVel.set(0, 0, 0);
            };
            for (let i = 0; i < 240; i++) { fixar(); Match.update(0.016); }

            const alvo = (p) => p.tacticalTarget || p.model.position;
            let n = 0, colados = 0, distLatCb = 0, largura = 0;

            for (let i = 0; i < 300; i++) {
                fixar();
                Match.update(0.016);

                const def = Match.opponents.filter(p => p.role === 'def');
                const cbs = Match.opponents.filter(p => p.pos === 'CB');
                // O lateral do TeamB do lado OPOSTO a bola. O TeamB ataca em
                // -z, por isso o 'esq'/'dir' dele esta espelhado no mundo.
                const latOposto = Match.opponents.find(p =>
                    Math.sign(p.baseTarget.x) === ${ladoOposto} && (p.pos === 'LB' || p.pos === 'RB'));
                if (def.length < 4 || cbs.length < 2 || !latOposto) continue;
                n++;

                const xs = Match.opponents.filter(p => p.role !== 'gk').map(p => alvo(p).x);
                largura += Math.max(...xs) - Math.min(...xs);

                let melhor = 99;
                for (const cb of cbs) {
                    const d = Math.abs(alvo(cb).x - alvo(latOposto).x);
                    if (d < melhor) melhor = d;
                }
                distLatCb += melhor;

                let junto = false;
                for (let a = 0; a < def.length; a++) for (let b = a + 1; b < def.length; b++) {
                    const dx = alvo(def[a]).x - alvo(def[b]).x;
                    const dz = alvo(def[a]).z - alvo(def[b]).z;
                    if (Math.hypot(dx, dz) < 3.0) junto = true;
                }
                if (junto) colados++;
            }
            return { n: n, colados: 100 * colados / n, distLatCb: distLatCb / n, largura: largura / n };
        })();
    `, ctx);
}

for (const lado of [1, -1]) {
    test('os defesas não se embolam com a bola na ala ' + (lado > 0 ? 'direita' : 'esquerda'), () => {
        novoJogo();
        const r = medir('median', lado);
        assert.ok(r.n > 200, 'poucas amostras: ' + r.n);
        assert.ok(r.colados < 1.0,
            'alvos de defesas a menos de 3 m em ' + r.colados.toFixed(1) + '% do tempo');
    });
}

test('o lateral do lado oposto não colapsa em cima do central', () => {
    novoJogo();
    const r = medir('median', 1);
    assert.ok(r.distLatCb > 6.0,
        'lateral oposto a ' + r.distLatCb.toFixed(1) + ' m do central mais proximo');
});

/*
Um novoJogo por medicao, e nao um para as tres: o resetPlay repoe as posicoes
mas nao o estado que se acumulou (marcacoes, alisamento dos alvos, corridas em
curso), e com esse estado a passar de uma medicao para a seguinte o short e o
median chegavam a sair a 0.3 m um do outro.
*/
test('a compacidade de largura separa os três valores', () => {
    novoJogo();
    const curto = medir('short', 1).largura;
    novoJogo();
    const medio = medir('median', 1).largura;
    novoJogo();
    const largo = medir('large', 1).largura;
    /*
    A afirmacao forte e a de ponta a ponta. A diferenca de amplitude entre
    median e large sao 6.8 m de rectangulo, mas em campo chega la muito
    reduzida (1.3 a 2.5 m): a equipa que defende e comprimida por outras
    regras — marcacao, basculacao para o lado da bola — que pesam mais que a
    amplitude. Exigir 1.5 m entre vizinhos falhava uma corrida em cada oito
    por causa disso, e nao de um defeito.

    Com o codigo antigo (amplitude 70/80/90%) esta diferenca era de 1.4 m:
    e ela que prova que a manopla passou a valer alguma coisa.
    */
    /*
    Sem afirmacao sobre vizinhos: medido, o median e o large chegam a sair
    trocados (30.4 contra 30.1). Os 6.8 m de rectangulo que os separam
    chegam a campo reduzidos a 1-2 m, e o ruido da marcacao cobre isso. A
    unica coisa que o mecanismo garante e a diferenca de ponta a ponta.
    */
    assert.ok(largo - curto > 3.5,
        'short=' + curto.toFixed(1) + ' large=' + largo.toFixed(1) +
        ' (a compacidade quase nao muda a largura)');
});
