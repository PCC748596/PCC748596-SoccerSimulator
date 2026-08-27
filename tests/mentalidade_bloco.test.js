/*
A MENTALIDADE TEM DE MEXER NO BLOCO — sobretudo a DEFENDER.

`MentalidadeModel[estilo].blocoZ` existia desde sempre no config, com o
comentário "A Mentalidade fala uma vez, pelo blocoZ", e **nunca era lido**. A
única coisa que a Mentalidade mexia era a `profundidade` (escolherProfundidade)
— e essa, sem posse, é forçada a 'short' para toda a gente.

Ou seja: com a equipa a defender, escolher Muito Defensiva ou Muito Ofensiva
dava o mesmo bloco. Medido em jogo antes da correcção, mediana da profundidade
do alvo no referencial de ataque:

                    Muito Defensiva   Muito Ofensiva
    defesas              -16.1             -16.6
    médios                -6.1              -7.0

Um metro, e no sentido errado. E mesmo depois de ligar o `blocoZ` ao centro do
bloco, os DEFESAS continuavam parados: a traseira é ancorada pela Linha
Defensiva do painel, que tem a última palavra — daí o `pesoNaLinha`.

Este teste fixa as duas ligações e a monotonia da escala.

Corre com: node --test tests/mentalidade_bloco.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8'));
const srcTeam = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8'));

const CAMPO_COMP = 106;

function extrairObjecto(src, nome) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function('CAMPO_COMP', `${src.slice(ini, fim + 3)}; return ${nome};`)(CAMPO_COMP);
}

const M = extrairObjecto(srcConfig, 'MentalidadeModel');
const ESCALA = ['muito_defensiva', 'defesa', 'balanceado', 'ataque', 'muito_ofensiva'];

test('as cinco mentalidades têm blocoZ, e em escada', () => {
    for (const e of ESCALA) {
        assert.ok(M[e], `mentalidade ${e} em falta`);
        assert.ok(typeof M[e].blocoZ === 'number', `${e} sem blocoZ`);
    }
    for (let i = 1; i < ESCALA.length; i++) {
        assert.ok(M[ESCALA[i]].blocoZ > M[ESCALA[i - 1]].blocoZ,
            `${ESCALA[i]} não é mais ofensiva do que ${ESCALA[i - 1]}`);
    }
    // E a escala tem de valer alguma coisa: 20 m entre os extremos.
    assert.ok(M.muito_ofensiva.blocoZ - M.muito_defensiva.blocoZ >= 15,
        'a escala é demasiado estreita para se ver em campo');
});

test('o blocoZ é MESMO lido no computeBlock', () => {
    /*
    A regressão que este teste existe para apanhar: a constante ficar no config
    a descrever um comportamento que o código não tem.
    */
    assert.ok(/MentalidadeModel\[Tatics\.estilo\][\s\S]{0,120}blocoZ/.test(srcTeam),
        'o team_bt.js não lê MentalidadeModel[...].blocoZ');
    assert.ok(/centroZ\s*=\s*bolaZDir\s*\+\s*bb\.blocoZSuave\s*\+\s*mentalBloco/.test(srcTeam),
        'o centro do bloco não soma a mentalidade');
});

test('e chega também à âncora da última linha — senão os defesas não se mexem', () => {
    assert.ok(typeof M.pesoNaLinha === 'number', 'MentalidadeModel.pesoNaLinha em falta');
    assert.ok(M.pesoNaLinha > 0 && M.pesoNaLinha <= 1,
        `pesoNaLinha ${M.pesoNaLinha} fora de (0, 1]`);
    assert.ok(/capLinha\s*=\s*capBase\s*\+\s*mentalBloco\s*\*\s*pesoMental/.test(srcTeam),
        'a âncora da linha defensiva não recebe a mentalidade — a traseira do ' +
        'bloco continua a mandar sozinha e os defesas ficam onde estavam');
});

test('a Linha Defensiva do painel continua a ser o controlo grosso', () => {
    const TeamShape = extrairObjecto(srcConfig, 'TeamShape');
    const linhas = TeamShape.linhaDefensiva;
    const amplitudePainel = Math.abs(linhas.high - linhas.low);
    const amplitudeMental = Math.abs(
        (M.muito_ofensiva.blocoZ - M.muito_defensiva.blocoZ) * M.pesoNaLinha);
    assert.ok(amplitudePainel > amplitudeMental,
        `a Mentalidade (${amplitudeMental.toFixed(1)} m) passou à frente do botão ` +
        `Linha Defensiva (${amplitudePainel.toFixed(1)} m) — o controlo dedicado ` +
        'tem de continuar a mandar mais');
});
