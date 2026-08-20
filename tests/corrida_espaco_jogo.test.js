/*
A corrida ao espaco em jogo: acontece, tem destino legal e ACABA.

O que este teste NAO afirma: que a corrida melhora a circulacao. Medido, 10
sementes, ligando e desligando a corrida no mesmo binario: companheiros com
linha de passe livre a 10-22 m do portador 1.7 -> 1.9 (desvio 0.3), mediana do
passe 11.5 -> 11.8 m. O mecanismo funciona; o efeito na troca de passes ainda
nao esta demonstrado.
*/
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { ctx, novoJogo } = require('./headless.js');

function cenario(semente) {
    return vm.runInContext(`
        (function () {
            let _s = ${semente} >>> 0;
            Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
            RunIntoSpaceModel.distMax = 32.0;
            Match.resetPlay(true);

            // Posse fixa num medio do TeamA, a meio-campo.
            const portador = Match.players.find(p => p.pos === 'CM');
            const fixar = () => {
                portador.model.position.set(0, ALTURA_BASE_Y, 5);
                portador.hasBall = true;
                Match.ballCarrier = portador;
                Match.possessionTeam = 'TeamA';
                Match.ball.position.set(0, 0.11, 5);
                Match.ballVel.set(0, 0, 0);
            };

            const r = {
                corridas: 0, maiorDuracao: 0, foraDeJogo: 0, foraDoCampo: 0,
                paraTras: 0, defesasACorrer: 0, terminadas: 0
            };
            const emCorrida = new Map();

            // 1800 frames (~29 s): com 900 havia corridas a comecar no fim da janela
            // e o teste do fim da corrida ficava intermitente.
            for (let i = 0; i < 1800; i++) {
                fixar();
                Match.update(0.016);

                const bb = TeamAI.get('TeamA');
                for (const p of Match.players) {
                    const correndo = (p.fsm.currentState === 'RUN_INTO_SPACE');
                    if (correndo && !emCorrida.has(p)) {
                        emCorrida.set(p, { t: 0, z0: p.model.position.z });
                        r.corridas++;
                        if (p.role === 'def' || p.role === 'gk') r.defesasACorrer++;
                        const alvo = p.dynamicTarget;
                        if (Math.abs(alvo.x) > 32.1 || Math.abs(alvo.z) > 51.1) r.foraDoCampo++;
                        if (typeof bb.offsideLimitDir === 'number' &&
                            alvo.z * p.dirZ > bb.offsideLimitDir + 0.01) r.foraDeJogo++;
                        if ((alvo.z - p.model.position.z) * p.dirZ <= 0) r.paraTras++;
                    }
                    if (correndo) {
                        const e = emCorrida.get(p);
                        e.t += 0.016;
                        if (e.t > r.maiorDuracao) r.maiorDuracao = e.t;
                    } else if (emCorrida.has(p)) {
                        emCorrida.delete(p);
                        r.terminadas++;
                    }
                }
            }
            return r;
        })();
    `, ctx);
}

/*
Tres cenarios somados, sempre. Uma semente sozinha chega a passar 29 s sem
uma unica corrida (elas sao raras: 1.7% dos jogadores-frame em jogo livre), e
qualquer teste montado sobre uma so ficava intermitente por causa do cenario
e nao do codigo.
*/
const SEMENTES = [20260820, 424242, 987654];

function cenarios() {
    const total = {
        corridas: 0, maiorDuracao: 0, foraDeJogo: 0, foraDoCampo: 0,
        paraTras: 0, defesasACorrer: 0, terminadas: 0, porSemente: []
    };
    for (const semente of SEMENTES) {
        novoJogo();
        const r = cenario(semente);
        total.corridas += r.corridas;
        total.terminadas += r.terminadas;
        total.foraDeJogo += r.foraDeJogo;
        total.foraDoCampo += r.foraDoCampo;
        total.paraTras += r.paraTras;
        total.defesasACorrer += r.defesasACorrer;
        total.maiorDuracao = Math.max(total.maiorDuracao, r.maiorDuracao);
        total.porSemente.push(r.corridas);
    }
    return total;
}

/*
Um cenario em tres, e nao dois: as corridas sao RARAS. Medido em jogo livre,
1.7% dos jogadores-frame; neste cenario ha janelas inteiras de 29 s sem uma
unica, porque exigir destino livre E servivel pelo portador corta quase tudo.
O teste afirma o que se sabe ser verdade — o mecanismo dispara — e nao uma
frequencia que os dados nao suportam.
*/
test('com a bola num companheiro, alguém arranca para o espaço', () => {
    const r = cenarios();
    assert.ok(r.corridas > 0,
        'nenhum dos tres cenarios teve corridas (' + r.porSemente.join(', ') + ')');
});

test('as corridas acabam — nenhuma passa do prazo', () => {
    const r = cenarios();
    /*
    O apoio de circulacao passou a ter prioridade sobre a corrida ao espaco
    (oferecer-se serve a jogada seguinte; atacar o espaco serve a de depois),
    por isso ha cenarios inteiros sem uma unica corrida. A afirmacao que
    interessa — nenhuma corrida passa do prazo — vale de qualquer maneira.
    */
    if (r.corridas > 0) {
        assert.ok(r.terminadas > 0, 'houve corridas mas nenhuma chegou ao fim');
    }
    assert.ok(r.maiorDuracao < 4.5,
        'corrida de ' + r.maiorDuracao.toFixed(1) + ' s (prazo 4 s)');
});

test('o destino é sempre para a frente, em campo e sem fora-de-jogo', () => {
    const r = cenarios();
    assert.strictEqual(r.paraTras, 0, r.paraTras + ' corridas para tras');
    assert.strictEqual(r.foraDoCampo, 0, r.foraDoCampo + ' destinos fora do campo');
    assert.strictEqual(r.foraDeJogo, 0, r.foraDeJogo + ' destinos em fora-de-jogo');
});

test('defesas e guarda-redes não abandonam a posição', () => {
    const r = cenarios();
    assert.strictEqual(r.defesasACorrer, 0, r.defesasACorrer + ' defesas a correr ao espaco');
});
