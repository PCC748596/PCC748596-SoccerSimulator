/*
Faltas e cartões — as regras do árbitro.

Spec em docs/superpowers/specs/2026-08-25-faltas-e-cartoes-design.md.

Testa-se o que é função pura, que é onde as regras vivem: a gravidade de uma
falta, a decisão de cartão, e onde a falta é dentro da área. Nada aqui precisa
de cena, de bola ou de um jogo a correr.

O que NÃO se testa aqui são as médias por jogo (27,63 faltas, 5,22 cartões):
isso é a peça 5 da decomposição, corre o `Sim` sobre jogos de 90 minutos e
mede o resultado da calibração, não as regras.
*/
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

/*
O officials.js precisa das constantes do campo (config.js) mas não do Match a
correr: as funções que aqui se testam são puras de propósito.
*/
const amb = { THREE, console, window: {} };
/*
O `Match` é injectado por `instalarMatch`: o officials.js fala com ele, mas as
regras que aqui se testam não precisam de um jogo a sério — precisam de listas
de jogadores. O `reporExpulsos` é extraído do match.js e corrido com `.call()`
sobre o Match de mentira, para se testar a mesma função que o jogo usa e não
uma cópia que podia divergir dela sem ninguém dar por isso.
*/
const REGEX_REPOR = new RegExp(
    'reporExpulsos: function \\(\\) \\{[\\s\\S]*?' + LF + '    \\},');
const corpoRepor = ['js/match/match_state.js', 'js/match/match_setup.js', 'js/match/match_physics.js', 'js/match/match_setpieces.js', 'js/match/match_loop.js', 'js/match/match_ui.js'].map(ler).join('\n').match(REGEX_REPOR)[0]
    .replace('reporExpulsos: function () {', 'function reporExpulsosExtraido() {')
    .replace(/,$/, '');

const mod = new Function(...Object.keys(amb),
    `${ler('js/config/physics.js')}\n${ler('js/config/defense.js')}
     let Match = null;
     ${ler('js/officials.js')}
     ${corpoRepor}
     return { Officials, RefereeModel, CAMPO_COMP, AREA_GRANDE_PROF, SlideTackleModel,
              instalarMatch: (m) => { Match = m; },
              MatchReporExpulsos: reporExpulsosExtraido };`)(...Object.values(amb));
const { Officials, RefereeModel, CAMPO_COMP, AREA_GRANDE_PROF } = mod;

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

const F = RefereeModel.faltas;

/*
1 — A GRAVIDADE.

Soma quatro parcelas: tipo, velocidade do contacto, ângulo e se travou um
ataque. O que se exige é que cada parcela mova o resultado no sentido certo, e
que os extremos fiquem do lado certo dos limiares.
*/
console.log(String.fromCharCode(10) + '1 — a gravidade da falta');
{
    const g = o => Officials.gravidadeDaFalta(o);

    /*
    As velocidades são as do jogo, não números redondos: o carrinho desliza a
    `SlideTackleModel.velocidade` (9 m/s), e o pior caso é um lançado com
    balanço, que se toma como 1.3× isso. Foi por usar aqui um 7 inventado que
    a primeira calibração passou no teste e falhou no jogo.
    */
    const vCarrinho = mod.SlideTackleModel.velocidade;
    const vPior = vCarrinho * 1.3;

    const leve = g({ tipo: 'desarme', velocidade: 0, angulo: 0, travouAtaque: false });
    const tipico = g({ tipo: 'carrinho', velocidade: vCarrinho, angulo: Math.PI, travouAtaque: false });
    const grave = g({ tipo: 'carrinho', velocidade: vPior, angulo: Math.PI, forca: 95 });
    console.log(`  desarme de frente parado: ${leve.toFixed(2)}`);
    console.log(`  carrinho por trás a ${vCarrinho} m/s, sem travar ataque: ${tipico.toFixed(2)}`);
    console.log(`  carrinho por trás a ${vPior.toFixed(1)} m/s a travar ataque: ${grave.toFixed(2)}`);

    /*
    O CARRINHO POR TRÁS É O CASO COMUM, não o excepcional: o fsm.js garante
    que um carrinho por trás nunca rouba a bola, logo falha sempre, logo dá
    falta sempre. Se ele sozinho chegasse a amarelo, quase toda a falta de
    carrinho daria cartão — foi exactamente isso que pôs os amarelos em ~34
    por jogo na primeira calibração.
    */
    if (tipico >= F.limiarAmarelo) {
        erro(`um carrinho por trás banal dá ${tipico.toFixed(2)}, já em amarelo ` +
            `(limiar ${F.limiarAmarelo}) — e esse é o caso COMUM, não o excepcional`);
    } else ok('um carrinho por trás, por si só, não dá cartão');

    if (!(grave > leve)) erro('o carrinho por trás devia ser mais grave que o desarme parado');
    else ok('carrinho por trás em velocidade é mais grave que desarme de frente parado');

    // Cada parcela, isolada, tem de subir a gravidade.
    const base = { tipo: 'desarme', velocidade: 2, angulo: 0.2, travouAtaque: false };
    const parcelas = [
        ['tipo carrinho', { tipo: 'carrinho' }],
        ['velocidade', { velocidade: 8 }],
        ['ângulo por trás', { angulo: Math.PI }]
    ];
    for (const [nome, delta] of parcelas) {
        const antes = g(base);
        const depois = g(Object.assign({}, base, delta));
        if (!(depois > antes)) {
            erro(`a parcela "${nome}" não aumentou a gravidade (${antes.toFixed(2)} -> ${depois.toFixed(2)})`);
        }
    }
    ok('as três parcelas do lance sobem a gravidade, isoladamente');

    /*
    E O TRAVAR O ATAQUE, ESSE, NÃO É GRAVIDADE.

    Travar um ataque promissor é amarelo pela Lei 12 — não porque o lance seja
    violento, mas porque tirou um ataque ao adversário. Somá-lo à gravidade
    misturava as duas coisas: um carrinho por trás a travar um ataque passava
    o limiar do VERMELHO por acumulação, e um empurrão táctico, que é o caso
    típico do amarelo, nunca chegava ao amarelo porque a gravidade dele é
    baixa por natureza. A regra vive agora no `decidirCartao`.
    */
    const semTravar = g({ tipo: 'desarme', velocidade: 2, angulo: 0.2, travouAtaque: false });
    const comTravar = g({ tipo: 'desarme', velocidade: 2, angulo: 0.2, travouAtaque: true });
    if (Math.abs(semTravar - comTravar) > 1e-9) {
        erro('travar um ataque não pode mexer na GRAVIDADE do lance: é uma regra à parte');
    } else ok('travar um ataque não entra na gravidade');

    // Um desarme banal não pode dar cartão, senão os 5,22 por jogo saltam.
    if (leve >= F.limiarAmarelo) {
        erro(`um desarme de frente parado dá ${leve.toFixed(2)}, acima do limiar ` +
            `de amarelo (${F.limiarAmarelo}) — toda a falta daria cartão`);
    } else ok('um desarme banal fica abaixo do limiar de amarelo');

    // E o pior lance possível tem de ser vermelho directo.
    if (grave < F.limiarVermelho) {
        erro(`o pior lance dá ${grave.toFixed(2)}, abaixo do limiar de vermelho ` +
            `(${F.limiarVermelho}) — nunca haveria vermelho directo`);
    } else ok('o pior lance chega a vermelho directo');

    /*
    O JOGADOR conta, não só o lance: marcação alivia, força agrava.

    Isto é o que separa um defensor que entra com o tempo certo de um que
    entra com o corpo: no MESMO lance, o de marcação alta leva mais bola do
    que perna. Sem isto, dois jogadores muito diferentes cometiam faltas
    exactamente iguais.
    */
    const mesmoLance = { tipo: 'carrinho', velocidade: vCarrinho, angulo: Math.PI, travouAtaque: true };
    const medio = g(mesmoLance);
    const bomMarcador = g(Object.assign({}, mesmoLance, { marcacao: 95 }));
    const forte = g(Object.assign({}, mesmoLance, { forca: 95 }));
    console.log(`  mesmo lance — médio ${medio.toFixed(2)}, ` +
        `marcação 95 ${bomMarcador.toFixed(2)}, força 95 ${forte.toFixed(2)}`);

    if (!(bomMarcador < medio)) {
        erro(`marcação alta devia BAIXAR a gravidade (${medio.toFixed(2)} -> ${bomMarcador.toFixed(2)})`);
    } else ok('marcação alta baixa a gravidade da mesma falta');

    if (!(forte > medio)) {
        erro(`força alta devia SUBIR a gravidade (${medio.toFixed(2)} -> ${forte.toFixed(2)})`);
    } else ok('força alta sobe a gravidade da mesma falta');

    // A skill média (50) não pode mexer em nada, senão as contas do
    // cabeçalho do officials.js deixavam de bater certo.
    const explicito = g(Object.assign({}, mesmoLance, { marcacao: 50, forca: 50 }));
    if (Math.abs(explicito - medio) > 1e-9) {
        erro('skills a 50 deviam dar exactamente o mesmo que omiti-las');
    } else ok('skills médias (50) não mexem no resultado');

    // Nem o melhor defensor do mundo comete uma falta de gravidade negativa.
    const santo = g({ tipo: 'contacto', velocidade: 0, angulo: 0, marcacao: 100, forca: 0 });
    if (santo < 0) erro(`gravidade negativa (${santo.toFixed(2)})`);
    else ok('a gravidade nunca é negativa');

    /*
    O defensor não escapa ao castigo só por ser bom marcador.

    Com o travar-o-ataque fora da gravidade, a `pesoMarcacao` chega para pôr
    um carrinho lançado de um marcador de 95 (0.76) abaixo de um carrinho
    banal de um jogador médio (0.83) — e isso é o modelo a funcionar, não um
    defeito: o bom marcador leva mais bola do que perna. O que não pode
    acontecer é a skill absolvê-lo quando o lance TRAVA um ataque.
    */
    const brutoBomMarcador = g({
        tipo: 'carrinho', velocidade: vPior, angulo: Math.PI,
        marcacao: 95, forca: 50
    });
    const carrinhoFrente = g({ tipo: 'carrinho', velocidade: vCarrinho, angulo: 0 });
    if (!(brutoBomMarcador > carrinhoFrente)) {
        erro(`um carrinho lançado por trás de um bom marcador (${brutoBomMarcador.toFixed(2)}) ` +
            `não devia ficar abaixo de um carrinho de frente (${carrinhoFrente.toFixed(2)})`);
    } else ok('a marcação alivia, mas o lance lançado por trás continua o mais grave');
    if (Officials.decidirCartao(brutoBomMarcador, { temAmarelo: false }, true) !== 'amarelo') {
        erro('um carrinho brutal que trava um ataque tem de dar amarelo, por melhor que o marcador seja');
    } else ok('a skill não absolve o lance que trava um ataque');

    // E o vermelho DIRECTO tem de ser raro: o carrinho por trás à velocidade
    // normal do gesto não lá chega, nem quando trava um ataque — esse é
    // amarelo, e é o `decidirCartao` que o dá.
    const carrinhoNormal = g({ tipo: 'carrinho', velocidade: vCarrinho, angulo: Math.PI });
    if (carrinhoNormal >= F.limiarVermelho) {
        erro(`carrinho por trás banal dá ${carrinhoNormal.toFixed(2)}: vermelho directo num lance corriqueiro`);
    } else ok('carrinho por trás banal não é vermelho directo');
    if (Officials.decidirCartao(carrinhoNormal, { temAmarelo: false }, true) !== 'amarelo') {
        erro('carrinho por trás a travar um ataque devia ser amarelo');
    } else ok('carrinho por trás a travar ataque: amarelo, e não vermelho');
}

/*
2 — O CARTÃO.
*/
console.log(String.fromCharCode(10) + '2 — a decisão de cartão');
{
    const limpo = () => ({ temAmarelo: false, expulso: false });

    let j = limpo();
    if (Officials.decidirCartao(F.limiarAmarelo - 0.01, j) !== null) {
        erro('abaixo do limiar não devia dar cartão');
    } else ok('abaixo do limiar, sem cartão');

    j = limpo();
    if (Officials.decidirCartao(F.limiarAmarelo + 0.01, j) !== 'amarelo') {
        erro('acima do limiar devia dar amarelo');
    } else ok('acima do limiar, amarelo');

    j = limpo();
    if (Officials.decidirCartao(F.limiarVermelho + 0.01, j) !== 'vermelho') {
        erro('gravidade extrema devia dar vermelho directo');
    } else ok('gravidade extrema, vermelho directo');

    // O segundo amarelo. É daqui que sai quase todo o 0,08 de vermelhos.
    j = { temAmarelo: true, expulso: false };
    if (Officials.decidirCartao(F.limiarAmarelo + 0.01, j) !== 'vermelho') {
        erro('segundo amarelo do mesmo jogador devia dar vermelho');
    } else ok('segundo amarelo dá vermelho');

    // Mas uma falta LEVE de quem já tem amarelo não o expulsa.
    j = { temAmarelo: true, expulso: false };
    if (Officials.decidirCartao(F.limiarAmarelo - 0.01, j) !== null) {
        erro('falta leve de quem tem amarelo não devia dar nada');
    } else ok('falta leve de quem já tem amarelo não dá cartão');

    /*
    A LEI 12: TRAVAR UM ATAQUE PROMISSOR É AMARELO, por leve que seja o lance.

    É esta a fonte que faltava. A gravidade cobre a violência (o carrinho, a
    velocidade, as costas) e nunca chega ao amarelo num empurrão — que é
    precisamente o cartão mais comum num jogo a sério. Medido num lote de 30
    jogos: 1.42 amarelos por jogo contra os 5.22 do alvo, com 68% das faltas a
    serem contactos cujo tecto de gravidade (0.74) fica abaixo do limiar.
    */
    j = limpo();
    if (Officials.decidirCartao(0.20, j, true) !== 'amarelo') {
        erro('travar um ataque promissor devia ser amarelo, mesmo num lance leve');
    } else ok('falta leve que trava um ataque: amarelo');

    j = limpo();
    if (Officials.decidirCartao(0.20, j, false) !== null) {
        erro('a mesma falta leve, sem travar ataque, não devia dar nada');
    } else ok('a mesma falta leve sem travar ataque: nada');

    // Travar um ataque é AMARELO, nunca vermelho directo: quem já está
    // advertido é que sai, e sai pelo segundo amarelo.
    j = { temAmarelo: true, expulso: false };
    if (Officials.decidirCartao(0.20, j, true) !== 'vermelho') {
        erro('segundo amarelo por travar ataque devia dar vermelho');
    } else ok('travar um ataque com amarelo em cima: segundo amarelo');
}

/*
3 — O MEDO DO ADVERTIDO.

Sem isto o segundo amarelo dá ~46% de jogos com expulsão (problema do
aniversário: 5,22 cartões por 22 jogadores), quando o número real é 8%. Quem
tem amarelo deixa de fazer carrinhos — e é isso, e não uma constante inventada,
que põe os vermelhos no sítio.
*/
console.log(String.fromCharCode(10) + '3 — o medo do advertido');
{
    if (Officials.podeFazerCarrinho({ temAmarelo: false })) {
        ok('sem cartão, o carrinho é permitido');
    } else erro('um jogador sem cartão devia poder fazer carrinho');

    if (!Officials.podeFazerCarrinho({ temAmarelo: true })) {
        ok('com amarelo, o carrinho fica proibido');
    } else erro('um jogador advertido não devia fazer carrinho');
}

/*
4 — PENÁLTI OU LIVRE.

A falta é penálti quando é cometida pela equipa que DEFENDE aquela área, dentro
dela. A mesma posição, com o infractor da outra equipa, é livre.
*/
console.log(String.fromCharCode(10) + '4 — penálti ou livre');
{
    const zArea = CAMPO_COMP / 2 - AREA_GRANDE_PROF / 2;   // bem dentro da área
    const zMeio = 0;

    // O TeamA defende a baliza de z negativo (ver a detecção de golo em
    // match.js), portanto uma falta do TeamA no seu próprio z negativo é penálti.
    if (!Officials.ehPenalti(0, -zArea, 'TeamA')) {
        erro('falta do TeamA dentro da sua própria área devia ser penálti');
    } else ok('falta do defensor dentro da sua área: penálti');

    if (Officials.ehPenalti(0, zArea, 'TeamA')) {
        erro('falta do TeamA na área ADVERSÁRIA não é penálti');
    } else ok('falta na área adversária: livre');

    if (Officials.ehPenalti(0, zMeio, 'TeamA')) {
        erro('falta no meio-campo não é penálti');
    } else ok('falta no meio-campo: livre');

    // Fora da largura da área, à mesma profundidade, já não é penálti.
    if (Officials.ehPenalti(CAMPO_LARGURA_FORA(), -zArea, 'TeamA')) {
        erro('falta fora da largura da área não é penálti');
    } else ok('falta ao lado da área, à mesma profundidade: livre');

    function CAMPO_LARGURA_FORA() { return 33; }   // encostado à linha lateral
}

/*
5 — A EXPULSÃO E OS ÍNDICES.

Esta é a parte que morde. `Officials.expulsar` tira o jogador da lista da
equipa, e há código que indexa `Match.players[idx]` por POSIÇÃO NA LISTA — a
cobertura de estilos do js/simulate.js é o caso. Com uma equipa reduzida a
dez, os índices deslocam-se e a calibração passa a atribuir o estilo ao
jogador errado, sem se queixar.

Monta-se aqui um Match de mentira, com o mínimo que o `expulsar` e o
`reporExpulsos` tocam.
*/
console.log(String.fromCharCode(10) + '5 — a expulsão e os índices');
{
    const fazJogador = (team, pos) => ({
        team: team, pos: pos, expulso: false, temAmarelo: false, hasBall: false,
        model: { position: { x: 0, y: 0, z: 0 }, visible: true }
    });

    const players = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'CF', 'CF']
        .map(pos => fazJogador('TeamA', pos));
    const opponents = players.map(p => fazJogador('TeamB', p.pos));

    const MatchFalso = {
        state: 'PLAY',
        players: players,
        opponents: opponents,
        expulsos: [],
        ballCarrier: null,
        reporExpulsos: mod.MatchReporExpulsos
    };
    mod.instalarMatch(MatchFalso);

    const vitima = players[6];       // um CM qualquer
    const infractor = opponents[1];  // o LB adversário, índice 1
    const antes = opponents.map(p => p.pos).join(',');

    Officials.expulsar(infractor);

    if (opponents.length !== 10) {
        erro(`depois da expulsão a equipa tem ${opponents.length} jogadores, esperado 10`);
    } else ok('o expulso sai da lista: 10 em campo');

    if (!infractor.expulso || infractor.model.visible) {
        erro('o expulso devia ficar marcado e invisível');
    } else ok('o expulso fica marcado e sai do ecrã');

    if (MatchFalso.expulsos.length !== 1) {
        erro('o expulso devia ir para Match.expulsos');
    } else ok('o expulso vai para Match.expulsos');

    // A reposição tem de o devolver ao MESMO índice.
    MatchFalso.reporExpulsos.call(MatchFalso);
    const depois = opponents.map(p => p.pos).join(',');

    if (opponents.length !== 11) {
        erro(`depois da reposição a equipa tem ${opponents.length}, esperado 11`);
    } else ok('a reposição devolve os 11');

    if (depois !== antes) {
        erro('a ORDEM da lista mudou depois de expulsar e repor:' +
            String.fromCharCode(10) + `      antes:  ${antes}` +
            String.fromCharCode(10) + `      depois: ${depois}` +
            String.fromCharCode(10) + '      a cobertura de estilos indexa por posição e passaria a errar o jogador');
    } else ok('a ordem da lista sobrevive a expulsar e repor (os índices não escorregam)');

    if (opponents[1] !== infractor) {
        erro('o expulso não voltou ao índice que tinha');
    } else ok('o expulso volta ao índice que tinha');

    if (infractor.temAmarelo || infractor.expulso) {
        erro('a reposição devia limpar o cartão e a expulsão');
    } else ok('a reposição limpa o cartão e a expulsão');
}

console.log('');
if (falhas) {
    console.error(`FALHOU: ${falhas} problema(s).`);
    process.exit(1);
}
console.log('OK: as regras de falta, cartão e penálti estão no sítio.');
