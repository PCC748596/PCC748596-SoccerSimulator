/*
A FORMAÇÃO É DO TREINADOR, E SÓ ELE LHE MEXE.

Pedido explícito: *"a formação original não pode ser alterada nunca; o nível 2
e 3 podem gerar outros targets de movimento, mas a formação original só pode
ser alterada se o treinador alterar o Formation Team A ou B"*.

Havia duas coisas a fixar:

  `p.baseTarget`  o ponto da formação no campo. Só o `assignFormations`
                  (match_setup.js) lhe toca — medido em jogo: 0,0% de
                  alterações em 13 200 leituras. Já estava certo.

  `p.slot`        o lugar da formação dentro do bloco (u, v). Este era
                  reescrito em jogo pelo `otimizarSlotsPorPosicao`, que troca
                  os dois centrais (ou os dois avançados) entre si quando um
                  está mais perto do lugar do outro. Medido: **29,5% das
                  leituras tinham o `slot` diferente do da formação** (CM 37%,
                  CF 37%, CB 26%).

A troca de OCUPANTE é legítima; escrevê-la por cima do desenho do treinador não
é. Passou a haver `p.slotAtribuido` — a atribuição do frame, que é o que o
nível 2 lê — e o `p.slot` ficou a ser só a formação.

Corre com: node --test tests/formacao_imutavel.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcTeam = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8'));
const srcSetup = semCR(fs.readFileSync(path.join(raiz, 'js', 'match', 'match_setup.js'), 'utf8'));
const srcPlayer = semCR(fs.readFileSync(path.join(raiz, 'js', 'player.js'), 'utf8'));
const srcEstilos = semCR(fs.readFileSync(path.join(raiz, 'js', 'playing_styles.js'), 'utf8'));
const srcPlayerBt = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));

// Todos os ficheiros que mexem em jogadores, para o varrimento não ter buracos.
const fontes = { 'team_bt.js': srcTeam, 'match_setup.js': srcSetup, 'player.js': srcPlayer,
    'playing_styles.js': srcEstilos, 'player_bt.js': srcPlayerBt };

test('só o assignFormations escreve o baseTarget', () => {
    const escritas = [];
    Object.keys(fontes).forEach(nome => {
        const re = /baseTarget(\.set\(|\s*=[^=]|\.x\s*=[^=]|\.z\s*=[^=]|\.copy\()/g;
        let m;
        while ((m = re.exec(fontes[nome])) !== null) {
            escritas.push(nome + ':' + fontes[nome].slice(0, m.index).split(LF).length);
        }
    });
    // Duas: a declaração no construtor do jogador e o assignFormations.
    assert.strictEqual(escritas.length, 2,
        `o baseTarget é escrito em ${escritas.length} sítios: ${escritas.join(', ')}`);
    assert.ok(escritas.some(e => e.startsWith('match_setup.js')),
        'o assignFormations deixou de escrever o baseTarget');
    assert.ok(escritas.some(e => e.startsWith('player.js')),
        'a declaração no construtor desapareceu');
});

test('só o assignFormations escreve o slot da formação', () => {
    const escritas = [];
    Object.keys(fontes).forEach(nome => {
        // Escrita numa PROPRIEDADE `.slot` de alguém (`x.slot = ...`), que é o
        // que altera a formação. Um `const slot = ...` local não conta.
        const re = /[\w\]]\.slot\s*=[^=]/g;
        let m;
        while ((m = re.exec(fontes[nome])) !== null) {
            const linha = fontes[nome].slice(0, m.index).split(LF).length;
            const texto = fontes[nome].split(LF)[linha - 1] || '';
            if (/slotAtribuido|slotInicial|slotTarget|slotAnterior/.test(texto)) continue;
            escritas.push(nome + ':' + linha + ' ' + texto.trim().slice(0, 60));
        }
    });
    assert.strictEqual(escritas.length, 1,
        `o \`slot\` (a formação) é escrito em ${escritas.length} sítios:${LF}  ` +
        escritas.join(LF + '  '));
    assert.ok(escritas[0].startsWith('match_setup.js'),
        'quem escreve a formação já não é o assignFormations');
});

test('o optimizador de slots é um stub, e a formação não se mexe', () => {
    /*
    O optimizador trocava a ATRIBUIÇÃO de slots entre jogadores da mesma
    posição (), deixando a formação () intacta. Foi
    esvaziado de propósito — o congelamento que ele fazia quebrava a inversão
    de campo ao intervalo e ignorava mudanças tácticas do utilizador — e hoje é
    um corpo vazio.

    O que continua a ter de ser verdade é o que este ficheiro guarda: ninguém
    escreve no  a não ser o assignFormations. Se o optimizador voltar,
    volta a escrever na ATRIBUIÇÃO e não na formação.
    */
    const ini = srcTeam.indexOf('function otimizarSlotsPorPosicao(');
    assert.ok(ini > 0, 'o optimizador desapareceu do ficheiro');
    const corpo = srcTeam.slice(ini, srcTeam.indexOf('function updateGkStyle(', ini));
    assert.ok(!/p[01]?\.slot\s*=[^=]/.test(corpo),
        'o optimizador voltou a escrever no `slot`, que é a formação');
});

test('quem posiciona lê o slot da formação, e mais nada', () => {
    /*
    O `slotEfectivo` era a indirecção que lia a atribuição do frame com a
    formação como recurso. Sem optimizador não há atribuição nenhuma para ler —
    o que não pode haver é a indirecção sem a atribuição, que seria uma camada
    a fingir que decide alguma coisa.
    */
    assert.ok(!srcTeam.includes('function slotEfectivo(p)') ||
        srcTeam.includes('slotAtribuido'),
        'há um slotEfectivo sem atribuição nenhuma para ler');
    const ini = srcTeam.indexOf('function slotNoBloco(');
    assert.ok(ini > 0, 'o slotNoBloco desapareceu');
    const corpo = srcTeam.slice(ini, ini + 300);
    assert.ok(/slotEfectivo\(p\)|p\.slot/.test(corpo),
        'o slotNoBloco deixou de ler o slot');
});

test('a camada posicional tem tecto de desvio ao slot, por função', () => {
    // O BlockShape sai do ficheiro de config real (não de uma cópia): assim
    // este teste não pode divergir dele.
    const srcTac = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'tactics.js'), 'utf8'));
    const ini = srcTac.indexOf('const BlockShape = {');
    const BlockShape = new Function('CAMPO_COMP', 'CAMPO_LARG',
        srcTac.slice(ini, srcTac.indexOf(LF + '};', ini) + 3) + '; return BlockShape;')(106, 68);
    const D = BlockShape.desvioMaxDoSlot;
    assert.ok(D, 'o tecto de desvio ao slot desapareceu do config');
    assert.ok(D.def < D.mid && D.mid < D.ata,
        'um defesa tem de ter menos corda do que um avançado');
    assert.ok(srcTeam.includes('B_LIM.desvioMaxDoSlot'),
        'o posicionamento já não aplica o tecto de desvio ao slot');
});
