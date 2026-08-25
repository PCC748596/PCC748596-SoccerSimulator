/*
MOLA DE COESAO A BOLA — `molaParaABola` (js/utils.js).

O QUE MOTIVOU ISTO, visto no ecra: um central com a bola junto a linha de
fundo adversaria, um lateral perto dele, e o outro central e o medio a CORREM
PARA LONGE da jogada.

Nao estavam a fugir da bola: iam para o slot deles no bloco. Quando as molas
de coesao foram apagadas (ver o comentario em match.js, "Foram apagadas, por
esta ordem: as molas de coesao..."), o unico laco que sobrou foi a coesao a
FORMA. E o apoio de circulacao nao os apanha, porque tem um corte por desenho:
so pode ser apoio quem estiver a menos de `desvioMax` (8 m) do proprio slot —
"nao arranca ninguem do outro lado do campo".

A REGRA QUE ISTO FIXA: puxa-se o alvo na direccao da bola, so o EXCESSO acima
de `distMin`, com tecto em `puxaoMax`. Quem ja esta na jogada nao e tocado; a
forma mantem-se e comprime-se para o lado da bola.

O tecto e a parte que impede isto de virar um ima — sem ele os onze acabavam
em cima da bola e a formacao deixava de existir.

Corre com: node tests/mola_coesao.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcUtils = ler('js/utils.js');
const srcConfig = ler('js/config.js');
const srcTeam = ler('js/bt/team_bt.js');

const i = srcUtils.indexOf('function molaParaABola');
if (i < 0) throw new Error('molaParaABola nao encontrada');
const molaParaABola = new Function(
    srcUtils.slice(i, srcUtils.indexOf(LF + '}', i) + 2) + '; return molaParaABola;')();

const iM = srcConfig.indexOf('const MolaDeCoesao = {');
const M = new Function(
    srcConfig.slice(iM, srcConfig.indexOf(LF + '};', iM) + 3) + '; return MolaDeCoesao;')();

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);
const dist = (a, bx, bz) => Math.hypot(a.x - bx, a.z - bz);

console.log(LF + '1 — quem ja esta na jogada nao e tocado');
{
    // Dentro de distMin: nem um centimetro.
    for (const d of [0, 3, 8, M.distMin]) {
        const a = molaParaABola(0, 0, d, 0, M.forcaComBola, M.distMin, M.puxaoMax);
        if (a.x !== 0 || a.z !== 0) {
            erro(`a ${d} m da bola (distMin ${M.distMin}) o alvo mexeu-se para ${a.x.toFixed(2)}`);
        }
    }
    ok(`ate ${M.distMin} m: alvo intocado`);
}

console.log(LF + '2 — quem esta longe aproxima-se, com tecto');
{
    // O caso da imagem: companheiro a 40 m da bola.
    const a = molaParaABola(0, 0, 40, 0, M.forcaComBola, M.distMin, M.puxaoMax);
    const aproximou = 40 - dist(a, 40, 0);
    if (aproximou <= 0) erro('a 40 m o jogador nao se aproximou nada');
    else ok(`a 40 m: aproxima-se ${aproximou.toFixed(1)} m`);

    // O TECTO. Sem ele isto vira um ima.
    const longe = molaParaABola(0, 0, 100, 0, M.forcaComBola, M.distMin, M.puxaoMax);
    const puxao = Math.hypot(longe.x, longe.z);
    if (puxao > M.puxaoMax + 1e-9) {
        erro(`a 100 m puxou ${puxao.toFixed(1)} m, acima do tecto de ${M.puxaoMax}`);
    } else ok(`tecto respeitado: ${puxao.toFixed(1)} m <= ${M.puxaoMax}`);

    // E NUNCA passa a bola: aproximar-se nao e ultrapassar.
    for (const d of [13, 20, 30, 60, 120]) {
        const r = molaParaABola(0, 0, d, 0, M.forcaComBola, M.distMin, M.puxaoMax);
        if (r.x > d) erro(`a ${d} m o alvo saltou para ALEM da bola (${r.x.toFixed(1)})`);
    }
    ok('nunca ultrapassa a bola');
}

console.log(LF + '3 — a forma mantem-se');
{
    /*
    A prova de que isto comprime e nao colapsa: uma linha de quatro defesas,
    espalhada em x, com a bola de um dos lados. Depois da mola tem de continuar
    a ser uma linha ORDENADA — os mesmos jogadores pela mesma ordem — e mais
    estreita, nao um ponto.
    */
    const linha = [-20, -7, 7, 20].map(x => ({ x, z: -30 }));
    const bola = { x: 30, z: 20 };

    const depois = linha.map(s =>
        molaParaABola(s.x, s.z, bola.x, bola.z, M.forcaComBola, M.distMin, M.puxaoMax));

    let ordenada = true;
    for (let k = 1; k < depois.length; k++) {
        if (depois[k].x <= depois[k - 1].x) ordenada = false;
    }
    if (!ordenada) erro('a linha trocou de ordem — a forma partiu-se');
    else ok('a linha mantem a ordem dos jogadores');

    const larguraAntes = linha[3].x - linha[0].x;
    const larguraDepois = depois[3].x - depois[0].x;
    if (larguraDepois >= larguraAntes) {
        erro(`a linha nao comprimiu (${larguraAntes.toFixed(1)} -> ${larguraDepois.toFixed(1)} m)`);
    } else if (larguraDepois < larguraAntes * 0.5) {
        erro(`a linha colapsou: ${larguraAntes.toFixed(1)} -> ${larguraDepois.toFixed(1)} m`);
    } else {
        ok(`comprime sem colapsar: ${larguraAntes.toFixed(1)} -> ${larguraDepois.toFixed(1)} m`);
    }

    // E desloca-se PARA o lado da bola, nao para o contrario.
    const centroAntes = (linha[0].x + linha[3].x) / 2;
    const centroDepois = (depois[0].x + depois[3].x) / 2;
    if (centroDepois <= centroAntes) erro('a linha afastou-se do lado da bola');
    else ok('desloca-se para o lado da bola');
}

console.log(LF + '4 — a defender puxa menos');
{
    if (!(M.forcaSemBola < M.forcaComBola)) {
        erro(`sem bola devia puxar menos (${M.forcaSemBola} vs ${M.forcaComBola})`);
    } else {
        const com = molaParaABola(0, 0, 40, 0, M.forcaComBola, M.distMin, M.puxaoMax);
        const sem = molaParaABola(0, 0, 40, 0, M.forcaSemBola, M.distMin, M.puxaoMax);
        if (!(sem.x < com.x)) erro('a forca sem bola nao produz um puxao menor');
        else ok(`com bola ${com.x.toFixed(1)} m, sem bola ${sem.x.toFixed(1)} m`);
    }

    // Forca zero desliga limpo.
    const off = molaParaABola(5, 5, 40, 40, 0, M.distMin, M.puxaoMax);
    if (off.x !== 5 || off.z !== 5) erro('forca 0 devia deixar o alvo intacto');
    else ok('forca 0 desliga a mola sem efeitos');
}

console.log(LF + '5 — corre no sitio certo da cadeia');
{
    const iMola = srcTeam.indexOf('molaParaABola(');
    const iOffside = srcTeam.indexOf('offsideLimitDir !== undefined');
    const iClamp = srcTeam.indexOf('THREE.MathUtils.clamp(molaX, -34, 34)');

    if (iMola < 0) erro('a mola nao esta ligada no team_bt.js');
    else if (!(iMola < iOffside)) {
        erro('a mola corre DEPOIS do corte de fora-de-jogo — pode empurrar para posicao irregular');
    } else ok('antes do corte de fora-de-jogo');

    if (iClamp < 0) erro('o alvo com mola nao chega ao clamp do campo');
    else if (!(iMola < iClamp)) erro('a mola corre depois do clamp — pode empurrar para fora das linhas');
    else ok('antes do clamp dos limites do campo');

    // O guarda-redes fica de fora.
    const bloco = srcTeam.slice(iMola - 700, iMola + 200);
    if (!/role\s*!==\s*'gk'/.test(bloco)) {
        erro('o guarda-redes nao esta excluido da mola');
    } else ok('guarda-redes fora da mola');
}

console.log(LF + (falhas === 0
    ? 'mola_coesao: tudo bem.'
    : `mola_coesao: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
