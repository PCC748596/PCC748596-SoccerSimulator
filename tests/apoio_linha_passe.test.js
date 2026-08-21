/*
Abrir linha de passe: onde se põe quem se oferece.

O `atribuirApoios` já filtrava os pontos por "linha livre" (binário: passa ou
não passa) e depois, entre os que passavam, escolhia o MAIS BARATO — o mais
perto do slot do bloco. Resultado em campo: o jogador oferecia-se no ponto
que lhe dava menos trabalho, tipicamente a fechar para dentro, e não no vão
entre dois adversários onde a linha está mesmo aberta.

Agora os pontos são pontuados: folga da linha do portador até ao ponto, folga
do próprio ponto ao adversário mais perto, menos o custo de lá ir.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const UTILS = fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8');

function recortarFuncao(src, nome) {
    const i = src.indexOf('function ' + nome + '(');
    assert.ok(i >= 0, 'funcao ' + nome + ' nao encontrada em utils.js');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

const sandbox = { Math: Math };
vm.createContext(sandbox);
vm.runInContext(
    recortarFuncao(UTILS, 'folgaDaLinha') + '\n' +
    recortarFuncao(UTILS, 'notaPontoDeApoio') +
    '\nthis.folga = folgaDaLinha; this.nota = notaPontoDeApoio;', sandbox);
const folgaDaLinha = sandbox.folga;
const notaPontoDeApoio = sandbox.nota;

const PESOS = { pesoFolgaLinha: 1.2, pesoFolgaPonto: 1.0, pesoCusto: 0.5, folgaCap: 8.0 };

/* --- folga da linha ---------------------------------------------------- */

test('sem adversários a linha está toda livre', () => {
    assert.strictEqual(folgaDaLinha(0, 0, 10, 0, []), Infinity);
});

test('mede a distância perpendicular de quem está ao lado da linha', () => {
    // Adversário a 3 m de lado, a meio do caminho.
    assert.strictEqual(folgaDaLinha(0, 0, 10, 0, [{ x: 5, z: 3 }]), 3);
});

test('quem está atrás do início da linha mede-se ao extremo, não à recta', () => {
    // O adversário está 5 m ATRÁS do portador: a linha não passa por ele.
    assert.strictEqual(folgaDaLinha(0, 0, 10, 0, [{ x: -5, z: 0 }]), 5);
});

test('vale o adversário mais perto, não o primeiro da lista', () => {
    const advs = [{ x: 5, z: 6 }, { x: 5, z: 2 }, { x: 5, z: 9 }];
    assert.strictEqual(folgaDaLinha(0, 0, 10, 0, advs), 2);
});

/* --- nota do ponto ----------------------------------------------------- */

test('entre dois pontos igualmente baratos ganha o de linha mais aberta', () => {
    const perto = notaPontoDeApoio({ folgaLinha: 1.5, folgaPonto: 4, custoSlot: 5 }, PESOS);
    const noVao = notaPontoDeApoio({ folgaLinha: 6.0, folgaPonto: 4, custoSlot: 5 }, PESOS);
    assert.ok(noVao > perto, 'o vão entre adversários tem de ganhar');
});

test('o custo ainda conta: linha igual, ganha quem está mais perto do slot', () => {
    const longe = notaPontoDeApoio({ folgaLinha: 5, folgaPonto: 4, custoSlot: 8 }, PESOS);
    const perto = notaPontoDeApoio({ folgaLinha: 5, folgaPonto: 4, custoSlot: 2 }, PESOS);
    assert.ok(perto > longe);
});

test('vale a pena andar mais para abrir mesmo a linha', () => {
    // 6 m a mais de caminho (custo 0.5/m = -3) por 5 m a mais de linha
    // aberta (1.2/m = +6): compensa.
    const comodo = notaPontoDeApoio({ folgaLinha: 1, folgaPonto: 4, custoSlot: 2 }, PESOS);
    const aberto = notaPontoDeApoio({ folgaLinha: 6, folgaPonto: 4, custoSlot: 8 }, PESOS);
    assert.ok(aberto > comodo);
});

test('o tecto da folga impede que uma linha vazia domine tudo', () => {
    // Acima do folgaCap (8) a folga deixa de contar mais.
    const oito = notaPontoDeApoio({ folgaLinha: 8, folgaPonto: 8, custoSlot: 0 }, PESOS);
    const infinita = notaPontoDeApoio({ folgaLinha: Infinity, folgaPonto: Infinity, custoSlot: 0 }, PESOS);
    assert.strictEqual(oito, infinita);
});
