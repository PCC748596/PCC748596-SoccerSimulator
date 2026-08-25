/*
PRESSÃO DEFENSIVA E COMPRIMENTO DO BLOCO.

PORQUE EXISTE. Via-se no ecrã: os jogadores sem bola corriam em cima do
portador o jogo inteiro. A causa estava no `deveMandarChaser` — a Defensive
Pressure decidia só ONDE se perseguia (que metade do campo) e nunca SE valia a
pena:

    if (o.pressaoAlta) return true;
    return !(o.bolaZ * o.dir > 0);      // no próprio meio-campo: SEMPRE

Com a bola do lado certo do campo mandava-se um caçador em todos os frames, sem
condição de distância nenhuma. Um bloco não faz isso: mantém a forma e só sai
quando o portador entra no alcance de quem está de guarda.

A excepção que tem de sobreviver a tudo: no PRÓPRIO TERÇO DEFENSIVO persegue-se
sempre. Sem ela trocava-se um defeito por outro pior — o portador entrava na
área a conduzir sem ninguém lhe sair ao caminho.

Corre com: node tests/pressao_e_bloco.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcTeam = ler('js/bt/team_bt.js');
const srcConfig = ler('js/config.js');

const ini = srcTeam.indexOf('function deveMandarChaser');
if (ini < 0) throw new Error('deveMandarChaser não encontrada');
const deveMandarChaser = new Function(
    srcTeam.slice(ini, srcTeam.indexOf(LF + '}', ini) + 2) +
    '; return deveMandarChaser;')();

function extrairObjecto(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    const f = src.indexOf(LF + '};', i);
    return new Function(`const CAMPO_COMP = 106;
        ${src.slice(i, f + 3)}; return ${nome};`)();
}
const MarkingModel = extrairObjecto(srcConfig, 'MarkingModel');
const MentalidadeModel = extrairObjecto(srcConfig, 'MentalidadeModel');
const BlockShape = extrairObjecto(srcConfig, 'BlockShape');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

const RAIO = MarkingModel.raioDeAccionamento;
const EMERG = MarkingModel.tercoDeEmergencia;

// Defensor com portador adversário, no próprio meio-campo (bolaZ * dir < 0).
const cenario = (extra) => Object.assign({
    gkTemBola: false,
    bolaSolta: false,
    isAttacking: false,
    bolaZ: -10, dir: 1,
    pressaoAlta: false,
    tercoDeEmergencia: EMERG,
    raioAccionamento: RAIO.balanced,
    distAoPortador: 30
}, extra);

/* ===================================================================== */
console.log(LF + '1 — o rush: já não se sai à bola a qualquer distância');
{
    // O caso que se via no ecrã: portador longe, no nosso meio-campo.
    const longe = deveMandarChaser(cenario({ distAoPortador: 30, bolaZ: -10 }));
    if (longe) erro('portador a 30 m e a equipa sai à bola — é o rush outra vez');
    else ok('portador a 30 m: ninguém arranca, a equipa mantém a forma');

    // Dentro do alcance sai, senão ninguém defendia.
    const perto = deveMandarChaser(cenario({ distAoPortador: 5, bolaZ: -10 }));
    if (!perto) erro('portador a 5 m e ninguém lhe sai ao caminho');
    else ok('portador a 5 m: sai-se à bola');

    // A fronteira é o raio, e é inclusiva.
    const naLinha = deveMandarChaser(cenario({ distAoPortador: RAIO.balanced, bolaZ: -10 }));
    if (!naLinha) erro(`exactamente a ${RAIO.balanced} m devia accionar`);
    else ok(`a fronteira (${RAIO.balanced} m) acciona`);
}

console.log(LF + '2 — a Defensive Pressure muda o raio');
{
    if (!(RAIO.low < RAIO.balanced && RAIO.balanced < RAIO.high)) {
        erro(`os raios deviam crescer com a pressão: ${JSON.stringify(RAIO)}`);
    } else ok(`low ${RAIO.low} m < balanced ${RAIO.balanced} m < high ${RAIO.high} m`);

    // A 12 m: pressão baixa contém-se, pressão média sai.
    const d = 12;
    const baixa = deveMandarChaser(cenario({ distAoPortador: d, raioAccionamento: RAIO.low }));
    const media = deveMandarChaser(cenario({ distAoPortador: d, raioAccionamento: RAIO.balanced }));
    if (baixa) erro('pressão baixa não devia sair a 12 m');
    else if (!media) erro('pressão média devia sair a 12 m');
    else ok('a 12 m: pressão baixa contém-se, pressão média sai');
}

/*
3 — A EXCEPÇÃO QUE NÃO PODE CAIR. Perto da própria baliza persegue-se sempre,
mesmo em pressão baixa e com o portador longe. Sem isto trocava-se o rush por
uma equipa que vê o adversário entrar na área a conduzir.
*/
console.log(LF + '3 — no próprio terço defensivo persegue-se sempre');
{
    const emCasa = deveMandarChaser(cenario({
        bolaZ: EMERG - 5, distAoPortador: 30, raioAccionamento: RAIO.low
    }));
    if (!emCasa) erro('bola no próprio terço defensivo e ninguém persegue');
    else ok('terço defensivo: persegue-se mesmo em pressão baixa e a 30 m');

    // E do outro lado do campo (dir = -1) tem de valer igual.
    const outroLado = deveMandarChaser(cenario({
        dir: -1, bolaZ: -(EMERG - 5), distAoPortador: 30, raioAccionamento: RAIO.low
    }));
    if (!outroLado) erro('a excepção não funciona para a equipa que ataca -z');
    else ok('vale para as duas equipas');
}

console.log(LF + '4 — o que não podia mudar');
{
    // Bola solta: vai-se buscar sempre, seja onde for. É o encrave de 25 s que
    // o tests/chaser_bola_solta.test.js já fixa — aqui só se confirma que o
    // raio novo não passou à frente dele.
    const solta = deveMandarChaser(cenario({
        bolaSolta: true, distAoPortador: Infinity, bolaZ: 40
    }));
    if (!solta) erro('bola solta tem de ser sempre perseguida — o encrave voltou');
    else ok('bola solta: continua a ir-se buscar, a qualquer distância');

    // A atacar não se persegue; o guarda-redes com a bola não se ataca.
    if (deveMandarChaser(cenario({ isAttacking: true, distAoPortador: 2 }))) {
        erro('a equipa a atacar não devia mandar chaser');
    } else ok('a atacar: não');

    if (deveMandarChaser(cenario({ gkTemBola: true, distAoPortador: 2 }))) {
        erro('não se vai ao guarda-redes com a bola nas mãos');
    } else ok('guarda-redes com a bola: não');

    // Campo de ataque sem pressão alta: continua a não se perseguir.
    if (deveMandarChaser(cenario({ bolaZ: 20, distAoPortador: 2 }))) {
        erro('sem pressão alta não se persegue no campo de ataque');
    } else ok('campo de ataque sem pressão alta: não');

    // Pressão alta ignora a metade do campo, mas já não ignora a distância.
    if (!deveMandarChaser(cenario({ pressaoAlta: true, bolaZ: 20, distAoPortador: 3 }))) {
        erro('pressão alta devia sair à bola no campo de ataque');
    } else ok('pressão alta: sai à bola em qualquer metade');
}

/*
5 — O COMPRIMENTO DO BLOCO NAS MENTALIDADES DEFENSIVAS.
*/
console.log(LF + '5 — T.Defensiva e Defensiva jogam curtas (30 m)');
{
    const metros = (chave) => BlockShape.profundidade[chave] * 106;

    for (const m of ['muito_defensiva', 'defesa']) {
        const chave = MentalidadeModel[m].profundidade;
        if (chave !== 'short') {
            erro(`${m} devia impor 'short', impõe ${JSON.stringify(chave)}`);
        } else if (Math.abs(metros(chave) - 30) > 0.5) {
            erro(`'short' devia dar 30 m, dá ${metros(chave).toFixed(1)} m`);
        } else ok(`${m}: ${metros(chave).toFixed(0)} m`);
    }

    // As outras três não impõem nada — o painel continua a mandar nelas.
    for (const m of ['balanceado', 'ataque', 'muito_ofensiva']) {
        if (MentalidadeModel[m].profundidade !== undefined) {
            erro(`${m} não devia impor comprimento; o Length Compactness é do utilizador`);
        }
    }
    ok('as outras três continuam a obedecer ao painel');

    /*
    E TEM DE SE VER NO PAINEL. O computeBlock obedecia, mas o dropdown ficava
    na escolha anterior — por fora parecia que a regra não fazia nada. O
    `Tatics.update` escreve nos dois: no `select` e na variável.
    */
    const srcCfg = ler('js/config.js');
    const iUpd = srcCfg.indexOf('    update: function () {');
    const corpoUpdate = srcCfg.slice(iUpd, srcCfg.indexOf(LF + '    },', iUpd));
    if (!/mental\.profundidade/.test(corpoUpdate)) {
        erro('o Tatics.update não aplica a profundidade da mentalidade');
    } else if (!/getElementById\('t-length-compactness'\)[\s\S]{0,120}\.value\s*=/.test(corpoUpdate)) {
        erro('o dropdown do Length Compactness não é actualizado — o painel mente');
    } else ok('o dropdown do painel passa a mostrar Small (30m)');

    // As chaves do MentalidadeModel têm de existir no <select> do HTML, senão
    // escrever nele não faz nada e falha em silêncio.
    const html = ler('index.html');
    for (const m of ['muito_defensiva', 'defesa']) {
        const chave = MentalidadeModel[m].profundidade;
        if (html.indexOf(`value="${chave}"`) < 0) {
            erro(`'${chave}' não é uma opção do <select> — escrever nele não faz nada`);
        }
        if (html.indexOf(`value="${m}"`) < 0) {
            erro(`a mentalidade '${m}' não existe no <select> do painel`);
        }
    }
    ok('as chaves batem certo com as opções do HTML');
}

console.log(LF + (falhas === 0
    ? 'pressao_e_bloco: tudo bem.'
    : `pressao_e_bloco: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
