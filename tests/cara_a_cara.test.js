/*
CARA A CARA — o passe que isola um companheiro com o guarda-redes.

O que este teste fixa é a leitura do FORA-DE-JOGO dentro do ramo: quem é
julgado é o COMPANHEIRO, na posição em que está quando a bola sai do pé, e não
o ponto onde a bola vai cair.

O defeito: comparava-se com a linha o `ponto` do passe, que está
`avancoDoPasse` (7 m) à frente do companheiro. Um companheiro em linha com o
último defensor — que é exactamente o lance que se procura — dava sempre um
ponto 7 m além da linha, e a jogada era rejeitada por construção. Medido num
lote headless de 74 min: dos 52 pares que chegavam a este filtro, ele matava
os 52, e o `caraACara` das fichas dava 0 em 30 jogos.

Correr para lá da linha atrás da bola é legal, e é assim que o árbitro do
próprio simulador julga a jogada (`marcarPosicoesDeImpedimento`, officials.js):
pela posição de quem recebe no instante do passe.

Corre com: node tests/cara_a_cara.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { console.log('  X ' + m); falhas++; };

// As duas funções de produção, tiradas do ficheiro real para o teste não
// correr uma cópia que podia divergir sem ninguém dar por isso.
const src = ler('js/bt/player_bt.js');
function extrair(nome) {
    const cabeca = 'function ' + nome + '(';
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(nome + ' não encontrado em player_bt.js');
    const fim = src.indexOf(LF + '}', ini);
    return src.slice(ini, fim + 2);
}

// O JogadasCombinadas real, do config.
// O passing.js le constantes do physics.js (ALTURA_CABECA e companhia).
const THREE = require('three');
const JogadasCombinadas = new Function('window', 'THREE', ler('js/config/physics.js') + LF +
    ler('js/config/passing.js') + LF + 'return JogadasCombinadas;')({}, THREE);

const GOL_Z = 53;

/*
Um cenário: TeamA ataca para z positivo. A defesa está toda em z = 30, e a
linha de fora-de-jogo (que o passador lê) está no mesmo sítio.
*/
function cenario({ mateZ, mateX, offsideLimitDir, defesaExtra, mateVz }) {
    const jog = (team, x, z, role) => ({
        team, role: role || 'cf', dirZ: 1, targetGoalZ: GOL_Z, offsideBias: 0,
        model: { position: { x: x, z: z } }, velocity: { x: 0, z: 0 }
    });

    const portador = jog('TeamA', 0, 5);
    const mate = jog('TeamA', mateX === undefined ? 0 : mateX, mateZ);
    // Ele SAI A CORRER: a velocidade para a frente é parte do lance.
    mate.velocity.z = (mateVz === undefined) ? 5.0 : mateVz;
    // Defesa: dois centrais afastados do corredor central, mais o guarda-redes.
    const advs = [
        Object.assign(jog('TeamB', 0, GOL_Z), { role: 'gk' }),
        jog('TeamB', -12, 30, 'cb'),
        jog('TeamB', 12, 30, 'cb')
    ];
    if (defesaExtra) advs.push(jog('TeamB', defesaExtra.x, defesaExtra.z, 'cb'));

    const Match = {
        players: [portador, mate],
        opponents: advs,
        ball: { position: { x: 0, z: 5 } }
    };
    const TeamAI = { get: () => ({ offsideLimitDir: offsideLimitDir }) };

    const fn = new Function('Match', 'TeamAI', 'JogadasCombinadas', 'PassCandidates',
        extrair('corredorLivre') + LF + extrair('procurarCaraACara') + LF +
        'return procurarCaraACara;')(Match, TeamAI, JogadasCombinadas, undefined);

    return { resultado: fn(portador), mate: mate };
}

console.log(LF + '1 — o companheiro a arrancar ANTES da linha');
{
    /*
    O LANCE É ESTE, e o passe tem de sair ANTES de ele ficar impedido.

    Ele arranca três ou quatro metros AQUÉM do último defensor, a pedir a
    bola: quando ela sai do pé está onside, e é a correr que passa a linha —
    que é legal, porque o árbitro julga a posição no instante do passe.
    Exigir que ele já estivesse em linha com a defesa era pedir o passe tarde
    de mais: o lote de 30 jogos deu 7 caras-a-cara, e as que davam eram as
    que apanhavam o atacante no meio metro certo.
    */
    const { resultado, mate } = cenario({ mateZ: 27, offsideLimitDir: 30 });
    if (!resultado) {
        erro('um companheiro a 3 m da linha, lançado, devia dar cara a cara');
    } else if (resultado.mate !== mate) {
        erro('devolveu outro jogador que não o companheiro isolado');
    } else if (!(resultado.ponto.z > mate.model.position.z)) {
        erro('o ponto do passe devia ficar à FRENTE dele, na direcção da baliza');
    } else ok('companheiro lançado 3 m antes da linha: cara a cara, com o ponto à frente');
}

console.log(LF + '1b — e ele pede a bola com o braço');
{
    const { resultado, mate } = cenario({ mateZ: 27, offsideLimitDir: 30 });
    if (!resultado) {
        erro('o cenário do pedido tem de encontrar a jogada');
    } else if (!(mate.pedindoBola > 0)) {
        erro('quem está a fazer o movimento tem de levantar o braço a pedir');
    } else ok('o companheiro fica a pedir bola (pedindoBola > 0)');
}

console.log(LF + '1c — parado não é um lançamento');
{
    // Sem arranque não há lance: é um avançado encostado à linha, não alguém
    // a atacar as costas da defesa.
    const { resultado } = cenario({ mateZ: 27, offsideLimitDir: 30, mateVz: 0 });
    if (resultado) {
        erro('um companheiro parado não devia dar cara a cara');
    } else ok('companheiro parado: sem jogada');
}

console.log(LF + '1d — longe de mais da linha não é o lance');
{
    // A 12 m da defesa o passe não isola ninguém: dá tempo à linha de recuar.
    const { resultado } = cenario({ mateZ: 18, offsideLimitDir: 30 });
    if (resultado) {
        erro('um companheiro 12 m atrás da defesa não devia dar cara a cara');
    } else ok('companheiro longe da linha: sem jogada');
}

console.log(LF + '2 — o companheiro já em fora-de-jogo');
{
    // Ele está 4 m além da linha que o passador lê: o passe é para o
    // fora-de-jogo e a jogada não se procura.
    const { resultado } = cenario({ mateZ: 34, offsideLimitDir: 30 });
    if (resultado) {
        erro('um companheiro além da linha não devia dar cara a cara');
    } else ok('companheiro em fora-de-jogo: sem jogada');
}

console.log(LF + '3 — o companheiro muito atrás da defesa');
{
    // Atrás do último defensor não há isolamento nenhum — é um passe normal.
    const { resultado } = cenario({ mateZ: 12, offsideLimitDir: 30 });
    if (resultado) {
        erro('um companheiro atrás da defesa não devia dar cara a cara');
    } else ok('companheiro atrás da defesa: sem jogada');
}

console.log(LF + '4 — defensor no corredor até à baliza');
{
    // Com um defensor entre o ponto e a baliza, ninguém fica isolado com o
    // guarda-redes: é o filtro do corredor a fazer o seu trabalho.
    const { resultado } = cenario({
        mateZ: 30, offsideLimitDir: 30, defesaExtra: { x: 0, z: 42 }
    });
    if (resultado) {
        erro('com um defensor no corredor até à baliza não há cara a cara');
    } else ok('defensor no corredor: sem jogada');
}

if (falhas) { console.log(LF + falhas + ' problema(s).'); process.exit(1); }
console.log(LF + 'Cara a cara: todos os cenários passaram.');
