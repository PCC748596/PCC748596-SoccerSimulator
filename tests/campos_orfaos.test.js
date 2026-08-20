/*
Ferramenta de higiene: encontra campos de jogador escritos e nunca lidos (o
produtor sobreviveu, o consumidor foi-se) e lidos e nunca escritos (o
contrario). Tres defeitos desta sessao vieram dai — buildOutBias,
markingTarget e isCovering — e apareceram todos por acaso.

O teste corre sobre fontes INVENTADAS, nao sobre o repositorio: assim
verifica a ferramenta e nao o estado do codigo, que muda todos os dias.
*/
const test = require('node:test');
const assert = require('node:assert');
const { analisar } = require('../tools/campos_orfaos.js');

const campos = (lista) => lista.map(x => x.campo).sort();

test('campo escrito e nunca lido aparece na primeira lista', () => {
    const r = analisar([
        { nome: 'a.js', fonte: 'p.aviso = 3;' }
    ]);
    assert.deepStrictEqual(campos(r.escritosNuncaLidos), ['aviso']);
    assert.strictEqual(r.lidosNuncaEscritos.length, 0);
});

test('campo lido e nunca escrito aparece na segunda lista', () => {
    const r = analisar([
        { nome: 'a.js', fonte: 'if (p.marca) { fazer(); }' }
    ]);
    assert.deepStrictEqual(campos(r.lidosNuncaEscritos), ['marca']);
    assert.strictEqual(r.escritosNuncaLidos.length, 0);
});

test('campo escrito e lido não aparece em lado nenhum', () => {
    const r = analisar([
        { nome: 'a.js', fonte: 'p.alvo = 1;' },
        { nome: 'b.js', fonte: 'usar(q.alvo);' }
    ]);
    assert.strictEqual(r.escritosNuncaLidos.length, 0);
    assert.strictEqual(r.lidosNuncaEscritos.length, 0);
});

test('escrita composta conta como escrita E como leitura', () => {
    // `p.timer -= dt` le o valor antes de escrever: nao e um campo orfao.
    const r = analisar([
        { nome: 'a.js', fonte: 'p.timer -= dt;' }
    ]);
    assert.strictEqual(r.escritosNuncaLidos.length, 0);
    assert.strictEqual(r.lidosNuncaEscritos.length, 0);
});

test('comparação não conta como escrita', () => {
    const r = analisar([
        { nome: 'a.js', fonte: 'if (p.estado === 2) fazer();' }
    ]);
    assert.deepStrictEqual(campos(r.lidosNuncaEscritos), ['estado']);
});

test('o relatório diz onde está cada ocorrência', () => {
    const r = analisar([
        { nome: 'match.js', fonte: 'linha zero\np.aviso = 3;' }
    ]);
    const oc = r.escritosNuncaLidos[0].ocorrencias[0];
    assert.strictEqual(oc.ficheiro, 'match.js');
    assert.strictEqual(oc.linha, 2);
    assert.strictEqual(oc.tipo, 'escrita');
});

test('comentários e strings são ignorados', () => {
    const r = analisar([
        { nome: 'a.js', fonte: '// p.fantasma = 1;\nconst s = "p.outro = 2;";' }
    ]);
    assert.strictEqual(r.escritosNuncaLidos.length, 0);
    assert.strictEqual(r.lidosNuncaEscritos.length, 0);
});

test('campos conhecidos do THREE não são reportados', () => {
    const r = analisar([
        { nome: 'a.js', fonte: 'p.position = 1; p.quaternion = 2; p.visible = 3;' }
    ]);
    assert.strictEqual(r.escritosNuncaLidos.length, 0);
});
