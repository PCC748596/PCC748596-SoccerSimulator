/*
O PASSE NO VAZIO TEM DE SER ALCANÇÁVEL.

O QUE SE VIA: "é o passe no vazio, tá longo demais". A bola sai para um ponto
onde nunca ninguém chega, e a jogada morre ali.

A CAUSA. O leque do `PassCandidates` põe sete arcos de 3 m à frente de cada
companheiro — até 21 m — e valida cada ponto contra o campo, os adversários e a
linha de passe. **Nenhum desses filtros pergunta se o companheiro CHEGA LÁ.**
Depois o `space` (pontoMediano) e sobretudo o `leading` (pontoMaisPertoDoGolo,
que escolhe de propósito o ponto mais adiantado que sobreviveu) vão buscar os
arcos de fora.

Quanto mais limpo estiver o campo à frente do companheiro, mais longe vai o
ponto — ou seja, o passe fica pior justamente quando a defesa está organizada e
não há ninguém lá à frente para invalidar os pontos.

O LIMITE QUE FALTAVA é físico e não uma opinião: o companheiro só apanha o
ponto se lá chegar no tempo de voo da bola. Alcance = velocidade dele × tempo de
voo, e o tempo de voo estima-se com a mesma velocidade média de bola que o
`initiatePass` já usa para o lead.

Corre com: node tests/passe_no_vazio_alcancavel.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcCand = ler('js/pass_candidates.js');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/*
Monta o PassCandidates a sério, com o Match e o TeamAI dados por fora. O THREE
só é usado por um Vector3 de reaproveitamento que estas funções não tocam.
*/
function montar(cenario) {
    const i = srcCand.indexOf('const PassCandidates = {');
    const f = srcCand.indexOf(LF + '};', i);
    const corpo = srcCand.slice(i, f + 3);
    return new Function('Match', 'CAMPO_LARG', 'CAMPO_COMP', 'PassModel', 'TeamAI',
        `const _vFwd = null; ${corpo}; return PassCandidates;`
    )(cenario, 106, 106, { margemSegurancaLinha: 2.5 }, undefined);
}

const jog = (nome, x, z, opts) => Object.assign({
    nome, team: 'TeamA', role: 'mid', dirZ: 1,
    id: nome,
    model: { position: { x: x, z: z } },
    velocity: { x: 0, z: 0 },
    speedMult: 6.0
}, opts || {});

/* =====================================================================
   1 — O PONTO MAIS LONGE DEIXA DE SOBREVIVER
   ===================================================================== */
console.log(LF + '1 — sem ninguém por perto, o leque já não vai aos 21 m');
{
    // Campo limpo: nenhum adversário invalida nada. É o caso em que o defeito
    // aparecia — nada corta os arcos de fora.
    const portador = jog('portador', 0, -10);
    const mate = jog('colega', 0, 0);
    const PC = montar({ players: [portador, mate], opponents: [] });

    const pontos = PC.gerarCandidatos(portador).filter(c => c.mate === mate);
    if (!pontos.length) {
        erro('o leque ficou vazio — o limite apanhou pontos a mais');
    } else {
        const maxRaio = Math.max(...pontos.map(p =>
            Math.hypot(p.x - mate.model.position.x, p.z - mate.model.position.z)));

        /*
        Bola a 10 m do companheiro: ~0,9 s de voo a 11 m/s. A 6 m/s ele cobre
        uns 5 m nesse tempo, portanto nada para lá dos primeiros arcos pode
        sobreviver. O número exacto é do modelo; aqui fixa-se a ordem de
        grandeza, que é o que se estava a perder.
        */
        if (maxRaio > 9.0) {
            erro(`o ponto mais afastado ficou a ${maxRaio.toFixed(1)} m do companheiro`);
        } else ok(`ponto mais afastado a ${maxRaio.toFixed(1)} m (era até 21 m)`);

        // E não pode ficar só o arco de dentro: um passe no vazio tem de poder
        // sair mesmo. Trocar "longe de mais" por "nunca" era outro defeito.
        if (maxRaio < 3.0) erro('sobrou menos do que o primeiro arco: já não há passe no vazio');
        else ok('o passe no vazio continua a existir');
    }
}

/* =====================================================================
   2 — QUEM CORRE ALCANÇA MAIS
   ===================================================================== */
console.log(LF + '2 — o alcance é do companheiro, não uma constante');
{
    const portador = jog('portador', 0, -10);

    const parado = jog('parado', 0, 0, { speedMult: 3.0 });
    const veloz = jog('veloz', 0, 0, { speedMult: 9.0 });

    const alcanceDe = (mate) => {
        const PC = montar({ players: [portador, mate], opponents: [] });
        const pontos = PC.gerarCandidatos(portador).filter(c => c.mate === mate);
        if (!pontos.length) return 0;
        return Math.max(...pontos.map(p =>
            Math.hypot(p.x - mate.model.position.x, p.z - mate.model.position.z)));
    };

    const aLento = alcanceDe(parado);
    const aVeloz = alcanceDe(veloz);

    if (!(aVeloz > aLento)) {
        erro(`o rápido devia alcançar mais: lento ${aLento.toFixed(1)} m, ` +
            `rápido ${aVeloz.toFixed(1)} m`);
    } else ok(`lento ${aLento.toFixed(1)} m < rápido ${aVeloz.toFixed(1)} m`);
}

/* =====================================================================
   3 — O QUE NÃO PODIA MUDAR
   ===================================================================== */
console.log(LF + '3 — os filtros antigos continuam lá');
{
    const portador = jog('portador', 0, -10);
    const mate = jog('colega', 0, 0);

    // Adversário em cima do companheiro: os pontos à volta dele caem, como
    // sempre caíram (raioAdversario).
    const advEmCima = { role: 'def', model: { position: { x: 0, z: 3 } } };
    const PC = montar({ players: [portador, mate], opponents: [advEmCima] });
    const pontos = PC.gerarCandidatos(portador).filter(c => c.mate === mate);

    const colado = pontos.some(p => Math.hypot(p.x - 0, p.z - 3) < PC.raioAdversario);
    if (colado) erro('sobrou um ponto em cima do adversário');
    else ok('o filtro do adversário continua a cortar');

    // Fora do campo continua fora.
    const foraDoCampo = pontos.some(p => Math.abs(p.x) > 53 || Math.abs(p.z) > 53);
    if (foraDoCampo) erro('sobrou um ponto fora do campo');
    else ok('os limites do campo continuam a valer');
}

console.log(LF + (falhas ? `FALHOU: ${falhas}` : 'OK'));
process.exit(falhas ? 1 : 0);
