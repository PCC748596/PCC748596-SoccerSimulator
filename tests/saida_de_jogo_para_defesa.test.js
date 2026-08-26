/*
A SAÍDA DE JOGO TEM DE ACABAR NOS DEFESAS.

O QUE SE QUER VER: dado o pontapé de saída, quem recebe a primeira bola toca
para um central/lateral, e só a partir daí o jogo segue normal. É a construção
desde trás, que é o que se quer poder observar.

PORQUE FALHAVA. O ramo `PasseSaidaDeBola` já existia e a maquinaria toda
também (`Match.kickoffPendingPassToDef`, `encontrarDefesaParaSaida`,
`executarPasseSaidaParaDefesas`). O que estava errado era a POSIÇÃO dele na
árvore: vinha depois do `Dominar`, e o `Dominar` executa `actCarry` durante toda
a cadência de decisão (até ~3 s no CadenceModel.posseBase). O receptor domina e
sai a conduzir para a frente; quando o ramo do passe finalmente ganha, já foi
buscar o meio-campo — que é o oposto de sair a jogar de trás.

O próprio comentário do ramo dizia "0." e ele era o quinto.

E O RELÓGIO. A bandeira só se apagava com o toque do adversário ou com uma bola
parada. Se ninguém achasse defesa livre (todos marcados, todos fora do campo),
ela ficava acesa e o passe atrasado saía muito depois, no meio de outra jogada.
Passa a ter prazo.

Corre com: node tests/saida_de_jogo_para_defesa.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcPlayer = ler('js/bt/player_bt.js');
const srcMatch = ler('js/match.js');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/* =====================================================================
   1 — A ORDEM DA ÁRVORE
   ===================================================================== */
console.log(LF + '1 — o passe da saída decide antes de o receptor dominar');
{
    const ini = srcPlayer.indexOf("sel('DecisaoComBola'");
    const fim = srcPlayer.indexOf("seq('SemBola'", ini);
    const bloco = srcPlayer.slice(ini, fim);

    const ordem = [];
    const re = /seq\('([A-Za-z]+)'/g;
    let m;
    while ((m = re.exec(bloco)) !== null) ordem.push(m[1]);

    const iPasse = ordem.indexOf('PasseSaidaDeBola');
    const iDominar = ordem.indexOf('Dominar');
    const iRecuperar = ordem.indexOf('RecuperarControlo');

    if (iPasse < 0) erro('o ramo PasseSaidaDeBola desapareceu da árvore');
    else if (iPasse > iDominar) {
        erro(`PasseSaidaDeBola está em ${iPasse}, depois do Dominar (${iDominar}) — ` +
            'o receptor domina e sai a conduzir antes de tocar para trás');
    } else ok(`PasseSaidaDeBola (${iPasse}) decide antes do Dominar (${iDominar})`);

    /*
    Mas NÃO antes do RecuperarControlo: com a bola fugida do pé não se passa
    nada a ninguém, vai-se buscá-la primeiro. Trocar esta ordem era passar de
    um defeito para outro.
    */
    if (iPasse >= 0 && iPasse < iRecuperar) {
        erro('PasseSaidaDeBola passou à frente do RecuperarControlo — ' +
            'passar-se-ia com a bola longe do pé');
    } else ok(`RecuperarControlo (${iRecuperar}) continua primeiro`);
}

/* =====================================================================
   2 — O ALVO É MESMO UM DEFESA
   ===================================================================== */
console.log(LF + '2 — o alvo é um defesa, e nunca o próprio');
{
    const i = srcPlayer.indexOf('function encontrarDefesaParaSaida');
    const corpo = srcPlayer.slice(i, srcPlayer.indexOf(LF + '}', i));

    if (!/role\s*===\s*'def'/.test(corpo)) erro('deixou de filtrar por role def');
    else ok("filtra por role 'def'");

    if (!/m\s*!==\s*p/.test(corpo)) erro('o próprio jogador pode ser escolhido como alvo');
    else ok('exclui o próprio');
}

/* =====================================================================
   3 — A BANDEIRA TEM PRAZO
   ===================================================================== */
console.log(LF + '3 — a bandeira apaga-se sozinha');
{
    if (!/kickoffPassToDefTimer/.test(srcMatch)) {
        erro('não há relógio nenhum: a bandeira pode ficar acesa a jogada inteira');
    } else ok('há relógio (kickoffPassToDefTimer)');

    // Continua a apagar-se quando o adversário toca: a saída é de quem a deu.
    if (!/kickoffTeam\s*&&\s*best\.team\s*!==\s*this\.kickoffTeam/.test(srcMatch)) {
        erro('deixou de apagar a bandeira quando o adversário toca na bola');
    } else ok('o toque do adversário continua a apagá-la');
}

/* =====================================================================
   4 — O PRAZO CORRE E EXPIRA
   ===================================================================== */
console.log(LF + '4 — o prazo expira e o jogo segue normal');
{
    /*
    Corre o trecho a sério, extraído do match.js, em vez de uma cópia: o que
    interessa é que a contagem só ande com a bandeira acesa e que a apague
    quando chega a zero.
    */
    const i = srcMatch.indexOf('function correrPrazoDaSaida(');
    if (i < 0) {
        erro('correrPrazoDaSaida não existe');
    } else {
        const correr = new Function(
            srcMatch.slice(i, srcMatch.indexOf(LF + '}', i) + 2) + '; return correrPrazoDaSaida;'
        )();

        const M = { kickoffPendingPassToDef: true, kickoffPassToDefTimer: 3.0 };
        for (let n = 0; n < 100; n++) correr(M, 0.016); // 1.6 s
        if (!M.kickoffPendingPassToDef) erro('apagou-se cedo de mais (1,6 s de 3 s)');
        else ok('a 1,6 s ainda está acesa');

        for (let n = 0; n < 100; n++) correr(M, 0.016); // 3.2 s no total
        if (M.kickoffPendingPassToDef) erro('passou o prazo e continua acesa');
        else ok('passado o prazo, apaga-se e o jogo segue normal');

        // Com a bandeira apagada nada acontece — e o relógio não fica negativo
        // a somar frames que ninguém vai ler.
        const antes = M.kickoffPassToDefTimer;
        correr(M, 0.016);
        if (M.kickoffPassToDefTimer !== antes) erro('continua a descontar com a bandeira apagada');
        else ok('apagada: o relógio pára');
    }
}

/* =====================================================================
   5 — O DEFESA ESCOLHIDO É O DESTINO, NÃO UMA SUGESTÃO
   ===================================================================== */
console.log(LF + '5 — o passe sai mesmo para o defesa, e não para a frente');
{
    /*
    O que se via: "tá tocando pra frente e não para o defensor atrás".

    A causa era o `executarPasseSaidaParaDefesas` mandar o defesa ao
    `PassTypes.escolher(p, defTarget)`, onde ele entra como SUGESTÃO — vale um
    `bonusSugerido` de 0.5 e concorre com todos os outros companheiros numa
    nota dominada pelo PROGRESSO para a baliza. Um passe para trás tem
    progresso negativo por definição, portanto perdia quase sempre, e a bola
    saía para a frente com o ramo da saída a dar-se por cumprido.

    O tipo de passe (a balística) continua a vir do PassTypes; o DESTINO é que
    deixou de estar em votação.
    */
    const i = srcPlayer.indexOf('function executarPasseSaidaParaDefesas');
    const fim = srcPlayer.indexOf(LF + '}', i) + 2;
    const preludio = `
        function aplicarMiraDoPasse() {}
        const PassTypes = {
            // Devolve DE PROPÓSITO um companheiro diferente: é exactamente o
            // que o escolher() fazia, e o que não pode voltar a acontecer.
            escolher: (p, sugerido) => ({ mate: { nome: 'avancado' }, tipo: 'direct', ponto: null }),
            paraCompanheiro: (p, mate) => ({ mate: mate, tipo: 'direct', ponto: null })
        };
    `;
    const executar = new Function(
        preludio + srcPlayer.slice(i, fim) + '; return executarPasseSaidaParaDefesas;'
    )();

    const defesa = { nome: 'zagueiro' };
    let destino = null;
    const p = {
        nome: 'medio',
        initiatePass: alvo => { destino = alvo; }
    };
    executar(p, defesa);

    if (destino !== defesa) {
        erro(`o passe saiu para ${destino && destino.nome} em vez do defesa`);
    } else ok('o passe sai para o defesa que o ramo escolheu');
}

/* =====================================================================
   6 — E O TIPO DE PASSE CONTINUA A VIR DO PassTypes
   ===================================================================== */
console.log(LF + '6 — a balística não se perdeu no caminho');
{
    const srcTypes = ler('js/pass_types.js');
    if (!/paraCompanheiro:\s*function/.test(srcTypes)) {
        erro('PassTypes.paraCompanheiro não existe — sem ela o passe da saída ' +
            'ficaria sempre no direct cru');
    } else ok('PassTypes.paraCompanheiro existe');

    const i = srcTypes.indexOf('paraCompanheiro: function');
    const corpo = srcTypes.slice(i, srcTypes.indexOf(LF + '    }', i));
    if (!/pontoPara/.test(corpo)) erro('paraCompanheiro não resolve o ponto de mira');
    else ok('resolve o ponto de mira pela mesma maquinaria do escolher');
    if (/melhorNota|for \(const mate of teammates\)/.test(corpo)) {
        erro('paraCompanheiro voltou a pôr o destino em votação');
    } else ok('não escolhe destino nenhum: recebe-o');
}

/* =====================================================================
   7 — O DEFESA TEM DE ESTAR ATRÁS
   ===================================================================== */
console.log(LF + '7 — entre dois defesas, escolhe-se o que está atrás');
{
    /*
    A pontuação media linha livre, adversário mais perto e distância — nenhum
    termo dizia ATRÁS. Um lateral subido ficava elegível, e o "toque para trás"
    saía para a frente na mesma, agora por escolha do alvo em vez do tipo de
    passe. Quem constrói de trás toca para quem está atrás.
    */
    const i = srcPlayer.indexOf('function encontrarDefesaParaSaida');
    const fim = srcPlayer.indexOf(LF + '}' + LF, i) + 3;
    const preludio = `
        const linhaLivre = () => true;
        let Match = null;
        const definirMatch = m => { Match = m; };
    `;
    const mod = new Function(preludio + srcPlayer.slice(i, fim) +
        '; return { encontrarDefesaParaSaida, definirMatch };')();

    const jog = (nome, role, x, z, dirZ) => ({
        nome, role, dirZ,
        model: { position: { x: x, z: z } }
    });

    // Equipa a atacar +z: "atrás" é z menor. O receptor está em z = 0.
    const receptor = jog('medio', 'mid', 0, 0, 1);
    /*
    Números escolhidos para o teste DECIDIR: o de trás está à distância que a
    pontuação antiga penalizava (35 m, fora da faixa 8–30) e o da frente está
    na melhor faixa possível. Sem uma regra de "atrás" a sério, ganha o da
    frente — que é o defeito.
    */
    const atras = jog('central', 'def', 0, -35, 1);
    const afrente = jog('lateralSubido', 'def', 0, 15, 1);
    receptor.team = 'TeamA';

    mod.definirMatch({
        players: [receptor, atras, afrente],
        opponents: []
    });

    const escolhido = mod.encontrarDefesaParaSaida(receptor);
    if (!escolhido) erro('não escolheu defesa nenhum com dois disponíveis');
    else if (escolhido !== atras) {
        erro(`escolheu o ${escolhido.nome} — o defesa à frente do receptor`);
    } else ok('escolhe o defesa que está atrás');

    // Só com defesas à frente, joga-se na mesma: melhor um lateral subido do
    // que a bandeira a expirar e a saída a não se ver de todo.
    mod.definirMatch({ players: [receptor, afrente], opponents: [] });
    const unico = mod.encontrarDefesaParaSaida(receptor);
    if (unico !== afrente) erro('sem defesas atrás devia jogar no que houver');
    else ok('sem defesas atrás: joga no que houver');
}

console.log(LF + (falhas ? `FALHOU: ${falhas}` : 'OK'));
process.exit(falhas ? 1 : 0);
