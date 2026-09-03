/*
O RITMO DE REPOSICIONAMENTO: ESCALÕES E RECUPERAÇÃO PARA TRÁS.

Dois pedidos, o mesmo sítio:
  "velocidade de andar só a <= 2 metros"  -> o escalão do andar é o de 0 a 2 m.
  "a defesa está recuando muito devagar"  -> `bonusRecuo`, aplicado quando o
                                             alvo está atrás dele.

Corre com: node --test tests/ritmo_reposicionamento.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcBeh = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'player_behavior.js'), 'utf8'));
const srcBT = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));

function extrairObjecto(src, nome, extras) {
    const ini = src.indexOf(`const ${nome} = {`);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    const nomes = Object.keys(extras || {});
    return new Function(...nomes, `${src.slice(ini, fim + 3)}; return ${nome};`)
        (...nomes.map(n => extras[n]));
}
const srcGait = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'gait.js'), 'utf8'));
const GaitModel = extrairObjecto(srcGait, 'GaitModel', { Math });
const RepositionPace = extrairObjecto(srcBeh, 'RepositionPace', { GaitModel, Math });

test('o andar vale só até 2 m', () => {
    const escaloes = RepositionPace.escaloes;
    const andar = escaloes[escaloes.length - 1];
    const acima = escaloes[escaloes.length - 2];
    assert.strictEqual(andar[0], 0.0);
    assert.strictEqual(acima[0], 2.0, 'o escalão acima do andar tem de começar aos 2 m');

    // A 2.5 m já não anda; a 1.5 m anda.
    assert.ok(RepositionPace.cruzeiro(2.5, 50) > andar[1] + 0.01);
    assert.ok(Math.abs(RepositionPace.cruzeiro(1.5, 50) - andar[1]) < 1e-9);
});

test('os escalões são monótonos: mais longe, mais depressa', () => {
    let anterior = Infinity;
    for (const [d, v] of RepositionPace.escaloes) {
        assert.ok(v < anterior, `escalão a ${d} m não é mais lento do que o de cima`);
        anterior = v;
    }
});

test('recuar tem bónus, e é maior do que 1', () => {
    assert.ok(RepositionPace.bonusRecuo > 1.0,
        'sem bónus a defesa recua ao mesmo trote com que um médio ajusta de lado');
    assert.ok(RepositionPace.bonusRecuo <= 1.6, 'acima disto é teletransporte, não recuperação');
    assert.ok(RepositionPace.recuoMinimo >= 2.0,
        'perto do alvo o steerArrive trava sozinho: acelerar ali só produz vaivém');
});

test('o actHoldPosition aplica o bónus pelo SENTIDO, não pela distância', () => {
    const ini = srcBT.indexOf('function actHoldPosition(');
    const corpo = srcBT.slice(ini, srcBT.indexOf(LF + '}' + LF, ini));
    assert.ok(corpo.includes('bonusRecuo'), 'o bónus de recuo não está ligado');
    assert.ok(corpo.includes('* p.dirZ'),
        'o teste do recuo tem de ser no referencial de ataque do jogador');
    assert.ok(corpo.includes('recuoMinimo'), 'o piso do recuo não está a ser lido');
});
