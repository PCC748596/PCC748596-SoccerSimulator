/*
A BOLA PARADA QUE NINGUÉM IA BUSCAR — o jogo encravado.

O QUE SE VIA: num lote, TODOS os jogos congelavam. A bola ficava parada a
poucos metros da linha de fundo (`bolaVel: 0`, `portador: null`), 22 jogadores
no bloco, `Match.state === 'PLAY'`, e ninguém ia lá. Medido: um jogo de 5400 s
que morreu aos 375 s, com `MOVE_TO_POS` a durar 5066 s seguidos.

A CAUSA. Quem decide se alguém vai à bola é o `deveMandarChaser` (team_bt.js),
e a primeira coisa que ele pergunta é se a bola está solta:

    const bolaSolta = !Match.ballCarrier && !alguemAConduzir() &&
                      !Match.intendedReceiver;

O `intendedReceiver` é escrito quando o passe sai e limpo quando alguém toca na
bola. Para o caso do passe que passa AO LADO do destinatário existe uma
expiração no `updateBall`, e é aí que estava o furo:

    if (alvo && this.ballVel.lengthSq() > 0.5) { ... }

**A expiração exigia que a bola estivesse em movimento.** Se ela pára antes de
o teste disparar, a condição nunca mais volta a correr — porque a bola está
parada, e é a própria expiração que a poria a mexer outra vez:

    bola pára longe do destinatário
      -> intendedReceiver nunca é limpo
      -> bolaSolta = false
      -> deveMandarChaser não manda ninguém
      -> ninguém toca na bola
      -> a bola continua parada

Um deadlock que se alimenta a si próprio, e não tem saída nenhuma: os outros
sítios que limpam o `intendedReceiver` são todos no CONTACTO (resolveBallContact),
na bola parada (setupSetPiece) ou no `resetPlay`.

O teste de "afasta-se dele?" também não faz sentido nenhum a velocidade zero: o
produto escalar dá 0, que não é "afasta" nem "aproxima".

O FIX: uma bola PARADA e longe do destinatário é bola solta, ponto final — não
está a caminho de ninguém. A decisão saiu para o `passeMorreuParaODestinatario`
(utils.js), pura, para se poder fixar aqui.

Corre com: node tests/passe_morto_bola_parada.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcUtils = ler('js/utils.js');
const srcMatch = ['js/match/match_state.js', 'js/match/match_setup.js', 'js/match/match_physics.js', 'js/match/match_setpieces.js', 'js/match/match_loop.js', 'js/match/match_ui.js'].map(ler).join('\n');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

function extrairFuncao(src, nome) {
    const i = src.indexOf(`function ${nome}(`);
    if (i < 0) throw new Error(`${nome}() não encontrada em utils.js`);
    const f = src.indexOf(LF + '}', i);
    return src.slice(i, f + 2);
}

const passeMorreuParaODestinatario = new Function(
    `${extrairFuncao(srcUtils, 'passeMorreuParaODestinatario')};
     return passeMorreuParaODestinatario;`)();

// O destinatário está sempre na origem; move-se a bola à volta dele.
const cenario = (bolaX, bolaZ, velX, velZ, velY) => ({
    bolaX: bolaX, bolaZ: bolaZ,
    alvoX: 0, alvoZ: 0,
    velX: velX, velZ: velZ, velY: velY || 0,
    distPerdido: 4.0,      // PerceptionModel.passePerdidoDist
    paradaV2: 0.5          // o mesmo limiar do lengthSq() original
});

/* =====================================================================
   1 — O CASO QUE ENCRAVAVA O JOGO
   ===================================================================== */
console.log(LF + '1 — bola PARADA e longe do destinatário é bola solta');
{
    // Foi isto que se viu no lote: bola imóvel a 20 m de quem a ia receber.
    const morreu = passeMorreuParaODestinatario(cenario(0, 20, 0, 0));
    if (!morreu) {
        erro('bola parada a 20 m do destinatário não foi dada como perdida — ' +
            'o intendedReceiver fica pendurado e ninguém vai à bola');
    } else {
        ok('bola parada a 20 m: perdida, volta a ser de quem lá chegar');
    }

    // E a mais pequena velocidade residual não pode mudar a resposta: uma bola
    // a 0,1 m/s a 20 m dele também não vai lá ter.
    const quaseParada = passeMorreuParaODestinatario(cenario(0, 20, 0.05, 0.05));
    if (!quaseParada) {
        erro('bola quase parada a 20 m não foi dada como perdida');
    } else {
        ok('bola quase parada a 20 m: perdida também');
    }
}

/* =====================================================================
   2 — A BOLA QUE PARA AOS PÉS DELE CONTINUA A SER DELE
   ===================================================================== */
console.log(LF + '2 — parada PERTO do destinatário continua endereçada');
{
    /*
    O passe que chega e morre aos pés do receptor é um passe BEM sucedido, e
    tirar-lhe a bola ali era trocar um encrave por outro defeito: perdia o
    `receiverBonus` da disputa e punha meia equipa a convergir numa bola que
    já tinha dono.
    */
    const perto = passeMorreuParaODestinatario(cenario(0, 2.0, 0, 0));
    if (perto) {
        erro('bola parada a 2 m do destinatário foi dada como perdida — ' +
            'é o passe que chegou, não um passe morto');
    } else {
        ok('bola parada a 2 m: continua a ser dele');
    }

    // Mesmo em cima do limite, o de dentro fica.
    const noLimite = passeMorreuParaODestinatario(cenario(0, 3.9, 0, 0));
    if (noLimite) {
        erro('bola a 3,9 m (dentro do passePerdidoDist de 4,0) foi dada como perdida');
    } else {
        ok('bola parada a 3,9 m: dentro do limite, continua a ser dele');
    }
}

/* =====================================================================
   3 — O COMPORTAMENTO ANTIGO, COM A BOLA A MEXER, NÃO MUDOU
   ===================================================================== */
console.log(LF + '3 — com a bola em movimento vale o teste de sempre');
{
    // Passou-lhe ao lado e vai a fugir: perdido (era o único caso tratado).
    const aFugir = passeMorreuParaODestinatario(cenario(0, 20, 0, 8));
    if (!aFugir) {
        erro('bola a 20 m e a afastar-se não foi dada como perdida');
    } else {
        ok('bola longe e a afastar-se: perdida');
    }

    // Ainda a caminho dele, mesmo que longe: é o passe a decorrer.
    const aCaminho = passeMorreuParaODestinatario(cenario(0, 20, 0, -8));
    if (aCaminho) {
        erro('bola a 20 m mas a VIR na direcção dele foi dada como perdida — ' +
            'é um passe longo normal a meio do voo');
    } else {
        ok('bola longe mas a aproximar-se: o passe está a decorrer');
    }
}

/* =====================================================================
   4 — UMA BOLA NO AR NÃO ESTÁ PARADA
   ===================================================================== */
console.log(LF + '4 — a cair na vertical ainda não parou');
{
    /*
    Um cruzamento ou passe alto pode ter velocidade horizontal quase nula no
    topo do arco e continuar a ter muito `y`. Chamar-lhe "parada" tirava o
    dono a uma bola que ainda vai a caminho — o teste da paragem tem de olhar
    para as três componentes, como o `lengthSq()` original olhava.
    */
    // Deriva horizontal minúscula, MAS na direcção dele (velZ negativo, e a
    // bola está em z positivo): não é "afasta-se", portanto o único veredicto
    // possível seria "parada" — e é isso que este caso isola.
    const aCair = passeMorreuParaODestinatario(cenario(0, 6, 0.05, -0.05, 6.0));
    if (aCair) {
        erro('bola a cair a 6 m/s na vertical foi dada como parada — ' +
            'o teste da paragem está a ignorar a componente y');
    } else {
        ok('bola a cair na vertical: não é uma bola parada');
    }

    /*
    E o contrário, para o caso não passar por acaso: a MESMA bola sem
    velocidade vertical é mesmo uma bola parada.
    */
    const semY = passeMorreuParaODestinatario(cenario(0, 6, 0.05, -0.05, 0));
    if (!semY) {
        erro('a mesma bola sem velocidade vertical não foi dada como parada — ' +
            'o caso de cima passou por outra razão qualquer');
    } else {
        ok('a mesma bola sem y: parada, como devia');
    }
}

/* =====================================================================
   5 — O match.js USA MESMO A FUNÇÃO
   ===================================================================== */
console.log(LF + '5 — o updateBall passou a usar a função, e sem a guarda antiga');
{
    if (!srcMatch.includes('passeMorreuParaODestinatario')) {
        erro('o match.js não chama passeMorreuParaODestinatario');
    } else {
        ok('o match.js chama passeMorreuParaODestinatario');
    }

    /*
    A guarda antiga tinha de SAIR e não ficar a envolver a chamada: deixá-la lá
    era manter o deadlock com a lógica nova lá dentro, sem nunca lhe chegar.
    */
    if (/alvo && this\.ballVel\.lengthSq\(\) > 0\.5/.test(srcMatch)) {
        erro('a guarda `ballVel.lengthSq() > 0.5` ainda está no updateBall — ' +
            'com ela, a bola parada nunca chega à decisão nova');
    } else {
        ok('a guarda de "só se a bola estiver a mexer" saiu');
    }
}

console.log(LF + (falhas ? `FALHAS: ${falhas}` : 'TUDO OK'));
process.exit(falhas ? 1 : 0);
