/*
CADA POSIÇÃO TEM A SUA MENTALIDADE, CADA JOGADOR TEM A SUA.

Pedido: "cada posição tem que ter um multiplicador de acções específico,
juntamente com as características dos jogadores; senão todos os jogadores vão
fazer a mesma coisa nos jogos".

`PositionalTendencies` dá o eixo da POSIÇÃO; `tendenciaDeAccao` acrescenta o
eixo do ATRIBUTO (config/physics.js). E `driveSpace` é a condução para o espaço
vazio de frente para a baliza — o multiplicador que faltava.

Corre com: node --test tests/tendencia_por_posicao_e_jogador.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcPhys = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'physics.js'), 'utf8'));
const srcBT = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));
const srcSkills = semCR(fs.readFileSync(path.join(raiz, 'data', 'player_skills.js'), 'utf8'));
// O ficheiro é um script clássico (`const PlayerSkillsData = {...}`), não um módulo.
const PlayerSkillsData = new Function(srcSkills + '; return PlayerSkillsData;')();

// As três atribuições a window que interessam, avaliadas isoladas.
function carregar() {
    const win = {};
    const trechos = ['window.PositionalTendencies = {', 'window.TendenciaPorAtributo = {',
        'window.getPositionalTendency = function', 'window.tendenciaDeAccao = function'];
    let codigo = '';
    for (const t of trechos) {
        const ini = srcPhys.indexOf(t);
        if (ini < 0) throw new Error(`${t} não encontrado`);
        const fim = srcPhys.indexOf(LF + '};', ini);
        codigo += srcPhys.slice(ini, fim + 3) + LF;
    }
    /*
    O `getPositionalTendency` lê `PositionalTendencies` SEM o prefixo `window.`
    — em browser é a mesma coisa (scope global partilhado, ver "Como está
    montado"), aqui não é. As duas linhas do fim dão-lhe esse global.
    */
    new Function('window', 'var PositionalTendencies, TendenciaPorAtributo;' + LF +
        codigo + LF +
        'PositionalTendencies = window.PositionalTendencies;' + LF +
        'TendenciaPorAtributo = window.TendenciaPorAtributo;')(win);
    return win;
}
const win = carregar();
const { PositionalTendencies, TendenciaPorAtributo, tendenciaDeAccao } = win;

const jog = (pos, sk) => ({ pos: pos, skillFor: (c) => (sk && sk[String(c).toLowerCase()]) ?? 50 });

test('toda a posição tem driveSpace, e o avançado conduz mais do que o trinco', () => {
    for (const pos of Object.keys(PositionalTendencies)) {
        assert.strictEqual(typeof PositionalTendencies[pos].driveSpace, 'number',
            `${pos} sem driveSpace`);
    }
    assert.ok(PositionalTendencies.ST.driveSpace > PositionalTendencies.CM.driveSpace);
    assert.ok(PositionalTendencies.CM.driveSpace > PositionalTendencies.DM.driveSpace);
    assert.ok(PositionalTendencies.DM.driveSpace > PositionalTendencies.CB.driveSpace);
});

test('os atributos existem mesmo no data/player_skills.js', () => {
    // O skillFor cai no genérico da FUNÇÃO quando o campo não existe — e aí o
    // segundo eixo desaparecia em silêncio, que é o que se está a corrigir.
    const campos = new Set(Object.keys(PlayerSkillsData.teamA[0]));
    for (const accao of Object.keys(TendenciaPorAtributo)) {
        const cfg = TendenciaPorAtributo[accao];
        if (!cfg || typeof cfg !== 'object') continue;   // min/max
        assert.ok(campos.has(cfg.skill),
            `'${cfg.skill}' (acção ${accao}) não é um campo de player_skills.js`);
    }
});

test('atributo 50 é neutro: fica a tendência da posição', () => {
    const medio = jog('ST', { speed: 50 });
    assert.ok(Math.abs(tendenciaDeAccao(medio, 'driveSpace') - PositionalTendencies.ST.driveSpace) < 1e-9);
});

test('dois jogadores da MESMA posição decidem diferente', () => {
    const rapido = jog('ST', { speed: 90 });
    const lento = jog('ST', { speed: 40 });
    const a = tendenciaDeAccao(rapido, 'driveSpace');
    const b = tendenciaDeAccao(lento, 'driveSpace');
    assert.ok(a > b, `rápido ${a.toFixed(2)} devia conduzir mais do que lento ${b.toFixed(2)}`);
    assert.ok((a - b) / b > 0.15, 'a diferença entre eles é pequena de mais para se ver em jogo');
});

test('os cortes seguram o pior caso', () => {
    const monstro = jog('ST', { speed: 100 });
    const nabo = jog('GK', { speed: 0 });
    assert.ok(tendenciaDeAccao(monstro, 'driveSpace') <= TendenciaPorAtributo.max);
    assert.ok(tendenciaDeAccao(nabo, 'driveSpace') >= TendenciaPorAtributo.min);
});

test('sem skillFor devolve a tendência da posição, sem rebentar', () => {
    assert.strictEqual(tendenciaDeAccao({ pos: 'CB' }, 'shoot'), PositionalTendencies.CB.shoot);
    assert.strictEqual(tendenciaDeAccao(null, 'shoot'), 1.0);
});

test('o campoAberto usa a tendência no espaço exigido E no orçamento', () => {
    const ini = srcBT.indexOf('get campoAberto()');
    const corpo = srcBT.slice(ini, srcBT.indexOf(LF + '    }', ini));
    assert.ok(corpo.includes("tendenciaDeAccao(this.p, 'driveSpace')"),
        'o campoAberto voltou a tratar toda a gente por igual');
    assert.ok(corpo.includes('espacoBase / Math.max'), 'o espaço exigido já não escala com a tendência');
    assert.ok(corpo.includes('* tendCond'), 'o orçamento de condução já não escala com a tendência');
});

test('o corredor livre até à baliza corta o Dominar e liga o ConduzirEmEspaco', () => {
    const iDominar = srcBT.indexOf("cond('aindaADominar'");
    const corpoDominar = srcBT.slice(iDominar, iDominar + 2500);
    assert.ok(corpoDominar.includes('frenteAFrenteComGk'),
        'sem isto o avançado fica a proteger a bola com a baliza aberta à frente');

    const iCond = srcBT.indexOf("seq('ConduzirEmEspaco'");
    const corpoCond = srcBT.slice(iCond, srcBT.indexOf("act('atacarOEspaco'", iCond));
    assert.ok(corpoCond.includes('frenteAFrenteComGk'),
        'o corredor livre tem de ganhar ao conduzirSoAcimaDe');
    assert.ok(corpoCond.includes("tendenciaDeAccao(p, 'driveSpace')"),
        'a fronteira do conduzirSoAcimaDe tem de ser da posição e do jogador');
});
