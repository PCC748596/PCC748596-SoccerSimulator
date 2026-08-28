/*
TODA A BOLA PARADA TEM DE TER PRAZO.

O QUE SE VIU: o guarda-redes congelado no ecrã, agachado, indefinidamente. Não
era um gesto estalado — era o relógio dele a deixar de andar.

A CAUSA ESTRUTURAL. O `player.update` só chama o `updateGK` fora do canto:

    if (this.role === 'gk' && Match.state !== 'CORNER_KICK') this.updateGK(dt);

Enquanto `Match.state` for 'CORNER_KICK', ninguém mexe no `gkEstado`, no
`gkTempoMergulho` nem no `gkKickAction` — a pose fica exactamente onde estava e
o gesto a meio nunca mais avança. Isso é aceitável durante um canto, que dura
segundos; é um jogo morto se o canto nunca acabar.

E o canto podia mesmo nunca acabar: de todos os estados de bola parada, era o
ÚNICO sem cão-de-guarda.

    FREE_KICK   15 s -> PLAY
    PENALTY     15 s -> PLAY
    THROW_IN    15 s -> reset
    GOAL_KICK   20 s -> resetPlay()
    CORNER_KICK   nenhum

Incrementava o `setPieceTimer` em todos os frames e nunca olhava para ele. O
canto só é batido quando o SET_PIECE_TAKER vê `!Match.cantoBolaAlvo`, e o
`cantoBolaAlvo` só é limpo depois de a bola ATERRAR (`y <= raio + 0.01`) —
se ela não aterrar, ou se não houver batedor nesse estado da FSM, ninguém
desbloqueia coisa nenhuma.

Este teste lê a fonte em vez de correr o Match: o `update` do Match toca em
cena, jogadores, som e DOM, e montar isso em Node era montar o jogo inteiro
para verificar uma condição de cinco linhas. O que interessa fixar é
estrutural — que nenhum estado de bola parada fique sem prazo — e isso lê-se.

Corre com: node tests/bola_parada_com_prazo.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcMatch = ['js/match/match_state.js', 'js/match/match_setup.js', 'js/match/match_physics.js', 'js/match/match_setpieces.js', 'js/match/match_loop.js', 'js/match/match_ui.js'].map(ler).join('\n');
const srcPlayer = ler('js/player.js');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/*
Corpo do `if (this.state === 'XXX') { ... }` dentro do update, por contagem de
chavetas. Regex não serve: os blocos têm chavetas aninhadas e comentários com
chavetas lá dentro.
*/
function blocoDoEstado(src, estado) {
    const marca = `if (this.state === '${estado}') {`;
    const i = src.indexOf(marca);
    if (i < 0) return null;

    let profundidade = 0, j = i + marca.length - 1;
    for (; j < src.length; j++) {
        if (src[j] === '{') profundidade++;
        else if (src[j] === '}') {
            profundidade--;
            if (profundidade === 0) break;
        }
    }
    return src.slice(i, j + 1);
}

/* =====================================================================
   1 — TODOS OS ESTADOS DE BOLA PARADA TÊM PRAZO
   ===================================================================== */
console.log(LF + '1 — nenhum estado de bola parada fica sem cão-de-guarda');
{
    const estados = ['CORNER_KICK', 'FREE_KICK', 'PENALTY', 'THROW_IN', 'GOAL_KICK'];

    for (const estado of estados) {
        const bloco = blocoDoEstado(srcMatch, estado);
        if (!bloco) {
            erro(`não encontrei o bloco do estado ${estado} no update`);
            continue;
        }

        // Um prazo é um teste ao setPieceTimer contra um número.
        const temPrazo = /setPieceTimer\s*>\s*[\d.]+/.test(bloco);
        if (!temPrazo) {
            erro(`${estado} incrementa o setPieceTimer e nunca o testa — ` +
                `pode ficar aceso para sempre`);
        } else {
            const prazo = bloco.match(/setPieceTimer\s*>\s*([\d.]+)/)[1];
            ok(`${estado}: prazo de ${prazo} s`);
        }
    }
}

/* =====================================================================
   2 — O CANTO LIMPA O ESTADO DA BOLA AO EXPIRAR
   ===================================================================== */
console.log(LF + '2 — ao expirar, o canto não deixa estado pendurado');
{
    const bloco = blocoDoEstado(srcMatch, 'CORNER_KICK');
    if (!bloco) {
        erro('não encontrei o bloco do CORNER_KICK');
    } else {
        /*
        O `cantoBolaAlvo` e o `cantoAguardaChao` são o que prende o lance. Se o
        prazo dispara e os deixa escritos, o canto seguinte arranca já com a
        bola "à espera de aterrar" de um lance que nunca houve.
        */
        const i = bloco.search(/setPieceTimer\s*>\s*[\d.]+/);
        const depoisDoPrazo = (i >= 0) ? bloco.slice(i) : '';

        for (const campo of ['cantoBolaAlvo', 'cantoAguardaChao']) {
            if (!depoisDoPrazo.includes(campo)) {
                erro(`o prazo do canto não limpa o \`${campo}\``);
            } else {
                ok(`o prazo limpa o \`${campo}\``);
            }
        }

        if (!depoisDoPrazo.includes('resetPlay()')) {
            erro('o prazo do canto não chama o resetPlay() — é ele que limpa o ' +
                'batedor, o gkHoldingBall e os estados dos guarda-redes');
        } else {
            ok('o prazo chama o resetPlay()');
        }
    }
}

/* =====================================================================
   3 — A RAZÃO POR QUE ISTO CONGELAVA O GUARDA-REDES
   ===================================================================== */
console.log(LF + '3 — durante o canto o updateGK não corre (é o que congela)');
{
    /*
    Não é para mudar — o guarda-redes joga o canto com a árvore normal. Fica
    fixado porque é a razão de o canto preso ser MUITO pior do que os outros
    estados presos: nos outros o boneco continua a ser animado, aqui não.
    */
    if (!/role === 'gk' && Match\.state !== 'CORNER_KICK'/.test(srcPlayer)) {
        erro('a guarda do updateGK mudou de forma — este teste precisa de ser ' +
            'reescrito, e o comentário do prazo do canto revisto');
    } else {
        ok('a guarda existe: por isso o canto preso congela o guarda-redes');
    }
}

console.log(LF + (falhas ? `FALHAS: ${falhas}` : 'TUDO OK'));
process.exit(falhas ? 1 : 0);
