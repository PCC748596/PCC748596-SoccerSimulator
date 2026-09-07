/*
OS LIMITES DO POSICIONAMENTO — ver docs/auditoria_nivel2.md.

ONDE ELES VIVEM, HOJE. A auditoria propôs um resolvedor de prioridades
(js/bt/alvo.js: cada camada PROPÕE, o alvo resolve-se uma vez no fim). Esse
módulo existe e não está ligado a nada — o posicionamento voltou a ser escrito
em sequência, e os limites aplicam-se todos no tickFinal do team_bt.js, que é o
último sítio por onde cada alvo passa.

Este ficheiro fixava a FIAÇÃO do resolvedor (proporLimiteAvanco, AlvoPrio) e por
isso ficou a falhar inteiro quando ela desapareceu — a descrever um jogo que já
não existe. Passa a fixar o que interessa e continua verdadeiro: que os limites
EXISTEM, com os números do config, e que nenhum deles prende quem vai à bola.

Três regras novas desta sessão, e a razão de cada uma está medida no documento:

  REST DEFENSE       os defesas e o médio mais recuados não passam a linha da
                     bola. Sem isto: 0,76 adversários sem ninguém entre eles e
                     a própria baliza, três ou mais em 12% do tempo.

  SEPARAÇÃO DA ALA   o lateral e o extremo do mesmo lado não partilham a faixa.
                     Sem isto: a menos de 4 m um do outro em 10% do tempo, e em
                     211 de 269 casos eram os ALVOS que estavam juntos.

  FORA-DE-JOGO       o corte tem de ser a ÚLTIMA palavra. O da camada
                     posicional nunca vazou, mas 9,4% dos alvos estavam além da
                     linha e 100% deles tinham sido escritos DEPOIS, pelo
                     nível 3.

Corre com: node --test tests/nivel2_prioridades.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcTeam = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8'));
const srcPlayer = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));
const srcTac = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'tactics.js'), 'utf8'));

function extrairObjecto(src, nome, extras) {
    const ini = src.indexOf(`const ${nome} = {`);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    const nomes = Object.keys(extras || {});
    return new Function(...nomes, `${src.slice(ini, fim + 3)}; return ${nome};`)
        (...nomes.map(n => extras[n]));
}
const BlockShape = extrairObjecto(srcTac, 'BlockShape', { CAMPO_COMP: 106, CAMPO_LARG: 68 });

// Onde os limites são aplicados: o último passo do posicionamento.
const tickFinal = (() => {
    const ini = srcTeam.indexOf('tickFinal: function (p, bb)');
    assert.ok(ini > 0, 'o tickFinal mudou de nome — este ficheiro precisa de ser revisto');
    return srcTeam.slice(ini, srcTeam.indexOf(LF + '    },' + LF, ini));
})();

test('o rest defense está ligado e é gente a sério', () => {
    const R = BlockShape.restDefense;
    assert.ok(R, 'o rest defense desapareceu do config');
    assert.ok(R.defesasAtrasDaBola >= 2 && R.defesasAtrasDaBola <= 4,
        `defesasAtrasDaBola=${R.defesasAtrasDaBola}: dois é o mínimo para haver cobertura, quatro já é não atacar`);
    assert.ok(R.medioAtrasDaBola >= 0 && R.medioAtrasDaBola <= 2, 'medioAtrasDaBola fora do razoável');
    assert.ok(R.recuoDaBola > 0, 'sem recuo, "ficar atrás da bola" é ficar em cima dela');
    assert.ok(tickFinal.includes('B_LIM.restDefense'),
        'o posicionamento não aplica o rest defense');
});

test('o rest defense escolhe pelo POSTO, e não pela posição do momento', () => {
    const ini = tickFinal.indexOf('B_LIM.restDefense');
    const corpo = tickFinal.slice(ini, ini + 1600);
    assert.ok(corpo.includes('sort'),
        'os que ficam em casa deviam ser escolhidos por profundidade, não pela ordem da lista');
    /*
    Pela posição do momento havia porta giratória: o defesa que sobe deixa de
    ser dos mais recuados, perde o limite e sobe mais. Medido: centrais em
    -12,0 m de avanço médio, contra -15,9 m com a escolha pelo posto.
    */
    assert.ok(corpo.includes('baseTarget'),
        'a escolha voltou a ser pela posição do momento — o limite deixa de se aguentar');
});

test('nenhum limite prende quem vai à bola', () => {
    /*
    Chaser, intercetor e bloqueador vão onde têm de ir. Um limite que os prenda
    é uma equipa que não pressiona — era a primeira regra do resolvedor e
    continua a ser a de agora, com uma bandeira só para os três.
    */
    assert.ok(tickFinal.includes('const temTarefaDeBola ='),
        'a excepção de quem vai à bola desapareceu do posicionamento');
    for (const papel of ['bb.chaser === p', 'bb.intercetor === p', 'bb.bloqueador === p']) {
        assert.ok(tickFinal.includes(papel), papel + ' não entra na excepção');
    }
    const dali = tickFinal.slice(tickFinal.indexOf('const temTarefaDeBola ='));
    for (const limite of ['B_LIM.restDefense', 'limiteFrenteDoBlocoSemBola', 'penduloParaABola']) {
        assert.ok(dali.includes(limite),
            limite + ' é aplicado ANTES da excepção — quem vai à bola fica preso');
    }
});

test('a separação lateral↔extremo tem número e um lado que cede', () => {
    assert.ok(BlockShape.separacaoLateral >= 4 && BlockShape.separacaoLateral <= 10,
        `separacaoLateral=${BlockShape.separacaoLateral}: fora do que separa duas faixas`);
    /*
    Quem cede é o LATERAL, por desenho: o meia dá a largura, o lateral fica por
    dentro dele e `recuoDeApoio` metros atrás. Não é simétrico de propósito — se
    os dois cedessem, os dois saíam da faixa.
    */
    assert.ok(srcTeam.includes('B_SEP.separacaoLateral'), 'a separação da ala já não é aplicada');
    const ini = srcTeam.indexOf('B_SEP.separacaoLateral');
    const corpo = srcTeam.slice(ini - 900, ini + 900);
    assert.ok(corpo.includes("p.pos === 'LB'"),
        'a regra deixou de dizer quem é que cede — sem isso os dois cedem, ou nenhum');
    assert.ok(corpo.includes('recuoDeApoio'),
        'o lateral deixou de ficar atrás do meia a dar apoio');
});

test('o fora-de-jogo é um LIMITE, e é o último a falar', () => {
    assert.strictEqual(BlockShape.cortarForaDeJogoNoAlvo, true,
        'o corte de fora-de-jogo está desligado');
    assert.ok(!srcPlayer.includes('function cortarForaDeJogo('),
        'voltou a haver um corte de fora-de-jogo à parte, fora do posicionamento');
    assert.ok(tickFinal.includes('bb.offsideLimitDir'),
        'o posicionamento já não corta o alvo pela linha de fora-de-jogo');
    assert.ok(tickFinal.includes('p.offsideBias'),
        'o corte voltou a usar a linha EXACTA: sem erro de leitura não há impedimentos');
});

test('sem bola ninguém passa à frente do bloco', () => {
    assert.strictEqual(BlockShape.limiteFrenteDoBlocoSemBola, true,
        'o limite da frente do bloco está desligado');
    assert.ok(BlockShape.folgaFrenteDoBloco >= 0 && BlockShape.folgaFrenteDoBloco <= 5,
        'a folga da frente do bloco saiu do razoável');
    assert.ok(tickFinal.includes('limiteFrenteDoBlocoSemBola'),
        'o posicionamento já não aplica o limite da frente do bloco');
});

test('sem bola, defesas e médios ficam do lado de cá da bola', () => {
    assert.strictEqual(BlockShape.limiteAlemDaBolaSemBola, true,
        'o limite do lado da bola está desligado');
    assert.ok(BlockShape.folgaAlemDaBola >= 0 && BlockShape.folgaAlemDaBola <= 3,
        `folgaAlemDaBola=${BlockShape.folgaAlemDaBola}: com folga a mais o limite deixa de morder`);
    // Os avançados NÃO entram: são a saída da equipa.
    assert.deepStrictEqual(BlockShape.recuamAlemDaBola.slice().sort(), ['def', 'mid'],
        'se os avançados entrarem nesta regra, a equipa recupera a bola sem ninguém à frente');
    assert.ok(tickFinal.includes('recuamAlemDaBola'),
        'o posicionamento já não aplica o limite do lado da bola');
});

test('o resolvedor de prioridades continua desligado, e o ficheiro di-lo', () => {
    /*
    Meia-fiação é o pior dos dois mundos: metade dos limites propostos e metade
    escritos em sequência, sem ninguém saber qual manda. Enquanto o alvo.js não
    tiver chamadores, não pode ser carregado como se tivesse.
    */
    const srcAlvo = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'alvo.js'), 'utf8'));
    const indexHtml = semCR(fs.readFileSync(path.join(raiz, 'index.html'), 'utf8'));
    const ligado = [srcTeam, srcPlayer].some(
        src => /[^.\w]resolverAlvo\s*\(/.test(src) || /proporLimiteAvanco\s*\(/.test(src));

    if (!ligado) {
        assert.ok(srcAlvo.includes('NÃO ESTÁ LIGADO'),
            'o alvo.js não tem chamadores e o cabeçalho dele não o diz');
        assert.ok(!indexHtml.includes('js/bt/alvo.js'),
            'o index.html carrega um módulo que ninguém chama');
    } else {
        assert.ok(indexHtml.includes('js/bt/alvo.js'),
            'o resolvedor voltou a ser chamado mas não está carregado');
        assert.ok(!tickFinal.includes('B_LIM.restDefense'),
            'os limites estão nos dois sítios ao mesmo tempo: escolhe um');
    }
});

test('a auditoria e a sua ferramenta continuam no repositório', () => {
    assert.ok(fs.existsSync(path.join(raiz, 'docs', 'auditoria_nivel2.md')),
        'docs/auditoria_nivel2.md desapareceu');
    assert.ok(fs.existsSync(path.join(raiz, 'tools', 'headless', 'nivel2_auditoria.js')),
        'a ferramenta que produz os números da auditoria desapareceu');
});
