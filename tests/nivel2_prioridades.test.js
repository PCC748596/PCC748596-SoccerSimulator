/*
AS REGRAS QUE A CAMADA POSICIONAL TEM DE CUMPRIR — ver docs/auditoria_nivel2.md.

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

test('o rest defense está ligado e é gente a sério', () => {
    const R = BlockShape.restDefense;
    assert.ok(R, 'o rest defense desapareceu do config');
    assert.ok(R.defesasAtrasDaBola >= 2 && R.defesasAtrasDaBola <= 4,
        `defesasAtrasDaBola=${R.defesasAtrasDaBola}: dois é o mínimo para haver cobertura, quatro já é não atacar`);
    assert.ok(R.medioAtrasDaBola >= 0 && R.medioAtrasDaBola <= 2, 'medioAtrasDaBola fora do razoável');
    assert.ok(R.recuoDaBola > 0, 'sem recuo, "ficar atrás da bola" é ficar em cima dela');
    assert.ok(srcTeam.includes('BlockShape.restDefense'),
        'a camada posicional não aplica o rest defense');
});

test('o rest defense escolhe pelo POSTO, e não pela posição do momento', () => {
    const ini = srcTeam.indexOf('BlockShape.restDefense');
    const corpo = srcTeam.slice(ini, ini + 2200);
    assert.ok(corpo.includes('sort'),
        'os que ficam em casa deviam ser escolhidos por profundidade, não pela ordem da lista');
    /*
    Pela posição do momento havia porta giratória: o defesa que sobe deixa de
    ser dos mais recuados, perde o limite e sobe mais. Medido: centrais em
    -12,0 m de avanço médio, contra -15,9 m com a escolha pelo posto.
    */
    assert.ok(corpo.includes('baseTarget'),
        'a escolha voltou a ser pela posição do momento — o limite deixa de se aguentar');
    assert.ok(corpo.includes('bb.chaser !== p'),
        'o rest defense está a prender quem vai à bola');
});

test('a separação lateral↔extremo é simétrica e não depende da ordem', () => {
    assert.ok(BlockShape.separacaoLateral >= 4 && BlockShape.separacaoLateral <= 10,
        `separacaoLateral=${BlockShape.separacaoLateral}: fora do que separa duas faixas`);
    const ini = srcTeam.indexOf('BlockShape.separacaoLateral &&');
    const corpo = srcTeam.slice(ini - 200, ini + 1800);
    assert.ok(corpo.includes('souODeFora'),
        'a regra deixou de decidir quem fica por fora — sem isso os dois cedem, ou nenhum');
    assert.ok(corpo.includes('tacticalTarget'),
        'a separação voltou a comparar com a POSIÇÃO do outro: os dois vão atrás um do outro');
});

test('o fora-de-jogo é um LIMITE das leis do jogo, não um corte solto', () => {
    assert.strictEqual(BlockShape.cortarForaDeJogoNoAlvo, true,
        'o corte de fora-de-jogo está desligado');
    // Deixou de ser uma função à parte no player_bt: é um limite proposto pela
    // camada posicional e aplicado pelo resolvedor (js/bt/alvo.js).
    assert.ok(!srcPlayer.includes('function cortarForaDeJogo('),
        'voltou a haver um corte de fora-de-jogo à parte, fora do resolvedor');
    assert.ok(srcTeam.includes("proporLimiteAvanco(p, AlvoPrio.LEIS"),
        'a camada posicional já não propõe o fora-de-jogo como lei do jogo');
    assert.ok(srcTeam.includes('temTarefaDeBola(p, bb)'),
        'o limite tem de deixar passar quem tem tarefa de bola');
});

test('a árvore propõe, e a prioridade sai da TAREFA', () => {
    assert.ok(srcPlayer.includes('proporOQueAArvoreEscreveu'),
        'o nível 3 voltou a escrever o alvo directamente');
    const ini = srcPlayer.indexOf('const proporOQueAArvoreEscreveu');
    const corpo = srcPlayer.slice(ini, ini + 1800);
    assert.ok(corpo.includes('AlvoPrio.BOLA') && corpo.includes('AlvoPrio.ACCAO'),
        'as propostas da árvore deixaram de distinguir tarefa de bola de acção');
    assert.ok(corpo.includes('tarefaDeBola'),
        'quem vai à bola tem de propor sempre — o alvo dele não muda de frame para frame');
});

test('o rest defense e a transição são LIMITES, não cortes locais', () => {
    assert.ok(srcTeam.includes("proporLimiteAvanco(p, AlvoPrio.SEGURO"),
        'o rest defense deixou de ser um limite: volta a ser furado pela árvore');
    const n = srcTeam.split('AlvoPrio.SEGURO').length - 1;
    assert.ok(n >= 2, `só ${n} limite(s) de SEGURO: falta o rest defense ou a transição defensiva`);
});

test('a auditoria e a sua ferramenta continuam no repositório', () => {
    assert.ok(fs.existsSync(path.join(raiz, 'docs', 'auditoria_nivel2.md')),
        'docs/auditoria_nivel2.md desapareceu');
    assert.ok(fs.existsSync(path.join(raiz, 'tools', 'headless', 'nivel2_auditoria.js')),
        'a ferramenta que produz os números da auditoria desapareceu');
});

/*
SEM BOLA: dois limites novos, ambos de nível SEGURO — ver a secção 4 da
auditoria e o relato "5 jogadores indo pra frente ao invés de retornar".

Medido antes: 1,69 jogadores por frame com o alvo ALÉM DA BOLA a defender
(38% médios, 10% defesas), pior caso nove. Depois: 1,09, e 82% do que sobra
são avançados — que estão certos, são a saída da equipa.
*/
test('sem bola ninguém passa a frente do bloco', () => {
    assert.strictEqual(BlockShape.limiteFrenteDoBlocoSemBola, true,
        'o limite da frente do bloco está desligado');
    assert.ok(srcTeam.includes("'frente do bloco'"),
        'a camada posicional já não propõe o limite da frente do bloco');
});

test('sem bola, defesas e médios ficam do lado de cá da bola', () => {
    assert.strictEqual(BlockShape.limiteAlemDaBolaSemBola, true,
        'o limite do lado da bola está desligado');
    assert.ok(BlockShape.folgaAlemDaBola >= 0 && BlockShape.folgaAlemDaBola <= 3,
        `folgaAlemDaBola=${BlockShape.folgaAlemDaBola}: com folga a mais o limite deixa de morder ` +
        '(medido: a 4 m ficava em 1,9 jogadores além da bola, a 1,5 m em 1,1)');
    // Os avançados NÃO entram: são a saída da equipa.
    assert.deepStrictEqual(BlockShape.recuamAlemDaBola.slice().sort(), ['def', 'mid'],
        'se os avançados entrarem nesta regra, a equipa recupera a bola sem ninguém à frente');
    assert.ok(srcTeam.includes("'do lado de ca da bola'"),
        'a camada posicional já não propõe este limite');
    const ini = srcTeam.indexOf("'do lado de ca da bola'");
    const corpo = srcTeam.slice(ini - 900, ini + 200);
    assert.ok(corpo.includes('bb.chaser !== p') && corpo.includes('bb.intercetor !== p'),
        'o limite tem de ceder a quem vai à bola, senão ninguém pressiona');
});
