/*
Escolha de quem recebe o passe. O PassTypeModel vive em js/config.js (script de
browser, sem exports), por isso é recortado do ficheiro e avaliado; o PassTypes
já exporta em Node.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');

global.CAMPO_COMP = 105;

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

const sandbox = { CAMPO_COMP: 105, Math };
vm.createContext(sandbox);
vm.runInContext(recortarConst(CONFIG, 'PassTypeModel') + '\nthis.M = PassTypeModel;', sandbox);
global.PassTypeModel = sandbox.M;

// O leque real, para maxPontosLeque não ser um 49 à mão.
global.PassCandidates = { arcos: 7, pontosPorArco: 7 };

const { PassTypes } = require('../js/pass_types.js');
const E = () => PassTypeModel.escolha;

test('as constantes da escolha existem', () => {
    for (const k of ['bonusSugerido', 'progressoRef', 'distanciaMax',
                     'raioPressao', 'notaMinima', 'tecnicaDrible', 'raioRecuo']) {
        assert.strictEqual(typeof E()[k], 'number', k + ' em falta');
    }
    for (const conj of ['pesosSemPressao', 'pesosSobPressao']) {
        for (const k of ['progresso', 'espaco', 'distancia']) {
            assert.strictEqual(typeof E()[conj][k], 'number', conj + '.' + k);
        }
    }
});

test('os pesos antigos desapareceram', () => {
    // Ficavam numa escala incomparável com a nova e voltariam a desequilibrar.
    for (const k of ['pesoProgresso', 'pesoEspaco', 'pesoDistancia']) {
        assert.strictEqual(E()[k], undefined, k + ' devia ter sido removido');
    }
});

test('maxPontosLeque sai do PassCandidates, não de um 49 à mão', () => {
    assert.strictEqual(PassTypes.maxPontosLeque(), 49);
    const antes = PassCandidates.arcos;
    PassCandidates.arcos = 3;
    assert.strictEqual(PassTypes.maxPontosLeque(), 21, 'devia acompanhar os arcos');
    PassCandidates.arcos = antes;
});

test('pressão é 1 com o adversário em cima e 0 no limite do raio', () => {
    assert.strictEqual(PassTypes.pressaoSobrePortador(0, 8), 1);
    assert.strictEqual(PassTypes.pressaoSobrePortador(8, 8), 0);
    assert.strictEqual(PassTypes.pressaoSobrePortador(40, 8), 0);
});

test('a pressão desce à medida que o adversário se afasta', () => {
    let anterior = Infinity;
    for (let d = 0; d <= 10; d += 0.5) {
        const p = PassTypes.pressaoSobrePortador(d, 8);
        assert.ok(p <= anterior + 1e-9, 'subiu em d=' + d);
        assert.ok(p >= 0 && p <= 1, 'fora de [0,1] em d=' + d);
        anterior = p;
    }
});

test('sem adversário à vista não há pressão', () => {
    assert.strictEqual(PassTypes.pressaoSobrePortador(Infinity, 8), 0);
});

test('os pesos nos extremos são os dois conjuntos declarados', () => {
    /*
    Com tolerância, não deepStrictEqual: a interpolação a + (b-a)*t com t=1 dá
    0.44999999999999996 em vez de 0.45, e a igualdade exacta falhava por isso.
    */
    const igual = (obtido, esperado, onde) => {
        for (const k of ['progresso', 'espaco', 'distancia']) {
            assert.ok(Math.abs(obtido[k] - esperado[k]) < 1e-9,
                onde + '.' + k + ': ' + obtido[k] + ' != ' + esperado[k]);
        }
    };
    igual(PassTypes.pesosPorPressao(0), E().pesosSemPressao, 'semPressao');
    igual(PassTypes.pesosPorPressao(1), E().pesosSobPressao, 'sobPressao');
});

test('a meia pressão os pesos são a média dos dois conjuntos', () => {
    const meio = PassTypes.pesosPorPressao(0.5);
    for (const k of ['progresso', 'espaco', 'distancia']) {
        const esperado = (E().pesosSemPressao[k] + E().pesosSobPressao[k]) / 2;
        assert.ok(Math.abs(meio[k] - esperado) < 1e-9, k + ': ' + meio[k]);
    }
});

test('sob pressão o espaço passa a pesar mais que o progresso', () => {
    const semP = PassTypes.pesosPorPressao(0);
    const sobP = PassTypes.pesosPorPressao(1);
    assert.ok(semP.progresso > semP.espaco, 'livre devia procurar progresso');
    assert.ok(sobP.espaco > sobP.progresso, 'pressionado devia procurar espaço');
});

test('a nota é monótona em cada termo', () => {
    const w = PassTypes.pesosPorPressao(0.5);
    let ant = -Infinity;
    for (let g = 0; g <= 1.0001; g += 0.1) {
        const n = PassTypes.notaCandidato(Math.min(g, 1), 0.5, 0.5, w);
        assert.ok(n >= ant - 1e-9, 'progresso desceu em ' + g);
        ant = n;
    }
    ant = -Infinity;
    for (let e = 0; e <= 1.0001; e += 0.1) {
        const n = PassTypes.notaCandidato(0.5, Math.min(e, 1), 0.5, w);
        assert.ok(n >= ant - 1e-9, 'espaço desceu em ' + e);
        ant = n;
    }
    ant = Infinity;
    for (let d = 0; d <= 1.0001; d += 0.1) {
        const n = PassTypes.notaCandidato(0.5, 0.5, Math.min(d, 1), w);
        assert.ok(n <= ant + 1e-9, 'distância subiu em ' + d);
        ant = d === 0 ? n : Math.min(ant, n);
    }
});

/*
O bug relatado: o portador na lateral toca ainda mais para a lateral, para um
companheiro isolado, tendo alguém à frente. O isolado ganhava porque o termo do
espaço era a CONTAGEM de pontos vivos do leque (até 49), e o progresso raramente
passava de 40 — escalas incomparáveis.

Frente marcado: 20 m de progresso, 10 pontos vivos, a 20 m.
Lateral isolado: 0 m de progresso, 49 pontos vivos, a 20 m.
*/
const frente = { g: 20 / 30, e: 10 / 49, d: 20 / 45 };
const lateral = { g: 0, e: 49 / 49, d: 20 / 45 };

test('regressão: sem pressão o passe à frente ganha ao isolado na lateral', () => {
    const w = PassTypes.pesosPorPressao(0);
    const nf = PassTypes.notaCandidato(frente.g, frente.e, frente.d, w);
    const nl = PassTypes.notaCandidato(lateral.g, lateral.e, lateral.d, w);
    assert.ok(nf > nl, 'frente=' + nf.toFixed(3) + ' lateral=' + nl.toFixed(3));
});

test('sob pressão o isolado volta a ganhar', () => {
    const w = PassTypes.pesosPorPressao(1);
    const nf = PassTypes.notaCandidato(frente.g, frente.e, frente.d, w);
    const nl = PassTypes.notaCandidato(lateral.g, lateral.e, lateral.d, w);
    assert.ok(nl > nf, 'frente=' + nf.toFixed(3) + ' lateral=' + nl.toFixed(3));
});

/* ------------------------------------------------------------------
   Passe para trás: só a quem está perto da jogada.
   ------------------------------------------------------------------ */

// Match falso, com o mínimo que o melhorRecuo lê.
function montarMatch(carrierZ, companheiros) {
    global.Match = {
        players: companheiros,
        opponents: [],
        ball: { position: { x: 0, y: 0, z: carrierZ } }
    };
}

const jog = (x, z, id, role) => ({
    id: id, role: role || 'mid', team: 'TeamA', dirZ: 1,
    model: { position: { x: x, z: z } }
});

test('o recuo só olha para quem está atrás da linha da bola', () => {
    const carrier = jog(0, 0, 'c');
    const atras = jog(0, -8, 'atras');
    const frente = jog(0, 8, 'frente');
    montarMatch(0, [carrier, atras, frente]);
    const r = PassTypes.melhorRecuo(carrier);
    assert.ok(r, 'devia ter encontrado alguém');
    assert.strictEqual(r.id, 'atras');
});

test('o recuo ignora quem está longe, mesmo estando atrás', () => {
    const carrier = jog(0, 0, 'c');
    const longe = jog(0, -(PassTypeModel.escolha.raioRecuo + 10), 'longe');
    montarMatch(0, [carrier, longe]);
    assert.strictEqual(PassTypes.melhorRecuo(carrier), null,
        'era este o atraso para o guarda-redes a meio-campo');
});

test('o guarda-redes serve, se estiver perto', () => {
    const carrier = jog(0, -30, 'c');
    const gk = jog(0, -40, 'gk', 'gk');
    montarMatch(-30, [carrier, gk]);
    const r = PassTypes.melhorRecuo(carrier);
    assert.ok(r, 'não é o papel que exclui, é a distância');
    assert.strictEqual(r.id, 'gk');
});

test('sem ninguém atrás e perto, devolve null', () => {
    const carrier = jog(0, 0, 'c');
    const frente = jog(0, 10, 'frente');
    montarMatch(0, [carrier, frente]);
    assert.strictEqual(PassTypes.melhorRecuo(carrier), null,
        'é este o caso que manda conduzir para trás');
});

test('entre dois atrás, escolhe o mais perto', () => {
    const carrier = jog(0, 0, 'c');
    const perto = jog(0, -5, 'perto');
    const meio = jog(0, -14, 'meio');
    montarMatch(0, [carrier, perto, meio]);
    assert.strictEqual(PassTypes.melhorRecuo(carrier).id, 'perto');
});

test('a equipa que ataca ao contrário recua para o outro lado', () => {
    const carrier = jog(0, 0, 'c');
    carrier.dirZ = -1;
    const atras = jog(0, 8, 'atras');   // atrás, para quem ataca em -z
    atras.dirZ = -1;
    montarMatch(0, [carrier, atras]);
    assert.strictEqual(PassTypes.melhorRecuo(carrier).id, 'atras');
});

test('a pressão sai do adversário mais perto do portador', () => {
    const carrier = jog(0, 0, 'c');
    global.Match = {
        players: [carrier],
        opponents: [jog(3, 0, 'perto'), jog(20, 0, 'longe')],
        ball: { position: { x: 0, y: 0, z: 0 } }
    };
    assert.strictEqual(PassTypes.distAdversarioMaisPerto(carrier), 3);
});

test('sem adversários em campo, a distância é infinita', () => {
    const carrier = jog(0, 0, 'c');
    global.Match = { players: [carrier], opponents: [], ball: { position: { x: 0, y: 0, z: 0 } } };
    assert.strictEqual(PassTypes.distAdversarioMaisPerto(carrier), Infinity);
    // E infinito não dá pressão nenhuma, nem NaN.
    assert.strictEqual(PassTypes.pressaoSobrePortador(Infinity, 8), 0);
});

/* ------------------------------------------------------------------
   Conduzir para trás: o cone com o eixo invertido.
   ------------------------------------------------------------------ */

const FSM_SRC = fs.readFileSync(path.join(raiz, 'js', 'fsm.js'), 'utf8');

// O bloco que escolhe a direcção de condução, dentro do case CARRY.
function blocoDoCarry() {
    const i = FSM_SRC.indexOf('// Escolhe a melhor direcção de condução');
    assert.ok(i >= 0, 'bloco do carry nao encontrado');
    const j = FSM_SRC.indexOf('p.dynamicTarget.set(alvoX', i);
    assert.ok(j > i, 'fim do bloco nao encontrado');
    return FSM_SRC.slice(i, j);
}

test('o alvo de recurso segue o sentido, não a direcção de ataque', () => {
    /*
    Era o defeito: `alvoZ = pz + 10 * p.dirZ`. Quando nenhum candidato passava
    os filtros, um portador em recuo era mandado dez metros para a FRENTE — o
    contrário do que o recuo pede.
    */
    const bloco = blocoDoCarry();
    assert.ok(bloco.indexOf('alvoZ = pz + 10 * sentido') >= 0,
        'o alvo de recurso devia usar o sentido');
    assert.ok(bloco.indexOf('alvoZ = pz + 10 * p.dirZ') < 0,
        'ficou o p.dirZ no alvo de recurso');
});

test('o sentido é declarado antes de ser usado', () => {
    const bloco = blocoDoCarry();
    const decl = bloco.indexOf('const sentido =');
    const uso = bloco.indexOf('alvoZ = pz + 10 * sentido');
    assert.ok(decl >= 0, 'sentido nao declarado');
    assert.ok(decl < uso, 'declarado depois de usado, daria ReferenceError');
});

test('o sector continua no referencial de ataque, não no do sentido', () => {
    /*
    O sector do painel (Left/Center/Right) é sempre no referencial de ataque da
    equipa, venha o portador a avançar ou a recuar. Invertê-lo aqui faria o
    recuo procurar o corredor errado.
    */
    const bloco = blocoDoCarry();
    assert.ok(bloco.indexOf('penalidadeSector(tx, p.dirZ)') >= 0,
        'a penalidade de sector devia continuar com p.dirZ');
    assert.ok(bloco.indexOf('penalidadeSector(tx, sentido)') < 0,
        'o sector nao pode seguir o sentido do recuo');
});

test('a condução em campo aberto não conta como drible tentado', () => {
    /*
    O ramo 1 da cascata muda para CARRY, não DRIBBLE: não há adversário
    nomeado, é campo aberto. Contava na mesma como drible tentado, e
    inflacionava as estatísticas com conduções que nunca foram um 1x1.
    */
    const BT = fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8');
    const i = BT.indexOf('function actPass(ctx)');
    assert.ok(i >= 0, 'actPass nao encontrado');
    const fim = BT.indexOf('function podeDriblar', i);
    const bloco = BT.slice(i, fim);
    assert.ok(bloco.indexOf('dribles.tentados') < 0,
        'o actPass não devia contar dribles');
});
