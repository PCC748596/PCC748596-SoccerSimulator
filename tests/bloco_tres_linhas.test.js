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

test('as três linhas existem e estão ordenadas', () => {
    assert.ok(L, 'BlockShape.linhas desapareceu');
    assert.strictEqual(L.defesa, 0.0, 'a linha de defesa é a traseira do bloco');
    assert.ok(L.meio > L.defesa && L.meio < L.ataque, 'o meio fica entre as outras duas');

    /*
    A LINHA DE ATAQUE JÁ NÃO É A FRENTE DO BLOCO, e é deliberado.

    Este teste exigia `L.ataque === 1.0`, que foi a correcção do bug dos 2/3 —
    ali o problema era o oposto, a formação inteira comprimida para trás. Com
    1.0 apareceu o defeito simétrico: o `v` da 442 salta de 0.545 (médios de
    ala) para 1.000 (avançados) sem nada pelo meio, portanto o avançado ficava
    sozinho na borda da frente. Medido num bloco de 40 m: CF a +18.3 m do
    meio-campo com o CM a -3.6, ou seja 21.8 m de buraco entre o meio-campo e
    o ataque.

    O que se exige agora é a faixa útil: à frente do meio e sem ir à borda.
    */
    assert.ok(L.ataque > 0.6 && L.ataque <= 0.95,
        'a linha de ataque está em ' + L.ataque + ' — abaixo de 0.6 comprime a ' +
        'formação (o bug dos 2/3), acima de 0.95 deixa o avançado isolado na borda');
});

test('o v da formação mapeia-se na faixa das três linhas, por ordem', () => {
    assert.ok(Math.abs(fraccaoDe(0.0)) < 1e-9, 'v=0 é a traseira');
    assert.ok(Math.abs(fraccaoDe(0.5) - L.meio) < 1e-9, 'v=0.5 é a linha média');
    assert.ok(Math.abs(fraccaoDe(1.0) - L.ataque) < 1e-9, 'v=1.0 é a linha de ataque');
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

test('as posições da formação 442 mantêm a ordem e as distâncias relativas', () => {
    /*
    v reais da 442 (ver assignFormations): CB 0, LB/RB 0.091, CM 0.455,
    LM/RM 0.545, CF 1.0.

    Já não se exige `fracção == v` — isso equivalia a exigir `L.ataque = 1.0`,
    que é o que se acabou de deixar de querer. O que tem de valer é a ORDEM e
    a proporção dentro de cada metade: a linha de ataque pode estar mais atrás,
    mas quem está à frente na formação tem de continuar à frente no bloco.
    */
    const casos = [['CB', 0.0], ['LB', 0.091], ['CM', 0.455], ['LM', 0.545], ['CF', 1.0]];
    let ant = -1;
    for (const [pos, v] of casos) {
        const f = fraccaoDe(v);
        assert.ok(f > ant, pos + ' (v=' + v + ') cai em ' + f.toFixed(3) +
            ', atrás de quem devia estar à sua frente');
        ant = f;
    }

    // A metade de trás da formação continua a mapear-se um-para-um.
    assert.ok(Math.abs(fraccaoDe(0.091) - 0.091 * (L.meio / 0.5)) < 1e-9,
        'a metade de trás deixou de ser proporcional');

    // E o buraco entre o meio e o ataque tem de ser menor do que meia
    // profundidade de bloco — foi esse o defeito que trouxe o 0.82.
    assert.ok(fraccaoDe(1.0) - fraccaoDe(0.545) < 0.45,
        'entre os médios de ala e os avançados vão ' +
        (fraccaoDe(1.0) - fraccaoDe(0.545)).toFixed(3) + ' do bloco');
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
