/*
O GUARDA-REDES DEFENDE, AGARRA, E O JOGO TRAVA.

O QUE SE VIA: logo a seguir a uma defesa, o guarda-redes ficava parado com a
bola, indefinidamente, e o jogo morria à volta dele.

A CAUSA, no ramo 'maos' do `updateGK` (defesa de pé com as mãos, a mais comum).
Duas condições independentes, na mesma passagem e por esta ordem:

    if (Math.random() < catchChanceM) this.grabBall();   // -> 'segurando'
    ...
    if (tM >= GoalkeeperPose.maosDur) this.gkEstado = 'idle';

O `grabBall()` põe `gkEstado = 'segurando'`. O teste do fim do gesto corre a
seguir, no MESMO frame, e escrevia 'idle' por cima — com o `hasBall` a true.

E de 'idle' não há saída nenhuma para essa situação. O ramo de decisão do
'idle' só reage a bolas SEM dono (`semDono`, `looseBallInBox`) ou em movimento
(`possoEspalmar`, que com a bola parada dá 999 s de tempo até ele). Com o
guarda-redes a ser o próprio `Match.ballCarrier` e a bola a velocidade zero,
nenhuma das portas abre: fica com ela presa para sempre, e o `player.update`
cola-lha ao corpo a cada frame.

O ramo 'salto_alto' tinha a ordem INVERSA (saída primeiro, `grabBall` depois) e
tempos que não se sobrepõem — estava a salvo por acidente. A guarda passou a
ser explícita nos dois.

Este teste lê a fonte: o `updateGK` são centenas de linhas a tocar em rig,
cena e `Match`, e montá-lo em Node era montar o jogo inteiro para verificar
uma condição. O que interessa fixar é estrutural — que a saída do gesto nunca
escreva por cima do estado que a captura escolheu — e isso lê-se.

Corre com: node tests/gk_agarra_no_fim_do_gesto.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcPlayer = ler('js/player.js');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/*
Corpo do ramo `} else if (this.gkEstado === 'XXX') {` até ao `else if`
seguinte. Contagem de chavetas, não regex: os ramos têm blocos aninhados e
comentários com chavetas lá dentro.
*/
function ramoDoEstado(src, estado) {
    const marca = `this.gkEstado === '${estado}'`;
    const i = src.indexOf(marca);
    if (i < 0) return null;

    const abre = src.indexOf('{', i);
    if (abre < 0) return null;

    let profundidade = 0, j = abre;
    for (; j < src.length; j++) {
        if (src[j] === '{') profundidade++;
        else if (src[j] === '}') {
            profundidade--;
            if (profundidade === 0) break;
        }
    }
    return src.slice(abre, j + 1);
}

/* =====================================================================
   1 — A SAÍDA PARA 'idle' NÃO PISA UMA CAPTURA
   ===================================================================== */
console.log(LF + '1 — os gestos de defesa não escrevem `idle` por cima do `segurando`');
{
    /*
    Um ramo é seguro se, em toda a atribuição de `gkEstado = 'idle'`, a
    condição que a governa confirmar que o estado ainda é o do gesto. Sem isso,
    uma captura no último frame é apagada.
    */
    for (const estado of ['maos', 'salto_alto']) {
        const ramo = ramoDoEstado(srcPlayer, estado);
        if (!ramo) {
            erro(`não encontrei o ramo '${estado}' no updateGK`);
            continue;
        }

        if (!ramo.includes("gkEstado = 'idle'")) {
            erro(`o ramo '${estado}' não tem saída para 'idle' — o teste ` +
                `precisa de ser revisto`);
            continue;
        }

        // A guarda tem de nomear o próprio estado do gesto.
        const temGuarda = ramo.includes(`this.gkEstado === '${estado}'`);
        if (!temGuarda) {
            erro(`o ramo '${estado}' põe 'idle' sem confirmar que o grabBall ` +
                `não mudou o estado — uma captura no último frame é apagada`);
        } else {
            ok(`'${estado}': a saída para idle confirma o estado do gesto`);
        }
    }
}

/* =====================================================================
   2 — A PREMISSA: O grabBall ESCREVE 'segurando' NO MESMO FRAME
   ===================================================================== */
console.log(LF + '2 — o grabBall muda mesmo o estado (senão não havia bug)');
{
    /*
    Se o `grabBall` deixasse de escrever o estado, esta guarda passava a ser
    inútil e a explicação toda deixava de valer — melhor descobri-lo aqui do
    que voltar a perseguir o congelamento no ecrã.
    */
    const i = srcPlayer.indexOf('grabBall(manterPose)');
    if (i < 0) {
        erro('não encontrei o grabBall(manterPose)');
    } else {
        const corpo = srcPlayer.slice(i, i + 4000);
        if (!corpo.includes("this.gkEstado = 'segurando'")) {
            erro('o grabBall já não escreve `segurando` — a guarda dos gestos ' +
                'ficou sem sentido e o comentário dela está errado');
        } else {
            ok('o grabBall escreve `segurando` quando agarra');
        }
    }
}

/* =====================================================================
   3 — E DE 'idle' COM A BOLA NÃO HAVIA SAÍDA
   ===================================================================== */
console.log(LF + '3 — porque é que cair em `idle` com a bola era terminal');
{
    /*
    As três portas do ramo de decisão exigem, todas, que a bola NÃO seja dele
    ou que esteja a mexer-se. Com o guarda-redes a segurá-la, nenhuma abre —
    é por isso que o estado errado não se corrigia sozinho no frame seguinte.
    */
    const ramoIdle = ramoDoEstado(srcPlayer, 'idle');
    const alvo = ramoIdle || srcPlayer;

    const portas = [
        { nome: 'semDono', trecho: '!Match.ballCarrier' },
        { nome: 'looseBallInBox', trecho: '!carrier' },
        { nome: 'possoEspalmar', trecho: 'window.bolaChutada' }
    ];

    let encontradas = 0;
    for (const p of portas) {
        if (alvo.includes(p.trecho)) encontradas++;
    }

    if (encontradas < portas.length) {
        erro(`o ramo de decisão mudou (${encontradas}/${portas.length} portas ` +
            `encontradas) — reconfirma se 'idle' com a bola continua terminal`);
    } else {
        ok('as três portas do `idle` exigem bola sem dono ou em movimento');
    }
}

console.log(LF + (falhas ? `FALHAS: ${falhas}` : 'TUDO OK'));
process.exit(falhas ? 1 : 0);
