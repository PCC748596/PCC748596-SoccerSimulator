/*
PERMANÊNCIA NUM ESTADO DA FSM — `registarPermanencia` (js/simulate.js).

PORQUE EXISTE. O relatório do lote de 20 jogos deu 1 006 032 frames em
CHEST_CONTROL, e esse número sozinho não decide nada: 16 767 segundos de gesto
tanto podem ser trinta mil matadas no peito legítimas como dois jogadores
congelados no estado durante um jogo inteiro. As duas leituras pedem
correcções opostas, e um contador de frames não as separa.

O que este teste fixa é essa separação. Os dois cenários abaixo têm o MESMO
tempo total — o número que o contador de frames dá — e têm de sair diferentes
daqui. Se algum dia voltarem a sair iguais, a instrumentação deixou de
responder à pergunta para que foi escrita.

Corre com: node tests/permanencia_estado.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const src = ler('js/simulate.js');

// Extrai as funções do FICHEIRO DE PRODUÇÃO por texto — o mesmo método dos
// outros testes: corre o código real, sem browser e sem jsdom.
function extrair(nome) {
    const ini = src.indexOf('function ' + nome);
    if (ini < 0) throw new Error(nome + ' não encontrada no js/simulate.js');
    const fim = src.indexOf(LF + '}', ini) + 2;
    return src.slice(ini, fim);
}

const nomes = ['criarPermanenciaStats', 'fecharEpisodio', 'registarPermanencia',
               'fecharPermanencias', 'resumirPermanencia'];
const api = new Function(
    nomes.map(extrair).join(LF) + LF +
    'return {' + nomes.join(', ') + '};')();

const { criarPermanenciaStats, registarPermanencia, fecharPermanencias,
        resumirPermanencia } = api;

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

const dt = 1 / 60;
const PEITO_DUR = 0.55;               // BallControl.peitoDur, js/config.js
const FRAMES_DO_GESTO = Math.round(PEITO_DUR / dt);   // 33

// Jogador mínimo: a instrumentação só lê `fsm.currentState`, `team` e `pos`.
const criarJogador = (team, pos) => ({ team, pos, fsm: { currentState: 'IDLE' } });

const linhaDe = (relatorio, estado) => relatorio.find(l => l.estado === estado);

/*
1 — TRINTA MIL GESTOS CURTOS CONTRA UM ESTADO PRESO.

O mesmo tempo total nos dois casos. É este o par que o contador de frames
confunde.
*/
console.log(LF + '1 — mesmo tempo total, dois significados opostos');

// (a) gesto a repetir-se: entra, cumpre a duração, sai.
let repeticoes;
{
    const stats = criarPermanenciaStats();
    const p = criarJogador('TeamA', 'CF');
    repeticoes = 300;

    for (let i = 0; i < repeticoes; i++) {
        p.fsm.currentState = 'CHEST_CONTROL';
        for (let f = 0; f < FRAMES_DO_GESTO; f++) registarPermanencia(stats, [p], dt);
        p.fsm.currentState = 'IDLE';
        registarPermanencia(stats, [p], dt);
    }
    fecharPermanencias(stats);

    const l = linhaDe(resumirPermanencia(stats), 'CHEST_CONTROL');
    if (!l) { erro('nenhum episódio de CHEST_CONTROL registado'); }
    else {
        if (l.episodios !== repeticoes) {
            erro(`gestos curtos: esperados ${repeticoes} episódios, vieram ${l.episodios}`);
        } else ok(`${l.episodios} episódios curtos contados um a um`);

        // Tolerância de um passo de arredondamento: o relatório dá a duração
        // com uma casa decimal, e 0.55 sai de lá como 0.6.
        if (Math.abs(l.duracaoMaxS - PEITO_DUR) > 0.06) {
            erro(`gestos curtos: duração máxima ${l.duracaoMaxS}s, devia ser ~${PEITO_DUR}s`);
        } else ok(`duração máxima ${l.duracaoMaxS}s — a do gesto, como esperado`);
    }
}

// (b) estado preso: uma entrada só, que nunca termina.
const TEMPO_PRESO = repeticoes * PEITO_DUR;   // exactamente o mesmo total
{
    const stats = criarPermanenciaStats();
    const p = criarJogador('TeamA', 'CF');
    p.fsm.currentState = 'CHEST_CONTROL';

    const frames = Math.round(TEMPO_PRESO / dt);
    for (let f = 0; f < frames; f++) registarPermanencia(stats, [p], dt);

    /*
    O episódio está ABERTO quando o jogo acaba — e é justamente o caso que
    interessa ver. Sem este fecho, o jogador preso não aparecia no relatório.
    */
    fecharPermanencias(stats);

    const l = linhaDe(resumirPermanencia(stats), 'CHEST_CONTROL');
    if (!l) { erro('o episódio preso não foi registado — fecharPermanencias não o apanhou'); }
    else {
        if (l.episodios !== 1) {
            erro(`estado preso: esperado 1 episódio, vieram ${l.episodios}`);
        } else ok('estado preso contado como UM episódio');

        if (l.duracaoMaxS < TEMPO_PRESO - 1) {
            erro(`estado preso: duração máxima ${l.duracaoMaxS}s, devia ser ~${TEMPO_PRESO}s`);
        } else ok(`duração máxima ${l.duracaoMaxS}s — muito acima dos ${PEITO_DUR}s do gesto`);

        if (l.posicaoDoMax !== 'TeamA CF') {
            erro(`estado preso: quem lá ficou devia ser identificado, veio "${l.posicaoDoMax}"`);
        } else ok(`identifica quem ficou preso: ${l.posicaoDoMax}`);
    }
}

/*
2 — OS DOIS CASOS TÊM DE SER DISTINGUÍVEIS PELO TEMPO TOTAL? NÃO.

A prova de que o tempo total (o que o contador de frames dá) não chega: é
igual nos dois. Só a duração máxima os separa.
*/
console.log(LF + '2 — o tempo total não separa; a duração máxima separa');
{
    const medir = (preso) => {
        const stats = criarPermanenciaStats();
        const p = criarJogador('TeamB', 'CM');
        if (preso) {
            p.fsm.currentState = 'CHEST_CONTROL';
            const frames = Math.round(TEMPO_PRESO / dt);
            for (let f = 0; f < frames; f++) registarPermanencia(stats, [p], dt);
        } else {
            for (let i = 0; i < repeticoes; i++) {
                p.fsm.currentState = 'CHEST_CONTROL';
                for (let f = 0; f < FRAMES_DO_GESTO; f++) registarPermanencia(stats, [p], dt);
                p.fsm.currentState = 'IDLE';
                registarPermanencia(stats, [p], dt);
            }
        }
        fecharPermanencias(stats);
        return linhaDe(resumirPermanencia(stats), 'CHEST_CONTROL');
    };

    const curto = medir(false);
    const longo = medir(true);

    if (Math.abs(curto.tempoTotalS - longo.tempoTotalS) > 1) {
        erro(`os dois cenários deviam ter o mesmo tempo total (${curto.tempoTotalS} vs ${longo.tempoTotalS}) — o teste perdeu o ponto`);
    } else ok(`tempo total igual nos dois: ${curto.tempoTotalS}s — por isso é que o contador de frames não decidia`);

    if (longo.duracaoMaxS <= curto.duracaoMaxS * 10) {
        erro('a duração máxima não separa os dois casos');
    } else ok(`duração máxima: ${curto.duracaoMaxS}s (gesto) contra ${longo.duracaoMaxS}s (preso)`);
}

/*
3 — VÁRIOS JOGADORES AO MESMO TEMPO, CADA UM COM O SEU EPISÓDIO.

Nos retratos de encrave apareciam sempre 1 a 3 jogadores em CHEST_CONTROL ao
mesmo tempo. Os episódios são por jogador e não podem misturar-se.
*/
console.log(LF + '3 — episódios são por jogador');
{
    const stats = criarPermanenciaStats();
    const presos = [criarJogador('TeamA', 'LB'), criarJogador('TeamB', 'RM')];
    const livre = criarJogador('TeamA', 'CB');

    presos.forEach(p => { p.fsm.currentState = 'CHEST_CONTROL'; });
    livre.fsm.currentState = 'MARKING';

    for (let f = 0; f < 600; f++) registarPermanencia(stats, [...presos, livre], dt);
    fecharPermanencias(stats);

    const rel = resumirPermanencia(stats);
    const peito = linhaDe(rel, 'CHEST_CONTROL');
    const marcar = linhaDe(rel, 'MARKING');

    if (!peito || peito.episodios !== 2) {
        erro(`dois jogadores presos deviam dar 2 episódios, veio ${peito ? peito.episodios : 0}`);
    } else ok('dois jogadores presos = dois episódios separados');

    if (!marcar || marcar.episodios !== 1) {
        erro('o jogador noutro estado devia ter o seu próprio episódio');
    } else ok('o estado de outro jogador não é misturado');

    if (peito && Math.abs(peito.tempoTotalS - 2 * 10) > 0.5) {
        erro(`tempo total do CHEST_CONTROL devia somar os dois jogadores (~20s), veio ${peito.tempoTotalS}s`);
    } else ok('o tempo total soma os jogadores, a duração máxima não');
}

/*
4 — TROCAR DE ESTADO E VOLTAR CONTA COMO DOIS EPISÓDIOS.

Um estado que se retoma logo a seguir não é um estado que nunca se largou, e
essa diferença é a que distingue um ciclo de um bloqueio.
*/
console.log(LF + '4 — sair e voltar são dois episódios, não um');
{
    const stats = criarPermanenciaStats();
    const p = criarJogador('TeamA', 'CF');

    p.fsm.currentState = 'CHEST_CONTROL';
    for (let f = 0; f < 30; f++) registarPermanencia(stats, [p], dt);
    p.fsm.currentState = 'CARRY';
    registarPermanencia(stats, [p], dt);
    p.fsm.currentState = 'CHEST_CONTROL';
    for (let f = 0; f < 30; f++) registarPermanencia(stats, [p], dt);
    fecharPermanencias(stats);

    const l = linhaDe(resumirPermanencia(stats), 'CHEST_CONTROL');
    if (!l || l.episodios !== 2) {
        erro(`esperados 2 episódios, veio ${l ? l.episodios : 0}`);
    } else ok('dois episódios, e a duração máxima fica pela do gesto');

    if (l && l.duracaoMaxS > 0.6) {
        erro(`duração máxima ${l.duracaoMaxS}s — os dois episódios foram colados num só`);
    } else ok(`duração máxima ${l.duracaoMaxS}s`);
}

/*
5 — O GUARDA-REDES NÃO ENTRA NA CONTA.

A FSM dele só corre com a bola nas mãos (updateGK, js/player.js); o resto do
tempo o `currentState` fica congelado no último valor. Medido junto com os
outros, dava um episódio do tamanho do jogo inteiro — 900 s em MOVE_TO_POS no
primeiro lote com esta instrumentação — que tapava o maior episódio real.
*/
console.log(LF + '5 — o guarda-redes fica de fora (a FSM dele não corre)');
{
    const stats = criarPermanenciaStats();
    const gk = criarJogador('TeamA', 'GK');
    gk.role = 'gk';
    const campo = criarJogador('TeamA', 'CB');

    // O GK com o estado congelado o jogo inteiro; o defesa com um episódio curto.
    gk.fsm.currentState = 'MOVE_TO_POS';
    campo.fsm.currentState = 'MOVE_TO_POS';
    for (let f = 0; f < 6000; f++) {
        registarPermanencia(stats, [gk], dt);
        if (f < 120) registarPermanencia(stats, [campo], dt);
    }
    fecharPermanencias(stats);

    const l = linhaDe(resumirPermanencia(stats), 'MOVE_TO_POS');
    if (!l) { erro('o jogador de campo devia ter sido registado'); }
    else if (l.posicaoDoMax === 'TeamA GK' || l.duracaoMaxS > 5) {
        erro(`o guarda-redes entrou na conta: máximo ${l.duracaoMaxS}s em ${l.posicaoDoMax}`);
    } else ok(`só o jogador de campo conta: máximo ${l.duracaoMaxS}s em ${l.posicaoDoMax}`);
}

console.log(LF + (falhas === 0
    ? 'permanencia_estado: tudo bem.'
    : `permanencia_estado: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
