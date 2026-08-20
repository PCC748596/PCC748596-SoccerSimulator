/*
O apoio de circulacao em jogo: alguem e chamado, e o encargo DURA.

A duracao e o que este teste guarda, porque foi ai que o mecanismo falhou
duas vezes:

  1. atribuicao refeita do zero a cada frame, sem histerese -> o encargo
     saltava de pessoa para pessoa, duracao media 0.2 s;
  2. referencia no PORTADOR em vez de na bola -> so 34% dos frames tem
     portador, e nos outros dois tercos os apoios eram apagados.

Com as duas corrigidas, 0.8 s de media e o dobro do tempo dentro do ponto.
Um apoio que dura menos do que o tempo de la chegar nao e um apoio.
*/
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { ctx, novoJogo } = require('./headless.js');

function cenario() {
    return vm.runInContext(`
        (function () {
            let _s = 20260820 >>> 0;
            Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
            Match.resetPlay(true);

            // Posse fixa: e o estado em que faz sentido alguem se oferecer.
            const portador = Match.players.find(p => p.pos === 'CM');
            const fixar = () => {
                portador.model.position.set(0, ALTURA_BASE_Y, 5);
                portador.hasBall = true;
                Match.ballCarrier = portador;
                Match.possessionTeam = 'TeamA';
                Match.ball.position.set(0, 0.11, 5);
                Match.ballVel.set(0, 0, 0);
            };

            const inicio = new Map();
            const duracoes = [];
            let n = 0, comApoio = 0, defesasAApoiar = 0, foraDaFaixa = 0, maxSimultaneos = 0;

            for (let i = 0; i < 900; i++) {
                fixar();
                Match.update(0.016);
                n++;

                let simultaneos = 0;
                for (const p of Match.players) {
                    if (p.apoioPonto) {
                        simultaneos++;
                        comApoio++;
                        if (!inicio.has(p)) inicio.set(p, i);
                        if (p.role === 'gk') defesasAApoiar++;
                        const d = Math.hypot(p.apoioPonto.x - Match.ball.position.x,
                                             p.apoioPonto.z - Match.ball.position.z);
                        /*
                        Tolerancia de 2 m e nao de 1: a bola MEXE-SE dentro do
                        frame (o portador puxa-a para o pe, ver player.update),
                        por isso a posicao que a atribuicao usou nao e
                        exactamente esta. Medido, a diferenca chega a 1.1 m.
                        */
                        if (d < SupportModel.circulacao.raioMin - 2.0 ||
                            d > SupportModel.circulacao.raioMax + 2.0) foraDaFaixa++;
                    } else if (inicio.has(p)) {
                        duracoes.push((i - inicio.get(p)) * 0.016);
                        inicio.delete(p);
                    }
                }
                if (simultaneos > maxSimultaneos) maxSimultaneos = simultaneos;
            }
            for (const [p, ini] of inicio) duracoes.push((n - ini) * 0.016);

            const media = duracoes.length
                ? duracoes.reduce((a, b) => a + b, 0) / duracoes.length : 0;
            return {
                frames: n, comApoio: comApoio, encargos: duracoes.length,
                duracaoMedia: media, maiorDuracao: duracoes.length ? Math.max(...duracoes) : 0,
                defesasAApoiar: defesasAApoiar, foraDaFaixa: foraDaFaixa,
                maxSimultaneos: maxSimultaneos
            };
        })();
    `, ctx);
}

test('com a equipa em posse, alguém é chamado a apoiar', () => {
    novoJogo();
    const r = cenario();
    assert.ok(r.encargos > 0, 'ninguem foi chamado a apoiar em 14 s de posse');
});

test('o encargo dura o suficiente para lá chegar', () => {
    novoJogo();
    const r = cenario();
    /*
    0.4 s e nao 0.8: neste cenario o portador nunca passa, e sem a bola a
    circular os pontos envelhecem mais depressa (0.56 s medidos aqui contra
    0.8 s em jogo livre). O limiar esta posto a apanhar o defeito que ja
    aconteceu duas vezes — 0.2 s, o encargo a saltar de pessoa para pessoa —
    com margem para o cenario.
    */
    assert.ok(r.duracaoMedia > 0.4,
        'duracao media de ' + r.duracaoMedia.toFixed(2) + ' s (' + r.encargos + ' encargos)');
});

test('nunca mais apoios do que o tecto', () => {
    novoJogo();
    const r = cenario();
    // O SupportModel vive dentro do contexto do jogo, nao aqui fora.
    const tecto = vm.runInContext('SupportModel.circulacao.maxApoios', ctx);
    assert.ok(r.maxSimultaneos <= tecto,
        r.maxSimultaneos + ' apoios ao mesmo tempo');
});

/*
A faixa de passe (10-18 m) NAO se testa aqui: a bola mexe-se dentro do frame
— o portador puxa-a para o pe — por isso a referencia que se mede nunca e
exactamente a que a atribuicao usou, e o teste dava falso negativo uma corrida
em cada tres. Essa garantia esta no teste puro
(tests/apoio_circulacao.test.js, "todos os pontos ficam na faixa de passe
pedida"), onde a referencia esta parada e a afirmacao e exacta.
*/

test('o guarda-redes não se oferece', () => {
    novoJogo();
    const r = cenario();
    assert.strictEqual(r.defesasAApoiar, 0);
});
