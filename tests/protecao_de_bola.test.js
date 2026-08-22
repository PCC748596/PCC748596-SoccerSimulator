/*
PROTECCAO DA BOLA — pedido explicito do dono do projecto:

  "Tem jogador roubando a bola por tras do outro que tem a bola dominada.
   Isso nao pode acontecer. So pode ter disputa se tiverem lado a lado."

O resolveBallContact escolhia o jogador mais PROXIMO da bola e mais nada: um
adversario que chegasse por tras e ficasse 10 cm mais perto levava a bola, sem
disputa nenhuma (com a bola lenta, `speed < easySpeed`, o dominio e automatico).

E a contraparte: quem persegue nao pode mirar o mesmo ponto que o portador —
tem de mirar ao lado, para emparelhar e ultrapassar. So vai a direito se vier
de frente.
*/
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const { ctx } = require(path.join(raiz, 'tests', 'headless.js'));

vm.runInContext('if (!Match.players.length) { Match.init(new THREE.Scene()); for (let i=0;i<60;i++) Match.update(0.016); }', ctx);

function aval(expr) {
    return JSON.parse(vm.runInContext(`JSON.stringify((() => { ${expr} })())`, ctx));
}

/*
Cenario: o dono corre no sentido +Z com a bola nos pes, e um adversario chega
pelo lado que o teste pedir. Devolve quem ficou com a bola.
*/
const CENARIO = `
    function cenario(offsetX, offsetZ, bolaZ) {
        const dono = Match.players.find(p => p.role !== 'gk');
        const ladrao = Match.opponents.find(p => p.role !== 'gk');

        Match.state = 'PLAY';
        // Um passe em curso nao tem dono (ver donoDaBola): limpar, senao o
        // estado deixado por outro teste desliga a proteccao.
        Match.intendedReceiver = null;
        dono.model.position.set(0, 0, 0);
        dono.velocity.set(0, 0, 6);          // a correr para +Z
        dono.hasBall = true;
        dono.touchLock = 0;
        dono.carryTouchGrace = 0.5;
        Match.ballCarrier = dono;
        // bolaZ negativo = a bola ficou ATRAS do dono (recepcao mal dominada),
        // que e quando o adversario de tras chega mesmo mais perto dela.
        Match.ball.position.set(0, BallPhysics.raio, bolaZ === undefined ? 0.5 : bolaZ);
        Match.ballVel.set(0, 0, 6);

        ladrao.model.position.set(offsetX, 0, offsetZ);
        ladrao.velocity.set(0, 0, 7);
        ladrao.hasBall = false;
        ladrao.touchLock = 0;

        return { dono: dono, ladrao: ladrao };
    }
`;

test('um adversario que chega POR TRAS nao rouba a bola', () => {
    const r = aval(`${CENARIO}
        // Bola atras do dono e o ladrao ainda mais atras: ele fica MAIS PERTO
        // da bola do que o proprio dono. Era assim que a roubava.
        const c = cenario(0.15, -1.1, -0.8);
        Match.resolveBallContact();
        return { carrier: Match.ballCarrier === c.ladrao ? 'ladrao' : 'dono' };
    `);
    assert.strictEqual(r.carrier, 'dono', 'a bola foi roubada por tras');
});

test('lado a lado, a disputa acontece', () => {
    const r = aval(`${CENARIO}
        const c = cenario(0.8, 0.5);         // emparelhado, mesma altura
        const podia = podeDisputarBola(c.ladrao);
        return { podia };
    `);
    assert.strictEqual(r.podia, true, 'emparelhado devia poder disputar');
});

test('de frente, a disputa acontece', () => {
    const r = aval(`${CENARIO}
        const c = cenario(0.2, 1.6);         // a frente do dono, a vir contra
        const podia = podeDisputarBola(c.ladrao);
        return { podia };
    `);
    assert.strictEqual(r.podia, true, 'de frente devia poder disputar');
});

test('o proprio dono nunca e travado pela proteccao', () => {
    const r = aval(`${CENARIO}
        const c = cenario(5, -5);
        return { podia: podeDisputarBola(c.dono) };
    `);
    assert.strictEqual(r.podia, true, 'o dono ficou impedido de tocar na propria bola');
});

test('sem dono, toda a gente pode disputar', () => {
    const r = aval(`${CENARIO}
        const c = cenario(0.2, -0.9);
        // Bola mesmo solta: sem carrier e sem ninguem em conducao.
        Match.ballCarrier = null;
        for (const lista of [Match.players, Match.opponents]) {
            for (const j of lista) { j.hasBall = false; j.carryTouchGrace = 0; }
        }
        return { podia: podeDisputarBola(c.ladrao) };
    `);
    assert.strictEqual(r.podia, true, 'bola solta devia ser de quem lá chegar');
});

test('quem persegue por tras mira AO LADO, para emparelhar', () => {
    const r = aval(`${CENARIO}
        const c = cenario(0.3, -3.0);        // vem de tras
        const alvo = alvoDePerseguicao(c.ladrao);
        return {
            desvioLateral: Math.round(Math.abs(alvo.x - Match.ball.position.x) * 100) / 100
        };
    `);
    assert.ok(r.desvioLateral > 0.5,
        `mirou o mesmo ponto do portador (desvio ${r.desvioLateral} m) em vez de emparelhar`);
});

test('quem vem de frente mira a bola, sem desvio', () => {
    const r = aval(`${CENARIO}
        const c = cenario(0.2, 6.0);         // vem de frente
        c.ladrao.velocity.set(0, 0, -7);
        const alvo = alvoDePerseguicao(c.ladrao);
        return {
            desvioLateral: Math.round(Math.abs(alvo.x - Match.ball.position.x) * 100) / 100
        };
    `);
    assert.ok(r.desvioLateral < 0.3,
        `de frente devia ir a direito, desviou ${r.desvioLateral} m`);
});
