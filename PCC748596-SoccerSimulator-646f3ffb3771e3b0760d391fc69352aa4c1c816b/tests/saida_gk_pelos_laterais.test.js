/*
SAÍDA DO GUARDA-REDES: O LATERAL BEM LIVRE MANDA.

Os laterais já eram candidatos à saída curta, mas concorriam com os centrais
numa nota que é `folga + bonusLateral` (3 m). Com um central muito desmarcado e
um lateral com folga confortável, ganhava o central — e a bola saía pelo meio,
que é a zona onde a perda custa golo.

A REGRA PEDIDA: um lateral com 10 m ou mais de folga é a saída, ponto. Não
concorre com nada: dez metros de espaço num corredor é a bola a sair a jogar em
segurança, e é por ali que se sai.

Abaixo desses 10 m nada muda — volta a valer a nota de sempre, com o bónus a
inclinar para o lateral sem o impor.

Corre com: node tests/saida_gk_pelos_laterais.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcConfig = ler('js/config/goalkeeper.js');
const srcPlayer = ler('js/bt/player_bt.js');

function extrairObjecto(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    if (i < 0) throw new Error(`${nome} não encontrado`);
    const f = src.indexOf(LF + '};', i);
    return new Function(`${src.slice(i, f + 3)}; return ${nome};`)();
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

const G = extrairObjecto(srcConfig, 'GoalkeeperDistribution');

const i = srcPlayer.indexOf('function acharLateralParaSaida(');
const achar = new Function('GoalkeeperDistribution',
    srcPlayer.slice(i, srcPlayer.indexOf(LF + '}', i) + 2) + '; return acharLateralParaSaida;'
)(G);

const jog = (nome, pos, x, z) => ({
    nome, pos, role: pos === 'GK' ? 'gk' : 'def',
    model: {
        position: {
            x, z,
            distanceTo(o) { return Math.hypot(o.x - x, o.z - z); }
        }
    }
});

const gk = jog('gk', 'GK', 0, -50);

/* =====================================================================
   1 — O NÚMERO PEDIDO
   ===================================================================== */
console.log(LF + '1 — dez metros');
{
    if (G.folgaPreferencialLateral !== 10.0) {
        erro(`a folga preferencial devia ser 10 m, é ${G.folgaPreferencialLateral}`);
    } else ok('folgaPreferencialLateral: 10 m');

    if (!(G.folgaPreferencialLateral > G.folgaMinima)) {
        erro('a folga preferencial tem de ser maior do que a mínima, senão ' +
            'apagava a saída pelos centrais toda');
    } else ok(`acima da folga mínima (${G.folgaMinima} m)`);
}

/* =====================================================================
   2 — LATERAL COM 10 M GANHA A UM CENTRAL AINDA MAIS LIVRE
   ===================================================================== */
console.log(LF + '2 — o lateral bem livre é a saída');
{
    const lateral = jog('LB', 'LB', -30, -42);
    const central = jog('CB', 'CB', -4, -44);

    // Adversário a 11 m do lateral e a 25 m do central: pela nota antiga
    // (folga + 3) ganhava o central; pela regra nova ganha o lateral.
    const opps = [
        jog('advA', 'ST', -30, -31),   // 11 m do lateral
        jog('advB', 'CM', -4, -19)     // 25 m do central
    ];

    const escolhido = achar({ p: gk, teammates: [gk, lateral, central], opponents: opps });
    if (!escolhido) erro('não escolheu ninguém com dois candidatos livres');
    else if (escolhido !== lateral) {
        erro(`saiu pelo ${escolhido.nome} — a bola sai pelo meio com o lateral livre`);
    } else ok('lateral com 11 m de folga: sai por ele');
}

/* =====================================================================
   3 — ABAIXO DOS 10 M, A NOTA DE SEMPRE
   ===================================================================== */
console.log(LF + '3 — sem os 10 m volta tudo ao que era');
{
    const lateral = jog('LB', 'LB', -30, -42);
    const central = jog('CB', 'CB', -4, -44);

    // Lateral com 6 m (acima da mínima, abaixo da preferencial) e central com
    // 25 m: a nota antiga dá 6+3=9 contra 25, e o central ganha.
    const opps = [
        jog('advA', 'ST', -30, -36),
        jog('advB', 'CM', -4, -19)
    ];

    const escolhido = achar({ p: gk, teammates: [gk, lateral, central], opponents: opps });
    if (escolhido !== central) {
        erro(`devia sair pelo central muito desmarcado, saiu por ${escolhido && escolhido.nome}`);
    } else ok('lateral com 6 m: o central muito livre continua a ganhar');
}

/* =====================================================================
   4 — ENTRE DOIS LATERAIS BEM LIVRES, O MAIS LIVRE
   ===================================================================== */
console.log(LF + '4 — dois laterais acima dos 10 m');
{
    const esq = jog('LB', 'LB', -30, -42);
    const dir = jog('RB', 'RB', 30, -42);
    const opps = [
        jog('advA', 'ST', -30, -30),   // 12 m do LB
        jog('advB', 'CM', 30, -24)     // 18 m do RB
    ];

    const escolhido = achar({ p: gk, teammates: [gk, esq, dir], opponents: opps });
    if (escolhido !== dir) {
        erro(`devia sair pelo mais livre (RB, 18 m), saiu por ${escolhido && escolhido.nome}`);
    } else ok('sai pelo lateral com mais espaço');
}

/* =====================================================================
   5 — O QUE NÃO PODIA MUDAR
   ===================================================================== */
console.log(LF + '5 — os cortes antigos continuam lá');
{
    // Adversário em cima do lateral: não serve, por muito lateral que seja.
    const lateral = jog('LB', 'LB', -30, -42);
    const opps = [jog('advA', 'ST', -30, -40)];   // 2 m
    if (achar({ p: gk, teammates: [gk, lateral], opponents: opps })) {
        erro('saiu para um lateral com o adversário em cima');
    } else ok('folga mínima: continua a cortar');

    // Longe de mais para saída curta.
    const longe = jog('LB', 'LB', -30, 20);
    if (achar({ p: gk, teammates: [gk, longe], opponents: [] })) {
        erro('tratou um passe de mais de 45 m como saída curta');
    } else ok('distância máxima: continua a cortar');

    // Um médio não é opção de saída curta, esteja como estiver.
    const medio = jog('CM', 'CM', 0, -30);
    if (achar({ p: gk, teammates: [gk, medio], opponents: [] })) {
        erro('escolheu um médio para a saída pelos defesas');
    } else ok('só laterais e centrais');
}

console.log(LF + (falhas ? `FALHOU: ${falhas}` : 'OK'));
process.exit(falhas ? 1 : 0);
