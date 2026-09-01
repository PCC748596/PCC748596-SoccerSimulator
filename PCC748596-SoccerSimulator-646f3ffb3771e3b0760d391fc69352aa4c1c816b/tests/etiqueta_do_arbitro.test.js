/*
A ETIQUETA DO ÁRBITRO — o que ele acabou de marcar, escrito por cima dele.

Havia marcações a acontecer sem nada que as anunciasse: a bola muda de sítio,
os jogadores reorganizam-se, e quem está a ver tem de deduzir se aquilo foi
falta, canto ou pontapé de baliza. O árbitro é quem marca; é nele que se
escreve.

A maquinaria já existia toda do lado dos jogadores (`showActionBanner`, o
sprite do banner que nasce dentro do `model`), e o corpo do árbitro é um
`FootballPlayer` — só que o `criarOficial` deitava fora a instância e ficava
com o `model`. Guardá-la é o que faltava.

Corre com: node tests/etiqueta_do_arbitro.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcOff = ler('js/officials.js');
const srcMatch = ['js/match/match_state.js', 'js/match/match_setup.js', 'js/match/match_physics.js', 'js/match/match_setpieces.js', 'js/match/match_loop.js', 'js/match/match_ui.js'].map(ler).join('\n');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/*
Extrai um método do objecto Officials como função autónoma. `nome: function
(args) {` ... `\n    },`
*/
function metodo(nome, preludio) {
    const cabeca = `${nome}: function (`;
    const i = srcOff.indexOf(cabeca);
    if (i < 0) throw new Error(`${nome} não encontrado em js/officials.js`);
    const f = srcOff.indexOf(LF + '    },', i);
    const corpo = srcOff.slice(i + cabeca.length, f);
    const args = corpo.slice(0, corpo.indexOf(')'));
    const bloco = corpo.slice(corpo.indexOf('{') + 1);
    return new Function('self', args,
        `${preludio || ''} const _f = function (${args}) {${bloco}}; return _f.apply(self, [${args}]);`);
}

/* =====================================================================
   1 — A TABELA DE MARCAÇÕES
   ===================================================================== */
console.log(LF + '1 — cada lance parado tem o seu nome');
{
    /*
    A tabela vem do ficheiro, e não uma cópia: o que se testa é que os nomes
    escritos lá são estes.
    */
    const iT = srcOff.indexOf('rotulosDeMarcacao: {');
    const tabela = new Function('return {' +
        srcOff.slice(srcOff.indexOf('{', iT) + 1, srcOff.indexOf(LF + '    },', iT)) + '};')();
    const self = { rotulosDeMarcacao: tabela };

    const rotuloFn = metodo('rotuloDaMarcacao');
    const rotulo = (_ignorado, tipo) => rotuloFn(self, tipo);

    const esperado = {
        FREE_KICK: 'FOUL',
        PENALTY: 'PENALTY',
        CORNER_KICK: 'CORNER',
        GOAL_KICK: 'GOAL KICK',
        THROW_IN: 'THROW-IN'
    };

    for (const tipo of Object.keys(esperado)) {
        const r = rotulo(null, tipo);
        if (r !== esperado[tipo]) {
            erro(`${tipo} devia dar "${esperado[tipo]}", deu ${JSON.stringify(r)}`);
        } else ok(`${tipo}: ${r}`);
    }

    // Um estado que não é marcação nenhuma não pode inventar etiqueta.
    if (rotulo(null, 'PLAY') !== null) erro('PLAY devolveu etiqueta');
    else ok('estado sem marcação: sem etiqueta');

    if (rotulo(null, undefined) !== null) erro('sem tipo devolveu etiqueta');
    else ok('sem tipo: sem etiqueta');
}

/* =====================================================================
   2 — ANUNCIAR ESCREVE NO ÁRBITRO
   ===================================================================== */
console.log(LF + '2 — a etiqueta vai para o árbitro, e só para ele');
{
    const anunciar = metodo('anunciar');

    let escrito = null;
    const self = {
        _ativo: true,
        arbitro: {
            jogador: { showActionBanner: (t) => { escrito = t; } }
        }
    };

    anunciar(self, 'CORNER');
    if (escrito !== 'CORNER') erro(`escreveu ${JSON.stringify(escrito)}`);
    else ok('escreve no banner do árbitro');

    // Etiqueta vazia não acende nada.
    escrito = null;
    anunciar(self, null);
    if (escrito !== null) erro('etiqueta nula acendeu o banner');
    else ok('etiqueta nula: não acende');

    /*
    Sem árbitro criado (antes do init, ou nos testes de lote sem cena) não pode
    rebentar: uma excepção aqui leva o frame inteiro atrás, e isto é chamado de
    dentro do setupSetPiece.
    */
    let rebentou = false;
    try { anunciar({ _ativo: true, arbitro: null }, 'FOUL'); } catch (e) { rebentou = true; }
    if (rebentou) erro('sem árbitro criado, rebentou');
    else ok('sem árbitro: não faz nada, não rebenta');

    // Árbitros escondidos pelo painel: a arbitragem continua, o boneco é que
    // não está lá para escrever nada.
    escrito = null;
    anunciar({ _ativo: false, arbitro: self.arbitro }, 'FOUL');
    if (escrito !== null) erro('escreveu com os árbitros escondidos');
    else ok('árbitros escondidos: não escreve');
}

/* =====================================================================
   3 — O BANNER APAGA-SE SOZINHO
   ===================================================================== */
console.log(LF + '3 — a etiqueta não fica lá para sempre');
{
    /*
    O `actionBannerTimer` dos jogadores é descontado no `update` do próprio
    FootballPlayer — e o do árbitro não corre, porque o Officials só usa o
    `model` dele. Sem isto a primeira marcação do jogo ficava escrita por cima
    do árbitro até ao fim.
    */
    const tick = metodo('tickEtiqueta');

    const jogador = {
        actionBannerTimer: 1.2,
        actionSprite: { visible: true }
    };
    const self = { arbitro: { jogador: jogador } };

    tick(self, 0.5);
    if (!jogador.actionSprite.visible) erro('apagou-se a meio segundo');
    else ok('a 0,5 s continua visível');

    tick(self, 1.0);
    if (jogador.actionSprite.visible) erro('passou 1,5 s e continua visível');
    else ok('passado o tempo, apaga-se');

    // Já apagado, não fica a contar para valores negativos.
    tick(self, 1.0);
    if (jogador.actionBannerTimer < 0) erro('o relógio continuou a descontar');
    else ok('apagado: o relógio pára');

    let rebentou = false;
    try { tick({ arbitro: null }, 0.1); } catch (e) { rebentou = true; }
    if (rebentou) erro('sem árbitro, rebentou');
    else ok('sem árbitro: não rebenta');
}

/* =====================================================================
   4 — E ESTÁ LIGADO AO JOGO
   ===================================================================== */
console.log(LF + '4 — as marcações chamam mesmo isto');
{
    const i = srcMatch.indexOf('setupSetPiece: function');
    const corpo = srcMatch.slice(i, i + 4000);
    if (!/Officials\.anunciar/.test(corpo)) {
        erro('o setupSetPiece não anuncia — os lances parados ficam sem etiqueta');
    } else ok('o setupSetPiece anuncia a marcação');

    if (!/rotuloDaMarcacao/.test(corpo)) {
        erro('o setupSetPiece não usa a tabela de etiquetas');
    } else ok('usa a tabela');

    // O cartão é do árbitro e escreve-se nele, por cima da etiqueta do lance.
    const j = srcOff.indexOf('marcarFalta: function');
    const falta = srcOff.slice(j, srcOff.indexOf(LF + '    },', j));
    if (!/anunciar\(/.test(falta)) {
        erro('o cartão não aparece no árbitro');
    } else ok('o cartão aparece no árbitro');

    // E o relógio da etiqueta corre no update dos árbitros.
    const k = srcOff.indexOf('update: function (dt)');
    const upd = srcOff.slice(k, k + 3000);
    if (!/tickEtiqueta/.test(upd)) erro('o update não desconta o relógio da etiqueta');
    else ok('o update desconta o relógio');
}

console.log(LF + (falhas ? `FALHOU: ${falhas}` : 'OK'));
process.exit(falhas ? 1 : 0);
