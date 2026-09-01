/*
O LADO DA JOGADA — Dummy Runner, Fox in the Box e o pêndulo do bloco.

Três queixas do mesmo tipo, todas de ver o jogo: gente com o alvo na ponta
oposta à da jogada.

  1. DUMMY RUNNER. Corria para `ladoEst * 15` — o lado do POSTO dele — quando o
     portador estava no eixo, e AFASTAVA-SE 7 m do portador quando ele estava
     numa ala. Com a jogada na direita e o posto à esquerda, arrancava para a
     extrema esquerda: arrastava o marcador para fora do lance, sem linha de
     passe possível. Agora corre para o lado do portador (ou da bola, no voo de
     um passe), `lateralDoPortador` metros por fora dele, com tecto
     `distanciaMax`.

  2. FOX IN THE BOX. O `melhorVaoX` escolhia o vão mais livre entre -16 e +16,
     e o mais livre é quase sempre junto ao poste. Agora o quadrado central
     leva `bonusCentral` na nota. Medido em jogo: alvos dentro de |x| <= 7 m
     passaram de 15% para 68%, e o |x| médio de 13.8 m para 7.7 m.

  3. PÊNDULO. O rectângulo tem 47.6 m e o centro segue a bola em x, portanto
     com a bola numa ala o homem do lado oposto fica na linha lateral
     contrária. Medido: o mais afastado tinha o alvo a 27.5 m da bola em x
     (pior 45.6), 1.34 jogadores a mais de 25 m. Com o tecto `distanciaMaxX`:
     24.1 m e 0.42.

Corre com: node --test tests/estilos_lado_da_jogada.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcEstilos = semCR(fs.readFileSync(path.join(raiz, 'js', 'playing_styles.js'), 'utf8'));
const srcTeam = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8'));
const srcTac = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'tactics.js'), 'utf8'));

function extrairObjecto(src, nome, extras) {
    const ini = src.indexOf(`const ${nome} = {`);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    const nomes = Object.keys(extras || {});
    return new Function(...nomes, `${src.slice(ini, fim + 3)}; return ${nome};`)
        (...nomes.map(n => extras[n]));
}
function extrairFuncao(src, nome) {
    const ini = src.indexOf(`function ${nome}(`);
    if (ini < 0) throw new Error(`${nome} não encontrada`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const CAMPO_COMP = 106, CAMPO_LARG = 68;
const BlockShape = extrairObjecto(srcTac, 'BlockShape', { CAMPO_COMP, CAMPO_LARG });
const PlayingStyleTuning = extrairObjecto(srcTac, 'PlayingStyleTuning', { CAMPO_COMP, CAMPO_LARG });
const melhorVaoX = new Function(extrairFuncao(srcEstilos, 'melhorVaoX') + '; return melhorVaoX;')();

const jogador = (x, z) => ({
    model: { position: { x, z } }, baseTarget: { x, z }, role: 'ata'
});
const adversario = (x, z) => ({ role: 'def', model: { position: { x, z } } });

test('o Fox in the Box prefere o quadrado central com o bónus', () => {
    const F = PlayingStyleTuning.foxInTheBox;
    assert.ok(F.meiaLarguraCentral > 0 && F.meiaLarguraCentral <= 10,
        `meiaLarguraCentral=${F.meiaLarguraCentral}: isso já não é o quadrado central`);
    assert.ok(F.bonusCentral > 0, 'sem bónus o quadrado central não é prioridade nenhuma');

    // Área com defesas espalhados: o vão MAIS livre é o do poste (x = 16),
    // mas o central (x = 2) está livre que chegue.
    const p = jogador(0, 40);
    const bb = {
        ballX: 0, isAttacking: true,
        opp: [adversario(-6, 42), adversario(6, 42), adversario(11, 41), adversario(-11, 41)]
    };
    const semBonus = melhorVaoX(p, { ...bb, vaosReivindicados: [] },
        42, [-16, -11, -6.5, -2, 2, 6.5, 11, 16]);
    const comBonus = melhorVaoX(p, { ...bb, vaosReivindicados: [] },
        42, [-16, -11, -6.5, -2, 2, 6.5, 11, 16],
        x => (Math.abs(x) <= F.meiaLarguraCentral ? F.bonusCentral : 0));

    assert.ok(Math.abs(semBonus) > F.meiaLarguraCentral,
        `sem bónus o vão escolhido já era central (${semBonus}) — o teste não prova nada`);
    assert.ok(Math.abs(comBonus) <= F.meiaLarguraCentral,
        `com bónus escolheu ${comBonus}, fora do quadrado central`);
});

test('o Fox continua a poder sair do meio quando ele está tapado', () => {
    const F = PlayingStyleTuning.foxInTheBox;
    const p = jogador(0, 40);
    // Quadrado central cheio de defesas; os lados livres.
    const bb = {
        ballX: 0, isAttacking: true, vaosReivindicados: [],
        opp: [adversario(-2, 42), adversario(2, 42), adversario(6.5, 42), adversario(-6.5, 42)]
    };
    const x = melhorVaoX(p, bb, 42, [-16, -11, -6.5, -2, 2, 6.5, 11, 16],
        c => (Math.abs(c) <= F.meiaLarguraCentral ? F.bonusCentral : 0));
    assert.ok(Math.abs(x) > F.meiaLarguraCentral,
        `com o meio todo tapado ficou em ${x}: o bónus virou uma prisão`);
});

test('o Dummy Runner corre para o lado da jogada, e a distância tem tecto', () => {
    const D = PlayingStyleTuning.dummyRunner;
    assert.ok(D.lateralDoPortador > 0 && D.lateralDoPortador <= 15,
        'lateralDoPortador fora do que é uma corrida ao lado da jogada');
    assert.ok(D.distanciaMax >= 15 && D.distanciaMax <= 30,
        'distanciaMax fora do alcance de um passe');

    const ini = srcEstilos.indexOf('est.atraiDefesa && p._dummyAtivo');
    const corpo = srcEstilos.slice(ini, ini + 3000);
    assert.ok(corpo.includes('ladoJogada'),
        'o Dummy Runner voltou a correr para o lado do posto dele');
    assert.ok(!/targetX = ladoEst \* 15\.0/.test(corpo),
        'ainda lá está o `ladoEst * 15`');
    assert.ok(corpo.includes('D.distanciaMax'),
        'a corrida deixou de ter tecto de afastamento ao portador');
});

test('a corrida sobrevive ao voo do passe (sem portador, a referência é a bola)', () => {
    assert.ok(srcEstilos.includes('const refDummy ='),
        'a referência da corrida voltou a exigir bb.carrier — no voo do passe não há nenhum');
});

test('o pêndulo tem tecto de afastamento lateral à bola', () => {
    assert.strictEqual(BlockShape.penduloParaABola, true, 'o pêndulo está desligado');
    assert.ok(BlockShape.distanciaMaxX >= 15 && BlockShape.distanciaMaxX <= 30,
        `distanciaMaxX=${BlockShape.distanciaMaxX}: fora do que separa jogar largo de jogar sozinho`);
    assert.ok(srcTeam.includes('BlockShape.penduloParaABola'),
        'a camada posicional não aplica o pêndulo');
    // Só com posse: sem bola, fechar o lado contrário entrega a ala.
    // Procura a GUARDA (a linha do `if`), não a primeira menção — o nome
    // aparece antes nos comentários da regra do lateral oposto.
    const ini = srcTeam.indexOf("BlockShape.penduloParaABola && p.role !== 'gk'");
    assert.ok(ini > 0, 'a guarda do pêndulo mudou de forma: o teste já não a encontra');
    const corpo = srcTeam.slice(ini - 400, ini + 600);
    assert.ok(corpo.includes('bb.isAttacking'), 'o pêndulo está a agir também sem posse');
    assert.ok(corpo.includes('bb.chaser !== p'), 'o pêndulo prende quem vai à bola');
});
