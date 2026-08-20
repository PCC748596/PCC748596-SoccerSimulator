/*
Aparência dos jogadores: cabelo, pele e chuteiras. Corre as funções reais de
config.js num sandbox — são globais de browser, por isso são recortadas do
ficheiro em vez de importadas.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');

function recortarConst(src, nome) {
    const i = src.indexOf('const ' + nome + ' = {');
    assert.ok(i >= 0, 'const ' + nome + ' nao encontrado');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1) + ';';
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

function recortarFuncao(src, nome) {
    const i = src.indexOf('function ' + nome + '(');
    assert.ok(i >= 0, 'function ' + nome + ' nao encontrada');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

function montar() {
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'AppearanceModel') + '\n' +
        recortarFuncao(CONFIG, 'hashAparencia') + '\n' +
        recortarFuncao(CONFIG, 'repartirPorPeso') + '\n' +
        recortarFuncao(CONFIG, 'baralharPorHash') + '\n' +
        recortarFuncao(CONFIG, 'escolherAparencia') + '\n' +
        'this.escolher = escolherAparencia; this.repartir = repartirPorPeso;' +
        'this.A = AppearanceModel;', sandbox);
    return sandbox;
}

// Os 22 jogadores em campo, com os mesmos argumentos que o construtor usa.
function plantel(s) {
    const todos = [];
    for (const equipa of [0, 1]) {
        for (let id = 0; id < 11; id++) todos.push(s.escolher(id, 11, equipa));
    }
    return todos;
}

test('a aparência é estável: os mesmos argumentos dão sempre o mesmo resultado', () => {
    const s = montar();
    for (let id = 0; id < 11; id++) {
        for (const equipa of [0, 1]) {
            const a = s.escolher(id, 11, equipa);
            const b = s.escolher(id, 11, equipa);
            assert.deepStrictEqual(a, b, 'id=' + id + ' equipa=' + equipa);
        }
    }
});

test('devolve sempre um tipo e uma chuteira conhecidos', () => {
    const s = montar();
    const tipos = s.A.tipos.map(t => t.nome);
    const botas = s.A.chuteiras.map(c => c.nome);
    for (let seed = 0; seed < 500; seed++) {
        const a = s.escolher(seed % 11, 11, seed);
        assert.ok(tipos.includes(a.tipo), 'tipo desconhecido: ' + a.tipo);
        assert.ok(botas.includes(a.chuteira), 'chuteira desconhecida: ' + a.chuteira);
        assert.strictEqual(typeof a.cabelo, 'number');
        assert.strictEqual(typeof a.pele, 'number');
        assert.strictEqual(typeof a.corChuteira, 'number');
    }
});

test('cabelo e pele vêm sempre do MESMO tipo, nunca misturados', () => {
    const s = montar();
    for (let seed = 0; seed < 300; seed++) {
        const a = s.escolher(seed % 11, 11, seed);
        const tipo = s.A.tipos.find(t => t.nome === a.tipo);
        assert.strictEqual(a.cabelo, tipo.cabelo, 'seed=' + seed);
        assert.strictEqual(a.pele, tipo.pele, 'seed=' + seed);
    }
});

test('os quatro tipos pedidos existem, com as cores certas', () => {
    const s = montar();
    const porNome = {};
    for (const t of s.A.tipos) porNome[t.nome] = t;

    for (const nome of ['loiro', 'castanhoClaro', 'ruivo', 'negro']) {
        assert.ok(porNome[nome], 'falta o tipo ' + nome);
    }
    // O ruivo é o de pele mais clara; o negro o de pele mais escura.
    const claridade = (hex) => (hex >> 16 & 255) + (hex >> 8 & 255) + (hex & 255);
    const peles = s.A.tipos.map(t => claridade(t.pele));
    assert.strictEqual(Math.min(...peles), claridade(porNome.negro.pele));
    assert.strictEqual(Math.max(...peles), claridade(porNome.ruivo.pele));
});

test('as quatro cores de chuteira pedidas existem', () => {
    const s = montar();
    const nomes = s.A.chuteiras.map(c => c.nome);
    for (const n of ['vermelha', 'rosa', 'branca', 'preta']) {
        assert.ok(nomes.includes(n), 'falta a chuteira ' + n);
    }
});

/*
A repartição é EXACTA, não estatística: repartirPorPeso dá a cada tipo a sua
quota pelo método do maior resto. Sortear cada jogador por hash independente
dava, nesta mesma amostra de 22, um único negro e treze chuteiras brancas — o
acaso não é obrigado a respeitar os pesos num plantel.
*/
test('repartirPorPeso devolve exactamente n entradas', () => {
    const s = montar();
    for (const n of [1, 5, 11, 22, 40]) {
        assert.strictEqual(s.repartir(s.A.tipos, n).length, n, 'n=' + n);
        assert.strictEqual(s.repartir(s.A.chuteiras, n).length, n, 'n=' + n);
    }
});

test('repartirPorPeso respeita a ordem dos pesos', () => {
    const s = montar();
    const conta = {};
    for (const t of s.repartir(s.A.tipos, 100)) conta[t.nome] = (conta[t.nome] || 0) + 1;
    assert.ok(conta.castanhoClaro > conta.loiro);
    assert.ok(conta.loiro > conta.negro);
    assert.ok(conta.negro > conta.ruivo);
});

test('os 22 jogadores dividem-se pelas proporções pedidas', () => {
    const s = montar();
    const conta = {};
    for (const a of plantel(s)) conta[a.tipo] = (conta[a.tipo] || 0) + 1;

    // Duas equipas de 11, cada uma repartida pelo maior resto:
    // castanhoClaro 5, loiro 3, negro 2, ruivo 1 -> a dobrar nos 22.
    assert.deepStrictEqual(conta, {
        castanhoClaro: 10, loiro: 6, negro: 4, ruivo: 2
    });
});

test('as chuteiras dividem-se pelas proporções pedidas', () => {
    const s = montar();
    const conta = {};
    for (const a of plantel(s)) conta[a.chuteira] = (conta[a.chuteira] || 0) + 1;

    // vermelha 3, branca 3, preta 3, rosa 2 por equipa.
    assert.deepStrictEqual(conta, {
        vermelha: 6, branca: 6, preta: 6, rosa: 4
    });
});

test('o tipo e a chuteira não estão alinhados', () => {
    const s = montar();
    // Se as duas listas fossem baralhadas com o mesmo sal, cada tipo teria
    // sempre a mesma bota. Varre vários planteis para ver mais de um ruivo.
    const botasDoRuivo = new Set();
    for (let equipa = 0; equipa < 60; equipa++) {
        for (let id = 0; id < 11; id++) {
            const a = s.escolher(id, 11, equipa);
            if (a.tipo === 'ruivo') botasDoRuivo.add(a.chuteira);
        }
    }
    assert.ok(botasDoRuivo.size >= 3,
        'os ruivos só calçam ' + [...botasDoRuivo].join(', '));
});

test('num plantel de 22 aparecem pelo menos três tipos de cabelo', () => {
    const s = montar();
    const tipos = new Set(plantel(s).map(a => a.tipo));
    assert.ok(tipos.size >= 3, 'só saíram ' + [...tipos].join(', '));
});

test('num plantel de 22 aparecem pelo menos três cores de chuteira', () => {
    const s = montar();
    const botas = new Set(plantel(s).map(a => a.chuteira));
    assert.ok(botas.size >= 3, 'só saíram ' + [...botas].join(', '));
});

test('num plantel de 22 há pelo menos um jogador negro', () => {
    const s = montar();
    const negros = plantel(s).filter(a => a.tipo === 'negro');
    assert.ok(negros.length >= 1, 'nenhum saiu');
});

/*
Não se testa que dois jogadores quaisquer sejam diferentes: com 4 tipos e 4
cores de chuteira há 16 combinações para 22 jogadores, por isso repetirem-se é
matematicamente inevitável. O que interessa é o plantel não sair monótono — e
isso são os testes de variedade acima.
*/
test('o plantel usa uma boa parte das combinações possíveis', () => {
    const s = montar();
    const combinacoes = new Set(plantel(s).map(a => a.tipo + '/' + a.chuteira));
    assert.ok(combinacoes.size >= 8,
        'só ' + combinacoes.size + ' combinações em 22 jogadores');
});
