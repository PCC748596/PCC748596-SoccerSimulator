/*
AS TRÊS LINHAS DO BLOCO — e o terço da frente que ficava vazio.

O bloco foi dividido em três âncoras (defesa, meio, ataque) e o `v` de cada
jogador, que vem da formação, interpola entre elas. A divisão estava certa; a
aritmética não:

    zDef: z0
    zMid: z0 + (z1 - z0) / 3
    zAtk: z0 + 2 * (z1 - z0) / 3     <- o ataque a DOIS TERÇOS da profundidade

`v = 1.0` é o jogador mais adiantado da formação e devia cair na FRENTE do
bloco. Caía a 66.7%, e arrastava a formação inteira com ele:

    pos     v       devia ficar   ficava em
    CB     0.000        0%           0%
    LB/RB  0.091        9.1%         6.1%
    CM     0.455       45.5%        30.3%
    LM/RM  0.545       54.5%        36.3%
    CF     1.000      100%          66.7%

Com 40 m de profundidade, eram 13 m do bloco vazios por construção, e o número
da `BlockShape.profundidade` do painel mentia por um terço.

As fracções passaram para `BlockShape.linhas`, para as três linhas serem
ajustáveis em vez de decorativas.

Medido em jogo, posição no bloco a defender:  CF 0.608 -> 0.862.

Corre com: node --test tests/bloco_tres_linhas.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const src = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcCfg = src('js/config/tactics.js');
const srcTeam = src('js/bt/team_bt.js');

function extrairObjecto(s, nome) {
    const ini = s.indexOf('const ' + nome + ' = {');
    assert.ok(ini > 0, nome + ' não encontrado');
    const fim = s.indexOf(LF + '};', ini);
    return new Function(s.slice(ini, fim + 3) + '; return ' + nome + ';')();
}

const BlockShape = extrairObjecto(srcCfg, 'BlockShape');
const L = BlockShape.linhas;

// A mesma interpolação do calcularPontoDoSlot, em fracções do bloco.
function fraccaoDe(v) {
    if (v < 0.5) return L.defesa + (v / 0.5) * (L.meio - L.defesa);
    return L.meio + ((v - 0.5) / 0.5) * (L.ataque - L.meio);
}

test('as três linhas existem e cobrem o bloco INTEIRO', () => {
    assert.ok(L, 'BlockShape.linhas desapareceu');
    assert.strictEqual(L.defesa, 0.0, 'a linha de defesa é a traseira do bloco');
    assert.strictEqual(L.ataque, 1.0,
        'a linha de ataque tem de ser a FRENTE do bloco — a 2/3 deixa o terço da frente vazio');
    assert.ok(L.meio > L.defesa && L.meio < L.ataque, 'o meio fica entre as outras duas');
});

test('o jogador mais adiantado da formação chega à frente do bloco', () => {
    assert.ok(Math.abs(fraccaoDe(1.0) - 1.0) < 1e-9,
        'v=1.0 dá ' + fraccaoDe(1.0).toFixed(3) + ' do bloco e devia dar 1.0');
    assert.ok(Math.abs(fraccaoDe(0.0) - 0.0) < 1e-9, 'v=0 é a traseira');
});

test('a interpolação é monótona: quem está à frente na formação fica à frente no bloco', () => {
    /*
    Foi isto que se partiu quando o ataque estava a 2/3: a formação continuava
    ordenada, mas comprimida — e comprimir uma formação muda o jogo, porque as
    distâncias entre linhas são o que faz um bloco ser um bloco.
    */
    let ant = -1;
    for (let v = 0; v <= 1.0001; v += 0.05) {
        const f = fraccaoDe(Math.min(1, v));
        assert.ok(f >= ant - 1e-9, 'a interpolação inverteu em v=' + v.toFixed(2));
        ant = f;
    }
});

test('as posições da formação 442 caem onde o v delas manda', () => {
    // v reais da 442 (ver assignFormations): CB 0, LB/RB 0.091, CM 0.455,
    // LM/RM 0.545, CF 1.0.
    const casos = [['CB', 0.0], ['LB', 0.091], ['CM', 0.455], ['LM', 0.545], ['CF', 1.0]];
    for (const [pos, v] of casos) {
        const f = fraccaoDe(v);
        assert.ok(Math.abs(f - v) < 0.02,
            pos + ' (v=' + v + ') cai em ' + f.toFixed(3) + ' do bloco');
    }
});

test('o computeBlock lê as fracções da config e não números em código', () => {
    const ini = srcTeam.indexOf('zDef:');
    assert.ok(ini > 0, 'as três âncoras desapareceram do computeBlock');
    const bloco = srcTeam.slice(ini - 200, ini + 400);
    assert.ok(/L\.defesa/.test(bloco) && /L\.meio/.test(bloco) && /L\.ataque/.test(bloco),
        'as âncoras voltaram a ser calculadas com números em código');
    assert.ok(!/z0 \+ 2 \* \(z1 - z0\) \/ 3/.test(srcTeam),
        'o ataque voltou a ficar a dois terços do bloco');
});
