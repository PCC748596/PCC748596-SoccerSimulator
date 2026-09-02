/*
FORA-DE-JOGO (Lei 11) — os dois tempos da regra.

O que este teste fixa:

1. A posição congela NO PASSE e a infracção conta-se NO TOQUE: estar em
   posição de impedimento não é falta nenhuma até haver envolvimento.
2. Quem está em linha com a bola, ou com o penúltimo adversário, está ONSIDE —
   é para isso que existe a tolerância.
3. Na própria metade não há impedimento, aconteça o que acontecer.
4. Nem em bola parada: o lance parado apaga as marcas.
5. O guarda-redes CONTA para a linha (ela é o segundo adversário mais recuado,
   não "o último defesa de campo").

Corre com: node tests/impedimento.test.js
*/
const fs = require('fs');
const path = require('path');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { console.log('  X ' + m); falhas++; };

// --- Ambiente mínimo: só o que o fora-de-jogo do Officials toca ------------
const CAMPO_COMP = 106;
const BallPhysics = { raio: 0.11 };
const OffsideModel = { activo: true, tolerancia: 0.35 };

const jogador = (team, dirZ, x, z, pos) => ({
    team, dirZ, pos: pos || 'CF', model: { position: { x, z } }
});

let setups, anuncios;
const Match = {
    state: 'PLAY',
    ball: { position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } },
    ballVel: { set() {} },
    players: [], opponents: [],
    ballCarrier: null, intendedReceiver: null, faltaIndirecta: false,
    setupSetPiece(tipo, team) { setups.push({ tipo, team }); }
};
const MatchStats = {
    TeamA: { impedimentos: 0 }, TeamB: { impedimentos: 0 },
    registarImpedimento(t) { this[t].impedimentos++; }
};

// Carrega o Officials do ficheiro real, com este ambiente por dependências.
const src = ler('js/officials.js');
const Officials = (new Function(
    'CAMPO_COMP', 'BallPhysics', 'OffsideModel', 'Match', 'MatchStats',
    src + '\nreturn Officials;'
))(CAMPO_COMP, BallPhysics, OffsideModel, Match, MatchStats);
Officials.anunciar = (t) => anuncios.push(t);

const reset = () => {
    setups = []; anuncios = [];
    Officials.limparImpedimento();
    Match.state = 'PLAY';
    Match.faltaIndirecta = false;
};

/*
Cenário base: TeamA ataca +Z. Defesa do TeamB com o guarda-redes em z=50 e os
centrais em 32 e 30 — a linha do fora-de-jogo é 32, o segundo mais recuado.
*/
const montar = (zAtacante, zBola) => {
    const passador = jogador('TeamA', 1, 0, zBola, 'CM');
    const atacante = jogador('TeamA', 1, 5, zAtacante, 'CF');
    Match.players = [passador, atacante];
    /*
    DEFESA COMPLETA, e não três jogadores: com só um GK e dois centrais, o
    "segundo mais recuado" e o "segundo mais adiantado" são o mesmo jogador, e
    um erro de sinal no cálculo da linha passa despercebido. Foi o que
    aconteceu — em jogo davam 97 impedimentos por partida.

    Aqui a defesa do TeamB (que defende +Z) tem o GK em 50, os centrais em 30 e
    32, e médios em 12 e 5. A linha é 32: o segundo mais próximo da baliza
    dele, atrás do guarda-redes.
    */
    Match.opponents = [
        jogador('TeamB', -1, 0, 50, 'GK'),
        jogador('TeamB', -1, 2, 32, 'CB'),
        jogador('TeamB', -1, -8, 30, 'CB'),
        jogador('TeamB', -1, 10, 12, 'CM'),
        jogador('TeamB', -1, -4, 5, 'CM')
    ];
    Match.opponents[0].role = 'gk';
    Match.ball.position.x = 0;
    Match.ball.position.z = zBola;
    return { passador, atacante };
};

console.log('1 — a linha é o penúltimo adversário, e o guarda-redes conta');
{
    reset();
    montar(35, 10);
    // O dirZ é o de quem DEFENDE (-1 para o TeamB), não o de quem ataca.
    const linha = Officials.linhaDeImpedimento(Match.opponents, -1);
    if (Math.abs(linha - 32) > 0.01) erro('linha devia ser 32, é ' + linha);
    else ok('linha em z=32 (o último defesa, com o GK atrás dele)');
}

console.log('');
console.log('2 — em posição, mas só é infracção quando TOCA');
{
    reset();
    const c = montar(35, 10);           // 35 está à frente de 32 e de 10
    Officials.marcarPosicoesDeImpedimento(c.passador);
    if (setups.length) erro('marcou logo no passe — a posição não é infracção');
    else ok('o passe sozinho não marca nada');

    const marcou = Officials.verificarImpedimento(c.atacante);
    if (!marcou) erro('tocou na bola em posição de impedimento e não foi marcado');
    else ok('ao tocar, é marcado');

    if (!setups.length || setups[0].tipo !== 'FREE_KICK' || setups[0].team !== 'TeamB') {
        erro('devia montar livre para a equipa que defende');
    } else ok('livre para o TeamB');

    if (!Match.faltaIndirecta) erro('o livre de fora-de-jogo é INDIRECTO');
    else ok('marcado como indirecto (o setupSetPiece consome a bandeira)');

    if (anuncios[0] !== 'OFFSIDE') erro('o árbitro devia anunciar OFFSIDE, anunciou ' + anuncios[0]);
    else ok('anuncia OFFSIDE');

    if (MatchStats.TeamA.impedimentos !== 1) erro('não contou o impedimento');
    else ok('conta na ficha do TeamA');

    if (Math.abs(Match.ball.position.z - 35) > 0.01) {
        erro('o livre é onde ele estava (z=35), ficou em ' + Match.ball.position.z);
    } else ok('a bola vai para onde ele estava no instante do passe');
}

console.log('');
console.log('3 — quem toca é OUTRO: a jogada segue');
{
    reset();
    const c = montar(35, 10);
    Officials.marcarPosicoesDeImpedimento(c.passador);
    if (Officials.verificarImpedimento(Match.players[0])) erro('marcou a quem não estava em posição');
    else ok('o colega que estava onside toca e nada acontece');
}

console.log('');
console.log('4 — em linha com o penúltimo adversário é ONSIDE');
{
    reset();
    const c = montar(32, 10);
    Officials.marcarPosicoesDeImpedimento(c.passador);
    if (Officials.verificarImpedimento(c.atacante)) erro('em linha com a defesa não é impedimento');
    else ok('em linha com o último defesa: onside');
}

console.log('');
console.log('5 — à frente da defesa mas ATRÁS da bola é ONSIDE');
{
    reset();
    const c = montar(35, 40);
    Officials.marcarPosicoesDeImpedimento(c.passador);
    if (Officials.verificarImpedimento(c.atacante)) erro('atrás da bola não é impedimento');
    else ok('atrás da bola: onside');
}

console.log('');
console.log('6 — na própria metade não há impedimento');
{
    reset();
    const c = montar(-5, -20);
    Officials.marcarPosicoesDeImpedimento(c.passador);
    if (Officials.verificarImpedimento(c.atacante)) erro('na própria metade não há regra');
    else ok('própria metade: onside');
}

console.log('');
console.log('7 — a bola parada apaga as marcas');
{
    reset();
    const c = montar(35, 10);
    Officials.marcarPosicoesDeImpedimento(c.passador);
    Officials.limparImpedimento();               // é o que o setupSetPiece faz
    if (Officials.verificarImpedimento(c.atacante)) erro('as marcas deviam morrer no lance parado');
    else ok('canto/lateral/pontapé de baliza limpam as marcas');

    reset();
    Match.state = 'CORNER_KICK';
    const d = montar(35, 10);
    Officials.marcarPosicoesDeImpedimento(d.passador);
    if (Officials.verificarImpedimento(d.atacante)) erro('não se marca posição fora do jogo corrido');
    else ok('fora do estado PLAY nem se chega a marcar posição');
}

console.log('');
console.log(falhas ? 'FALHOU: ' + falhas : 'OK: fora-de-jogo com os dois tempos da Lei 11.');
process.exit(falhas ? 1 : 0);
