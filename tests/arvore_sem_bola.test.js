/*
A DECISAO SEM BOLA, DIVIDIDA POR FASE.

PORQUE. A lista era de onze ramos com as duas fases INTERCALADAS:

    1 Desarme (D)   2 Intercetar   3 IrABola   4 EsperarDevolucao   5 Overlap
    6 Receber   7 GuardaRedes
    6 Marcar (D)    7 EsperarNaArea            8 ApoioCirculacao (A)
    9 CorrerNoEspaco (A)          10 AtacarArea (A)       11 ocuparPosicao

`CorrerNoEspaco` aparecia ABAIXO de `Marcar` sem que isso quisesse dizer nada —
sao de momentos diferentes do jogo e nunca competem. Nao produzia decisoes
erradas (cada folha tem a sua guarda), mas tornava impossivel responder a "o
que e importante quando temos a bola?" sem abrir as onze condicoes, e obrigava
quem acrescentasse um ramo a adivinhar a posicao numa lista onde metade dos
vizinhos e da outra fase.

O QUE ESTE TESTE FIXA:

1. A ORDEM NAO MUDOU. Reagrupar nao pode alterar uma unica decisao — e a unica
   forma de o garantir e comparar a sequencia de folhas com a de antes.
2. Cada fase tem a sua guarda, UMA vez, no ramo.
3. Os ramos de BOLA ficam fora das duas fases: valem nas duas.

Corre com: node tests/arvore_sem_bola.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const src = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

// A sub-arvore do SemBola, do seq ate ao fecho do PlayerBT.
const iSemBola = src.indexOf("    seq('SemBola',");
if (iSemBola < 0) throw new Error('seq(SemBola) nao encontrado');
const bloco = src.slice(iSemBola);

/*
So os RAMOS (`seq`), pela ordem em que aparecem. Os `act` de dentro de cada
ramo nao entram — sao a accao, nao a prioridade — e o `sel` tambem nao, que
agrupa e nao decide.

O fallback `act('ocuparPosicao')` e a excepcao: e um act SOLTO no topo do
selector, sem seq a envolve-lo, e faz parte da ordem. Vai a lista a mao.
*/
const nomes = [];
const re = /\bseq\('([A-Za-z]+)'/g;
let m;
while ((m = re.exec(bloco)) !== null) nomes.push(m[1]);
if (/\bact\('ocuparPosicao'/.test(bloco)) nomes.push('ocuparPosicao');

console.log(LF + '1 — a ordem das folhas nao mudou');
{
    /*
    A sequencia de FOLHAS (os ramos que decidem alguma coisa) tem de ser
    exactamente esta — a mesma de antes da divisao. Os contentores novos
    (SemBolaDefendendo/SemBolaAtacando) nao contam: nao decidem, agrupam.
    */
    const esperada = [
        /*
        EsperarDevolucao e Overlap entraram aqui (jogadas combinadas, ver
        JogadasCombinadas em config.js) e é de propósito que estão ANTES do
        Receber: quem pede a tabelinha não é o destinatário do passe — o
        parceiro é —, e o arranque tem de acontecer enquanto a bola vai e vem.
        O mesmo para quem ultrapassa por fora: se o posicionamento normal
        falasse primeiro, a corrida nunca chegava a existir.
        */
        'Desarme', 'Intercetar', 'IrABola', 'EsperarDevolucao', 'Overlap',
        'Receber', 'GuardaRedes',
        'Marcar', 'EsperarNaArea',
        'ApoioDeCirculacao', 'CorrerNoEspaco', 'AtacarArea',
        'ocuparPosicao'
    ];
    const contentores = ['SemBola', 'SemBolaDefendendo', 'SemBolaAtacando'];
    const folhas = nomes.filter(n => contentores.indexOf(n) < 0);

    if (folhas.join(' > ') !== esperada.join(' > ')) {
        erro('a ordem das folhas MUDOU — a divisao alterou decisoes:');
        console.error('      antes: ' + esperada.join(' > '));
        console.error('      agora: ' + folhas.join(' > '));
    } else ok(folhas.length + ' folhas, na ordem de sempre');
}

console.log(LF + '2 — cada fase tem a sua guarda, uma vez');
{
    const def = src.indexOf("seq('SemBolaDefendendo'");
    const atk = src.indexOf("seq('SemBolaAtacando'");

    if (def < 0) erro('SemBolaDefendendo nao existe');
    else if (!/cond\('equipaSemPosse'[\s\S]{0,120}!ctx\.bb \|\| !ctx\.bb\.isAttacking/.test(src.slice(def, def + 400))) {
        erro('SemBolaDefendendo nao tem a guarda de fase');
    } else ok('a defender: !isAttacking, no ramo');

    if (atk < 0) erro('SemBolaAtacando nao existe');
    else if (!/cond\('equipaComPosse'[\s\S]{0,120}ctx\.bb && ctx\.bb\.isAttacking/.test(src.slice(atk, atk + 400))) {
        erro('SemBolaAtacando nao tem a guarda de fase');
    } else ok('a atacar: isAttacking, no ramo');

    if (def >= 0 && atk >= 0 && !(def < atk)) {
        erro('a ordem dos dois ramos inverteu-se');
    } else ok('defender antes de atacar, como estava');
}

console.log(LF + '3 — os ramos de bola ficam fora das duas fases');
{
    /*
    Desarme, Intercetar, IrABola, EsperarDevolucao, Overlap, Receber e
    GuardaRedes valem nas DUAS fases:
    uma bola solta persegue-se com posse nominal ou sem ela, e o guarda-redes
    posiciona-se sempre. Meter qualquer um deles dentro de uma fase tirava-o
    da outra em silencio.
    */
    const def = src.indexOf("seq('SemBolaDefendendo'");
    const comuns = ['Desarme', 'Intercetar', 'IrABola', 'Receber', 'GuardaRedes'];
    for (const nome of comuns) {
        const i = src.indexOf("seq('" + nome + "'", iSemBola);
        if (i < 0) erro(nome + ' desapareceu da arvore');
        else if (i > def) erro(nome + ' ficou dentro de uma fase — perde-se na outra');
    }
    ok('os cinco ramos de bola continuam acima e fora das fases');

    // E o fallback continua a ser o ultimo, sem condicao.
    if (nomes[nomes.length - 1] !== 'ocuparPosicao') {
        erro('ocuparPosicao ja nao e o ultimo — a arvore pode falhar inteira');
    } else ok('ocuparPosicao continua a fechar a arvore');
}

console.log(LF + '4 — os ramos de cada fase estao na fase certa');
{
    const dentroDe = (contentor, nome) => {
        const i = src.indexOf("seq('" + contentor + "'");
        if (i < 0) return false;
        // Ate ao proximo ramo de topo do mesmo nivel (12 espacos de indentacao).
        const fim = src.indexOf(LF + '            seq(', i + 10);
        const fim2 = src.indexOf(LF + '            act(', i + 10);
        const corte = Math.min(fim < 0 ? 1e9 : fim, fim2 < 0 ? 1e9 : fim2);
        return src.slice(i, corte).indexOf("seq('" + nome + "'") >= 0;
    };

    if (!dentroDe('SemBolaDefendendo', 'Marcar')) erro('Marcar nao esta na arvore de defesa');
    else ok('Marcar: a defender');

    for (const nome of ['ApoioDeCirculacao', 'CorrerNoEspaco', 'AtacarArea']) {
        if (!dentroDe('SemBolaAtacando', nome)) erro(nome + ' nao esta na arvore de ataque');
    }
    ok('ApoioDeCirculacao, CorrerNoEspaco e AtacarArea: a atacar');
}

console.log(LF + (falhas === 0
    ? 'arvore_sem_bola: tudo bem.'
    : `arvore_sem_bola: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
