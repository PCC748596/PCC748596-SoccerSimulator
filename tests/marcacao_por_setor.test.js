/*
O TECTO DA MARCAÇÃO É O DO SETOR — nas duas camadas, e não só numa.

PORQUE EXISTE. O `biasMaxPorSetor` (def/mid/atk × low/balanced/high) já existia
e já era respeitado pela camada posicional, mas a FOLHA `marcar` da árvore do
jogador passava `MarkingModel.raioSetor` (12 m) como tecto de desvio. O
`raioSetor` é o raio de PROCURA — a que distância do slot ainda se considera um
homem — e usá-lo como tecto de DESLOCAÇÃO são duas coisas diferentes coladas no
mesmo número.

Efeito em campo: quem estava a marcar saía até 12 m do posto que o TeamBT lhe
tinha dado, em qualquer terço, incluindo dentro da própria defesa. Lia-se como
a marcação a mandar mais do que o bloco, e era.

Corre com: node tests/marcacao_por_setor.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcConfig = ler('js/config/defense.js');
const srcPlayer = ler('js/bt/player_bt.js');

function extrairObjecto(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    const f = src.indexOf(LF + '};', i);
    return new Function(`const CAMPO_COMP = 106;
        ${src.slice(i, f + 3)}; return ${nome};`)();
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/* =====================================================================
   1 — OS VALORES PEDIDOS
   ===================================================================== */
console.log(LF + '1 — 7 m no ataque, 5 no meio, 3 na defesa (Balanced)');
{
    const M = extrairObjecto(srcConfig, 'MarkingModel');
    const T = M.biasMaxPorSetor;

    const pedido = { atk: 7.0, mid: 5.0, def: 3.0 };
    for (const setor of ['atk', 'mid', 'def']) {
        if (T[setor].balanced !== pedido[setor]) {
            erro(`${setor} Balanced devia ser ${pedido[setor]} m, é ${T[setor].balanced}`);
        } else ok(`${setor} Balanced: ${pedido[setor]} m`);
    }

    // A escada por setor: fechar na própria defesa, folgar no ataque. Perto da
    // própria baliza um central arrastado para fora abre um buraco na área;
    // no terço de ataque perder o homem custa menos do que perder a forma.
    for (const grau of ['low', 'balanced', 'high']) {
        if (!(T.def[grau] < T.mid[grau] && T.mid[grau] < T.atk[grau])) {
            erro(`em ${grau} o tecto devia crescer def < mid < atk: ` +
                `${T.def[grau]} / ${T.mid[grau]} / ${T.atk[grau]}`);
        } else ok(`${grau}: def ${T.def[grau]} < mid ${T.mid[grau]} < atk ${T.atk[grau]}`);
    }

    // E a escada por Defensive Pressure, dentro de cada setor.
    for (const setor of ['atk', 'mid', 'def']) {
        if (!(T[setor].low < T[setor].balanced && T[setor].balanced < T[setor].high)) {
            erro(`em ${setor} o tecto devia crescer com a pressão: ${JSON.stringify(T[setor])}`);
        } else ok(`${setor}: low < balanced < high`);
    }

    // Nenhum tecto pode chegar ao raio de procura: se chegasse, o marcador
    // podia acabar tão longe do slot que já nem o homem lhe pertencia.
    for (const setor of ['atk', 'mid', 'def']) {
        if (T[setor].high >= M.raioSetor) {
            erro(`${setor} high (${T[setor].high}) devia ficar abaixo do raioSetor (${M.raioSetor})`);
        }
    }
    ok(`todos abaixo do raio de procura (${M.raioSetor} m)`);
}

/* =====================================================================
   2 — A FOLHA `marcar` USA O TECTO DO SETOR, NÃO O RAIO DE PROCURA
   ===================================================================== */
console.log(LF + '2 — a árvore deixa de desviar 12 m em qualquer terço');
{
    const i = srcPlayer.indexOf('function actMarcar(');
    if (i < 0) throw new Error('actMarcar não encontrada');
    const corpo = srcPlayer.slice(i, srcPlayer.indexOf(LF + '}', i));

    if (/pontoDeMarcacao\([^)]*raioSetor/s.test(corpo)) {
        erro('actMarcar continua a passar o raioSetor como tecto de desvio');
    } else ok('o raioSetor já não é usado como tecto de desvio');

    if (!/biasMaxPara/.test(corpo)) {
        erro('actMarcar não consulta o biasMaxPara — o setor não tem palavra');
    } else ok('o tecto sai do biasMaxPara');

    /*
    E o tecto tem de vir da zona do SLOT, a mesma convenção da camada
    posicional (`targetZ * p.dirZ` em aplicarMarcacaoPosicional). Tirá-lo da
    posição do HOMEM daria tectos diferentes aos dois passos para o mesmo
    jogador no mesmo frame.
    */
    if (!/biasMaxPara\(\s*base\.z\s*\*\s*p\.dirZ\s*\)/.test(corpo)) {
        erro('o tecto devia sair da zona do slot (base.z * p.dirZ)');
    } else ok('a zona é a do slot, como na camada posicional');
}

/* =====================================================================
   3 — O TECTO CORTA MESMO
   ===================================================================== */
console.log(LF + '3 — com o homem longe, o marcador fica a um tecto do slot');
{
    const M = extrairObjecto(srcConfig, 'MarkingModel');
    const j = srcConfig.indexOf('function pontoDeMarcacao(');
    if (j < 0) throw new Error('pontoDeMarcacao não encontrada em js/config.js');
    const pontoDeMarcacao = new Function(
        srcConfig.slice(j, srcConfig.indexOf(LF + '}' + LF, j) + 3) + '; return pontoDeMarcacao;'
    )();

    // Central no seu terço defensivo, homem a 20 m — mais longe do que
    // qualquer tecto. O ponto tem de ficar a 3 m do slot, não a 12.
    const slot = { x: 0, z: -30 };
    const tecto = M.biasMaxPorSetor.def.balanced;
    const p = pontoDeMarcacao(slot.x, slot.z, 0, -10, -53, M.distancia, tecto);
    const desvio = Math.hypot(p.x - slot.x, p.z - slot.z);

    if (desvio > tecto + 0.01) {
        erro(`o desvio foi de ${desvio.toFixed(1)} m, acima do tecto de ${tecto} m`);
    } else ok(`homem a 20 m, desvio de ${desvio.toFixed(1)} m (tecto ${tecto} m)`);
}

console.log(LF + (falhas ? `FALHOU: ${falhas}` : 'OK'));
process.exit(falhas ? 1 : 0);
