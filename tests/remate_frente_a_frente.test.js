/*
FRENTE A FRENTE COM O GUARDA-REDES: CHEGA-SE MAIS PERTO E TOCA-SE AO CANTO.

Relato: "os jogadores de ataque entram na área e já chutam no gol, de longe;
podem chegar mais perto para chutar quando estiverem sozinhos frente-a-frente
com o goleiro e tocar no canto".

Duas peças, as duas puras (utils.js):
  `frenteAFrenteComGk`  o corredor até à baliza está livre?
  `tipoDeRemate`        com a bandeira, nunca sai 'forca': toca-se ao canto.

Corre com: node --test tests/remate_frente_a_frente.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcShoot = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'shooting.js'), 'utf8'));
const srcBT = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));

const CAMPO_LARG = 68, CAMPO_COMP = 106, LINHA_FUNDO = CAMPO_COMP / 2;
const LARGURA_BALIZA = 7.32, ALTURA_BALIZA = 2.44;
const Area = { profundidade: 16.5, meiaLargura: 20.16 };

function extrairObjecto(src, nome, extras) {
    const ini = src.indexOf(`const ${nome} = {`);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    const nomes = Object.keys(extras || {});
    return new Function(...nomes, `${src.slice(ini, fim + 3)}; return ${nome};`)
        (...nomes.map(n => extras[n]));
}
function extrairFuncao(src, nome) {
    const ini = src.indexOf(`function ${nome}(`);
    if (ini < 0) throw new Error(`${nome} não encontrada`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const ShootingModel = extrairObjecto(srcShoot, 'ShootingModel', { Area, Math });
const ShotModel = extrairObjecto(srcShoot, 'ShotModel',
    { LARGURA_BALIZA, ALTURA_BALIZA, Math });
const F = ShootingModel.frenteAFrente;

const stubs = { ShootingModel, ShotModel, LARGURA_BALIZA, Math };
const frenteAFrenteComGk = new Function(...Object.keys(stubs),
    extrairFuncao(srcUtils, 'frenteAFrenteComGk') + '; return frenteAFrenteComGk;')
    (...Object.values(stubs));
const tipoDeRemate = new Function(...Object.keys(stubs),
    extrairFuncao(srcUtils, 'tipoDeRemate') + '; return tipoDeRemate;')(...Object.values(stubs));

// Ataca para +Z: a baliza que ele ataca é a de z = +53.
const golZ = LINHA_FUNDO, dirZ = 1;
const base = { x: 0, dirZ: dirZ, golZ: golZ };

test('os quatro números vivem no config', () => {
    for (const k of ['corredorMeiaLargura', 'recuoAtras', 'distanciaIdeal', 'distanciaMax']) {
        assert.strictEqual(typeof F[k], 'number', `${k} em falta em ShootingModel.frenteAFrente`);
    }
    assert.ok(F.distanciaIdeal < Area.profundidade,
        'o ponto do frente-a-frente tem de ficar DENTRO da área, senão a regra nunca morde');
});

test('corredor vazio: é frente a frente, e a distância vem certa', () => {
    const r = frenteAFrenteComGk(Object.assign({ z: golZ - 20, adversarios: [] }, base));
    assert.strictEqual(r.livre, true);
    assert.ok(Math.abs(r.dist - 20) < 0.01);
});

test('adversário no corredor tira o frente a frente', () => {
    const r = frenteAFrenteComGk(Object.assign({ z: golZ - 20, adversarios: [
        { x: F.corredorMeiaLargura - 0.5, z: golZ - 10 }
    ] }, base));
    assert.strictEqual(r.livre, false);
});

test('adversário por FORA do corredor não conta', () => {
    const r = frenteAFrenteComGk(Object.assign({ z: golZ - 20, adversarios: [
        { x: F.corredorMeiaLargura + 2.0, z: golZ - 10 }
    ] }, base));
    assert.strictEqual(r.livre, true);
});

test('adversário bem atrás não conta; colado atrás conta', () => {
    const longe = frenteAFrenteComGk(Object.assign({ z: golZ - 20, adversarios: [
        { x: 0, z: golZ - 20 - F.recuoAtras - 3 }
    ] }, base));
    assert.strictEqual(longe.livre, true, 'quem ficou para trás já não apanha ninguém');

    const colado = frenteAFrenteComGk(Object.assign({ z: golZ - 20, adversarios: [
        { x: 0, z: golZ - 20 - F.recuoAtras * 0.5 }
    ] }, base));
    assert.strictEqual(colado.livre, false, 'colado atrás vem a correr e apanha-o');
});

test('funciona a atacar para -Z', () => {
    const r = frenteAFrenteComGk({
        x: 0, z: -LINHA_FUNDO + 20, dirZ: -1, golZ: -LINHA_FUNDO,
        adversarios: [{ x: 0, z: -LINHA_FUNDO + 10 }]
    });
    assert.strictEqual(r.livre, false, 'o adversário está no caminho, do outro lado do campo');
});

test('a decisão de rematar espera até à distanciaIdeal', () => {
    // A leitura que o podeRematar faz: livre e ainda longe -> não remata.
    const longe = frenteAFrenteComGk(Object.assign(
        { z: golZ - (F.distanciaIdeal + 5), adversarios: [] }, base));
    assert.ok(longe.livre && longe.dist > F.distanciaIdeal,
        'a 16 m com tudo livre a regra tem de morder — é o remate de longe do relato');

    const perto = frenteAFrenteComGk(Object.assign(
        { z: golZ - (F.distanciaIdeal - 2), adversarios: [] }, base));
    assert.ok(perto.livre && perto.dist <= F.distanciaIdeal, 'aqui já se remata');
});

test('o emZonaDeRemate corre a regra ANTES da regra da área', () => {
    const corpo = srcBT.slice(srcBT.indexOf('function emZonaDeRemate('));
    const iFF = corpo.indexOf('frenteAFrenteComGk');
    const iArea = corpo.indexOf('ShootingModel.dentroDaArea');
    assert.ok(iFF > 0 && iArea > 0 && iFF < iArea,
        'a regra da área manda rematar assim que se pisa a área: o frente-a-frente tem de vir antes');
});

test('frente a frente nunca sai remate de força', () => {
    for (let i = 0; i <= 100; i++) {
        const t = tipoDeRemate({ dist: 9, tec: 70, distAdversario: 99,
            gkAdiantado: 0, frenteAFrente: true, rnd: i / 100 });
        assert.ok(t === 'rasteiro' || t === 'colocado',
            `rnd=${(i / 100).toFixed(2)} deu '${t}' — devia tocar ao canto`);
    }
});

test('sem a bandeira, o remate de força continua a existir', () => {
    let houveForca = false;
    for (let i = 0; i <= 100; i++) {
        if (tipoDeRemate({ dist: 9, tec: 70, distAdversario: 99,
            gkAdiantado: 0, rnd: i / 100 }) === 'forca') houveForca = true;
    }
    assert.ok(houveForca, 'a regra do frente-a-frente não pode ter apagado o remate normal');
});

test('o chapéu continua a ganhar com o guarda-redes fora da linha', () => {
    const t = tipoDeRemate({ dist: 12, tec: 70, distAdversario: 99,
        gkAdiantado: ShotModel.escolha.chapeuGkAdiantado + 1,
        frenteAFrente: true, rnd: 0.0 });
    assert.strictEqual(t, 'chapeu');
});
