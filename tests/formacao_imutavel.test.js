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

test('o optimizador troca a ATRIBUIÇÃO, não a formação', () => {
    const ini = srcTeam.indexOf('function otimizarSlotsPorPosicao(');
    const corpo = srcTeam.slice(ini, srcTeam.indexOf('function updateGkStyle(', ini));
    assert.ok(corpo.includes('slotAtribuido'),
        'o optimizador voltou a escrever no `slot`, que é a formação');
    assert.ok(!/p[01]\.slot\s*=[^=]/.test(corpo),
        'ainda há uma escrita directa no `slot` dentro do optimizador');
});

test('quem posiciona lê a atribuição, com a formação como recurso', () => {
    assert.ok(srcTeam.includes('function slotEfectivo(p)'),
        'o `slotEfectivo` desapareceu: alguém volta a ler o slot cru');
    const ini = srcTeam.indexOf('function slotNoBloco(');
    const corpo = srcTeam.slice(ini, ini + 300);
    assert.ok(corpo.includes('slotEfectivo(p)'),
        'o slotNoBloco deixou de usar a atribuição do frame');
});

test('a camada posicional tem tecto de desvio ao slot, por função', () => {
    const iniC = srcTeam.indexOf('BlockShape.desvioMaxDoSlot');
    assert.ok(iniC > 0, 'o tecto de desvio ao slot desapareceu');
    // Duas aplicações: uma antes das regras de faixa, outra (folgada) depois.
    const n = srcTeam.split('BlockShape.desvioMaxDoSlot').length - 1;
    assert.ok(n >= 2,
        `só ${n} aplicação(ões) do tecto: sem a segunda, as regras de faixa voltam a esticar o desvio`);
    assert.ok(srcTeam.includes('tectoFolgado'),
        'a segunda aplicação tem de ser folgada, senão desfaz as faixas');
});
