/*
Defesa do penálti, as duas metades da mesma jogada:

  1. QUEM VAI AO SÍTIO CERTO — `PenaltyModel.chanceDefesa`, por banda do duelo
     `diff = (TEC + d10) - (GK + d10)`, aplicado só a remates que iam para
     dentro da baliza (ver baterPenalti em js/player.js). Antes só o ramo
     `diff <= -5` mandava o guarda-redes ao lado certo.

  2. PARA ONDE VAI A BOLA quando ele toca e não agarra — a espalmada do
     `GkDive.defender` (js/gk_dive.js). A bola encostada ao poste ou por cima
     do ombro sai pela LINHA DE FUNDO (canto); o resto volta ao campo.

Como nos outros testes desta pasta, as constantes são LIDAS do js/config.js e a
conta é replicada aqui: se uma das duas mudar, isto acusa.
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'shooting.js'), 'utf8')) + '\n' + semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'goalkeeper.js'), 'utf8')) + '\n' + semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'physics.js'), 'utf8'));
const srcDive = semCR(fs.readFileSync(path.join(raiz, 'js', 'gk_dive.js'), 'utf8'));
const srcPlayer = semCR(fs.readFileSync(path.join(raiz, 'js', 'player.js'), 'utf8'));

function extrairObjecto(src, nome, ficheiro) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em ${ficheiro}`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function(`${src.slice(ini, fim + 3)}; return ${nome};`)();
}

const PM = extrairObjecto(srcConfig, 'PenaltyModel', 'js/config.js');
const D = extrairObjecto(srcConfig, 'GoalkeeperDive', 'js/config.js');
const LARGURA_BALIZA = 7.32, ALTURA_BALIZA = 2.44;

/* ---- 1. bandas de chanceDefesa ------------------------------------------ */

// A mesma escolha de banda do baterPenalti.
function chanceDefesa(diff) {
    const CD = PM.chanceDefesa;
    if (diff > 5) return CD.perfeito;
    if (diff >= 3) return CD.bom;
    if (diff >= 1) return CD.medio;
    return CD.fraco;
}

test('chanceDefesa: existe, cai com a qualidade do remate e o ramo está no código', () => {
    assert.ok(PM.chanceDefesa, 'PenaltyModel.chanceDefesa em falta');
    const CD = PM.chanceDefesa;

    // Quanto melhor o remate, menos defesa. Monótona, sem excepções.
    assert.ok(CD.perfeito < CD.bom, 'perfeito tem de ser mais difícil que bom');
    assert.ok(CD.bom < CD.medio, 'bom tem de ser mais difícil que médio');
    assert.ok(CD.medio < CD.fraco, 'médio tem de ser mais difícil que fraco');

    for (const k of Object.keys(CD)) {
        assert.ok(CD[k] >= 0 && CD[k] <= 1, `${k} fora de [0,1]`);
    }

    // Um remate perfeito ao ângulo continua a ser quase sempre golo.
    assert.ok(CD.perfeito <= 0.05, 'defesa a mais no remate perfeito');

    // E o baterPenalti tem mesmo de usar isto — sem o ramo, as constantes
    // ficavam a decorar o config sem efeito nenhum.
    assert.ok(srcPlayer.includes('chanceDefesa'),
        'baterPenalti não lê PenaltyModel.chanceDefesa');
    assert.ok(srcPlayer.includes('gkDiveCol = targetCol'),
        'nada põe o mergulho no lado do remate');
});

test('chanceDefesa: taxa global fica numa faixa plausível de penáltis', () => {
    /*
    Replica o duelo de d10 com TEC = GK (equipas equivalentes) e mede quantos
    penáltis ENQUADRADOS acabam com o guarda-redes no sítio certo. Não é o
    número de defesas — ele ainda tem de lá chegar a tempo — é o tecto delas.
    */
    let enquadrados = 0, noSitio = 0;
    for (let a = 1; a <= 10; a++) {
        for (let b = 1; b <= 10; b++) {
            const diff = a - b;
            // As bandas que mandam a bola para dentro da baliza; a trave e o
            // fora não passam pelo sorteio (ver baterPenalti).
            if (diff < 1) continue;
            enquadrados++;
            noSitio += chanceDefesa(diff);
        }
    }
    const taxa = noSitio / enquadrados;
    assert.ok(taxa > 0.05 && taxa < 0.45,
        `tecto de defesas em remates enquadrados fora da faixa: ${taxa.toFixed(3)}`);
});

/* ---- 2. espalmada ------------------------------------------------------- */

/*
O ramo `paraFora` do GkDive.defender, replicado. `bola` e `vel` entram e saem
alterados, como lá.
*/
function espalmar(bola, vel, dirX) {
    const folgaPoste = (LARGURA_BALIZA / 2) - Math.abs(bola.x);
    const alta = bola.y > D.espalmarAltaY;
    const paraFora = alta || (folgaPoste < D.espalmarForaMargem);

    if (paraFora) {
        if (alta) {
            bola.y = ALTURA_BALIZA + D.espalmarFolga;
            vel.y = Math.max(vel.y, D.espalmarSubida);
        } else {
            const ladoPoste = Math.sign(bola.x) || dirX || 1;
            bola.x = ladoPoste * ((LARGURA_BALIZA / 2) + D.espalmarFolga);
            vel.x = ladoPoste * D.espalmarLateral;
            vel.y = Math.max(vel.y, 2.0);
        }
        vel.z *= D.espalmarForaZ;
    } else {
        vel.z *= -0.5;
        vel.x += dirX * (4 + 3);
        vel.y += 3;
    }
    return { paraFora, bola, vel };
}

const dentroDaArmacao = (b) => Math.abs(b.x) < LARGURA_BALIZA / 2 && b.y < ALTURA_BALIZA;

test('espalmada ao poste: sai da armação e mantém o sentido de z (canto)', () => {
    // Bola rasteira encostada ao poste direito, a entrar (z a diminuir).
    const bola = { x: 3.30, y: 0.40, z: -52.4 };
    const vel = { x: -2, y: 0, z: -20 };
    const r = espalmar(bola, vel, 1);

    assert.ok(r.paraFora, 'colada ao poste tinha de sair');
    assert.ok(!dentroDaArmacao(r.bola),
        `bola ficou dentro da armação: x=${r.bola.x} y=${r.bola.y}`);
    assert.ok(Math.abs(r.bola.x) > LARGURA_BALIZA / 2, 'não passou por fora do poste');
    // O sinal de z MANTIDO é o que a manda atravessar a linha de fundo.
    assert.ok(r.vel.z < 0, 'z inverteu — voltava ao campo em vez de sair');
    assert.ok(Math.sign(r.vel.x) === Math.sign(r.bola.x), 'empurrada para o poste errado');
});

test('espalmada por cima: passa acima do travessão', () => {
    const bola = { x: 0.5, y: 1.95, z: 52.4 };
    const vel = { x: 1, y: -1, z: 18 };
    const r = espalmar(bola, vel, -1);

    assert.ok(r.paraFora, 'bola alta tinha de sair');
    assert.ok(r.bola.y > ALTURA_BALIZA, 'ficou abaixo do travessão');
    assert.ok(r.vel.y >= D.espalmarSubida, 'sem impulso para cima');
    assert.ok(r.vel.z > 0, 'z inverteu — voltava ao campo em vez de sair');
});

test('espalmada ao meio e rasteira: volta ao campo, como antes', () => {
    const bola = { x: 0.2, y: 0.35, z: -52.4 };
    const vel = { x: 0, y: 0, z: -22 };
    const r = espalmar(bola, vel, 1);

    assert.ok(!r.paraFora, 'bola central e rasteira não é para canto');
    assert.ok(r.vel.z > 0, 'não foi devolvida ao campo');
    assert.strictEqual(r.bola.x, 0.2, 'a posição não se mexe na espalmada para o campo');
});

test('as constantes da espalmada estão no config e o gk_dive usa-as', () => {
    for (const k of ['espalmarForaMargem', 'espalmarAltaY', 'espalmarFolga',
                     'espalmarLateral', 'espalmarSubida', 'espalmarForaZ']) {
        assert.ok(typeof D[k] === 'number', `GoalkeeperDive.${k} em falta`);
        assert.ok(srcDive.includes(k), `gk_dive.js não lê ${k}`);
    }
    // A margem tem de caber dentro da baliza, senão TODA a espalmada sai.
    assert.ok(D.espalmarForaMargem < LARGURA_BALIZA / 2,
        'espalmarForaMargem larga de mais: nunca havia devolução ao campo');
    assert.ok(D.espalmarAltaY < ALTURA_BALIZA, 'espalmarAltaY acima do travessão');
    assert.ok(D.espalmarForaZ > 0, 'espalmarForaZ tem de manter o sentido (positivo)');
});
