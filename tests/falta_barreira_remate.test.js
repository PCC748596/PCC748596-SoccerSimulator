/*
A BARREIRA A MENOS DE 9.15 m, E A FALTA QUE NUNCA ERA REMATADA.

Dois defeitos independentes, ambos no lance da falta.

1. OS 9.15 m. O afastamento existia, mas corria a meio do posicionamento — só
   sobre os defensores que sobram da barreira, e ANTES de os marcadores serem
   postos nos `slotsMarcacao`. Esses slots são medidos a partir da LINHA DE
   FUNDO e não sabem onde está a bola: numa falta perto da área caem lá dentro
   da distância regulamentar. Medido numa falta a 20 m da baliza, distâncias
   dos dez defensores à bola depois do setup:

       2.35  7.37  9.16  9.16  9.24  9.24  10.81  13.28 ...
        ^^^^  ^^^^  dois marcadores dentro dos 9.15 m

   Num lote de 60 faltas, 10 tinham alguém a menos de 9.15 m (mínimo 1.39 m).

2. A BATIDA DIRECTA. O `remateDistMax` era 23 m, medido ao centro da baliza:
   num lote de 60 faltas espalhadas pelo terço ofensivo, 51 acabavam em passe e
   9 em remate — e o mapa mostrava que só se rematava a 14 e 19 m, ou seja de
   dentro da área e da orla dela. A falta de 25-30 m de frente, que é a imagem
   da bola parada, caía sempre no passe.

Ferramenta: tools/headless/falta_lote.js

Corre com: node --test tests/falta_barreira_remate.test.js
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
const srcSet = src('js/match/match_setpieces.js');
const srcUtils = src('js/utils.js');

function extrairObjecto(s, nome) {
    const ini = s.indexOf(`const ${nome} = {`);
    assert.ok(ini > 0, `${nome} não encontrado`);
    const fim = s.indexOf(LF + '};', ini);
    return new Function(`${s.slice(ini, fim + 3)}; return ${nome};`)();
}

const F = extrairObjecto(srcCfg, 'FreeKickModel');

// decisaoDeFalta é geometria pura: dá para a extrair e correr.
const CAMPO_COMP = 106, LARGURA_BALIZA = 7.32;
const iniD = srcUtils.indexOf('function decisaoDeFalta(');
const fimD = srcUtils.indexOf(LF + '}', iniD);
const decisaoDeFalta = new Function('FreeKickModel', 'CAMPO_COMP', 'LARGURA_BALIZA',
    srcUtils.slice(iniD, fimD + 2) + '; return decisaoDeFalta;')(F, CAMPO_COMP, LARGURA_BALIZA);

test('a distância da barreira é a do regulamento', () => {
    assert.strictEqual(F.distanciaBarreira, 9.15, 'a barreira deixou de estar a 9.15 m');
    assert.ok(F.afastaAdversarios >= 9.15,
        'quem não faz barreira também não pode estar mais perto do que 9.15 m');
});

test('o afastamento é a ÚLTIMA coisa a acontecer no setup da falta', () => {
    /*
    É esta a correcção: o afastamento tem de correr depois dos marcadores, que
    são postos em slots medidos da linha de fundo e não sabem onde está a bola.
    */
    const ini = srcSet.indexOf("} else if (type === 'FREE_KICK') {");
    const fim = srcSet.indexOf("} else if (type === 'PENALTY') {", ini);
    const ramo = srcSet.slice(ini, fim);

    const posMarcadores = ramo.indexOf('const livres = defesaOrdenada.slice(nBarreira)');
    const posAfastamento = ramo.lastIndexOf('afastaAdversarios');
    assert.ok(posMarcadores > 0, 'o bloco dos marcadores desapareceu');
    assert.ok(posAfastamento > posMarcadores,
        'o afastamento voltou a correr ANTES dos marcadores — eles entram outra vez dentro dos 9.15 m');
    assert.ok(/defendingPlayers\.forEach/.test(ramo.slice(posMarcadores)),
        'o afastamento final tem de passar por TODOS os defensores, não só pelos que sobram da barreira');
});

test('remata-se de frente à distância a que se bate uma falta', () => {
    const dir = 1;
    const z = (d) => dir * (CAMPO_COMP / 2) - dir * d;

    // De frente: remata-se até 30 m.
    for (const d of [16, 20, 25, 29]) {
        assert.strictEqual(decisaoDeFalta(0, z(d), dir), 'remate',
            `a ${d} m de frente tem de haver batida directa`);
    }
    // E não se remata de qualquer sítio.
    assert.notStrictEqual(decisaoDeFalta(0, z(36), dir), 'remate',
        'a 36 m não se bate directo à baliza');
});

test('o ângulo continua a ser o outro corte', () => {
    const dir = 1;
    const z = (d) => dir * (CAMPO_COMP / 2) - dir * d;
    // Muito aberto, a meia distância: não há baliza à vista.
    assert.notStrictEqual(decisaoDeFalta(26, z(20), dir), 'remate',
        'de 26 m ao lado não se remata — o trapézio deixou de cortar pelo ângulo');
    assert.ok(F.remateAnguloTrave > 0.3 && F.remateAnguloTrave < 0.8,
        'o ângulo do trapézio saiu do razoável');
});

test('o tecto da batida directa não virou remate de qualquer sítio', () => {
    assert.ok(F.remateDistMax >= 26 && F.remateDistMax <= 34,
        `remateDistMax de ${F.remateDistMax} m não é a distância de uma falta directa`);
});
