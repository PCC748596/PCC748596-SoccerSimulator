/*
OS QUATRO CRUZAMENTOS DA FALTA LATERAL.

Antes havia um só: o mini-canto, e só a partir de |x| >= 20.16 (já fora da
largura da grande área) — a falta lateral junto à área caía no ramo do passe e
saía dali um passe curto para a frente. E o cruzamento que havia era um alvo
fixo com velocidade fixa de 24 m/s e componente vertical fixa de 9.6, ou seja a
conta do vácuo, que deixa a bola curta como deixava o canto.

Agora são quatro: primeira trave, segunda trave e marca do penálti pelo ALTO,
para a cabeça, e entrada da área a MEIA ALTURA, para quem chega a rematar de
primeira.

O que este teste fixa é o que distingue os quatro — para onde vão e a que
ALTURA lá chegam. A altura de chegada é o que se PEDE; a força de saída é
consequência, resolvida com arrasto no `velocidadeParaAlturaNoAlvo`.

Corre com: node --test tests/falta_cruzamento.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const src = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcCfg = src('js/config/shooting.js');
const srcFis = src('js/config/physics.js');
const srcUtils = src('js/utils.js');

function extrairObjecto(s, nome) {
    const ini = s.indexOf('const ' + nome + ' = {');
    assert.ok(ini > 0, nome + ' não encontrado');
    const fim = s.indexOf(LF + '};', ini);
    return new Function(s.slice(ini, fim + 3) + '; return ' + nome + ';')();
}
function extrairFuncao(s, nome) {
    const ini = s.indexOf('function ' + nome + '(');
    assert.ok(ini > 0, nome + ' não encontrada');
    const fim = s.indexOf(LF + '}', ini);
    return s.slice(ini, fim + 2);
}

const FreeKickModel = extrairObjecto(srcCfg, 'FreeKickModel');
const BallPhysics = extrairObjecto(srcFis, 'BallPhysics');
BallPhysics.kArrasto = 0.5 * BallPhysics.densidadeAr * BallPhysics.cd *
    (Math.PI * BallPhysics.raio * BallPhysics.raio) / BallPhysics.massa;
const CAMPO_COMP = 106;

const ambiente = { BallPhysics, FreeKickModel, CAMPO_COMP };
const codigo = extrairFuncao(srcUtils, 'velocidadeParaAlturaNoAlvo') + LF +
    extrairFuncao(srcUtils, 'cruzamentoDeFalta') + LF +
    'return { velocidadeParaAlturaNoAlvo, cruzamentoDeFalta };';
const solvers = new Function(...Object.keys(ambiente), codigo)(...Object.values(ambiente));
const velocidadeParaAlturaNoAlvo = solvers.velocidadeParaAlturaNoAlvo;
const cruzamentoDeFalta = solvers.cruzamentoDeFalta;

// O voo real: arrasto quadrático nas três componentes, como no updateBall.
function alturaNoAlvo(bola, vel, alvo) {
    let x = bola.x, y = bola.y, z = bola.z;
    let vx = vel.x, vy = vel.y, vz = vel.z;
    const dt = 1 / 120;
    let dMin = Infinity, altura = null;
    for (let i = 0; i < 1500; i++) {
        const s = Math.hypot(vx, vy, vz);
        if (s > 0.001) {
            const dv = BallPhysics.kArrasto * s * s * dt;
            vx -= vx / s * dv; vy -= vy / s * dv; vz -= vz / s * dv;
        }
        vy -= BallPhysics.gravidade * dt;
        x += vx * dt; y += vy * dt; z += vz * dt;
        const d = Math.hypot(alvo.x - x, alvo.z - z);
        if (d < dMin) { dMin = d; altura = y; }
        if (y < 0) break;
    }
    return { altura: altura, dMin: dMin };
}

const dir = 1;
const bolaEm = (x, distGol) => ({
    x: x, y: BallPhysics.raio, z: dir * (CAMPO_COMP / 2) - dir * distGol
});

test('os quatro alvos existem e são o que dizem ser', () => {
    const porNome = {};
    FreeKickModel.cruzamentos.forEach(c => { porNome[c.nome] = c; });

    for (const n of ['primeira_trave', 'segunda_trave', 'marca_penalti', 'entrada_da_area']) {
        assert.ok(porNome[n], 'falta o alvo ' + n);
    }
    // As duas traves em lados opostos do eixo, à distância dos postes (±3.66).
    assert.ok(Math.sign(porNome.primeira_trave.relX) !== Math.sign(porNome.segunda_trave.relX),
        'as duas traves têm de ficar em lados opostos do eixo');
    assert.ok(Math.abs(porNome.marca_penalti.relX) < 0.5, 'a marca do penálti é no eixo');
    assert.ok(Math.abs(porNome.marca_penalti.dist - 11.0) <= 1.5, 'a marca do penálti é a 11 m');

    // Três pelo alto, para a cabeça; um a meia altura, para o pé.
    const altos = FreeKickModel.cruzamentos.filter(c => c.altura >= 2.0);
    assert.strictEqual(altos.length, 3, 'deviam ser três cruzamentos pelo alto');
    assert.ok(porNome.entrada_da_area.altura < 1.6 && porNome.entrada_da_area.altura > 0.6,
        'a entrada da área é MEIA ALTURA');
    assert.ok(porNome.entrada_da_area.elevacao < altos[0].elevacao,
        'a bola para a entrada da área tem de sair mais TENSA do que as chapeladas');
});

test('a bola chega ao alvo À ALTURA PEDIDA, com o arrasto contado', () => {
    const total = FreeKickModel.cruzamentos.reduce((s, o) => s + o.peso, 0);
    for (let idx = 0; idx < FreeKickModel.cruzamentos.length; idx++) {
        const c = FreeKickModel.cruzamentos[idx];
        const antes = FreeKickModel.cruzamentos.slice(0, idx).reduce((s, o) => s + o.peso, 0);
        for (const par of [[16, 12], [22, 18], [-19, 8], [26, 22]]) {
            // rnd que escolhe exactamente este alvo e não desloca nada.
            let chamada = 0;
            const rnd = () => (chamada++ === 0) ? (antes + c.peso / 2) / total : 0.5;

            const bola = bolaEm(par[0], par[1]);
            const cruz = cruzamentoDeFalta(bola, dir, [], rnd);
            assert.ok(cruz, 'sem cruzamento de x=' + par[0] + ', ' + par[1] + ' m');
            assert.strictEqual(cruz.nome, c.nome, 'o rnd não escolheu o alvo pedido');

            const r = alturaNoAlvo(bola, cruz.vel, cruz.alvo);
            assert.ok(r.dMin < 1.0,
                'a bola nem passa pelo alvo (falhou por ' + r.dMin.toFixed(2) + ' m)');
            assert.ok(Math.abs(r.altura - c.altura) < 0.25,
                c.nome + ' de x=' + par[0] + '/' + par[1] + ' m: chega a ' +
                r.altura.toFixed(2) + ' m e devia chegar a ' + c.altura + ' m');
        }
    }
});

test('o alvo com companheiros lá é preferido', () => {
    /*
    Cruzar para a segunda trave sem ninguém na segunda trave é dar a bola ao
    guarda-redes.
    */
    const bola = bolaEm(20, 14);
    const linhaFundo = dir * (CAMPO_COMP / 2);
    const seg = FreeKickModel.cruzamentos.filter(c => c.nome === 'segunda_trave')[0];
    const lado = Math.sign(bola.x);
    const naSegunda = {
        model: { position: { x: lado * seg.relX, z: linhaFundo - dir * seg.dist } }
    };

    const conta = (companheiros) => {
        const r = {};
        let i = 0;
        const rnd = () => ((i++ * 0.0137) % 1);   // varre o intervalo todo
        for (let n = 0; n < 400; n++) {
            const c = cruzamentoDeFalta(bola, dir, companheiros, rnd);
            if (c) r[c.nome] = (r[c.nome] || 0) + 1;
        }
        return r;
    };

    const sem = conta([]);
    const com = conta([naSegunda]);
    assert.ok((com.segunda_trave || 0) > (sem.segunda_trave || 0),
        'o bónus por companheiro não funciona: ' + sem.segunda_trave + ' -> ' + com.segunda_trave);
});

test('sem solução devolve null em vez de inventar um cruzamento', () => {
    const v = velocidadeParaAlturaNoAlvo(200, 14 * Math.PI / 180, 1.1);
    assert.strictEqual(v, null, 'devia não haver solução a 200 m');
});

test('o nome não colide com o velocidadeParaChegarA do passe rasteiro', () => {
    /*
    Foram o mesmo nome durante uns minutos, e em scripts clássicos a segunda
    declaração ganha: os cruzamentos saíam a 2.3 m/s, ou seja a bola caía aos
    pés do batedor. Custou uma medição a apanhar.
    */
    const decls = (srcUtils.match(/function velocidadeParaChegarA\(/g) || []).length;
    assert.strictEqual(decls, 1, 'há mais do que uma declaração de velocidadeParaChegarA');
    assert.ok(srcUtils.indexOf('function velocidadeParaAlturaNoAlvo(') >= 0,
        'o solver da altura no alvo desapareceu');
});
