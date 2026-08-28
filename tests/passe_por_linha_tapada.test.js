/*
QUEM RECEBE O PASSE ESCOLHIA-SE SEM OLHAR PARA A LINHA.

O QUE SE MEDIU (lote de 20 jogos): passes cortados por faixa de distância —
13% aos 0-8 m, 30% aos 8-15 m, 40% aos 15-25 m, **53% acima dos 25 m**. As
velocidades de chegada estavam todas abaixo do `BallControl.easySpeed`, e o
domínio falhado nunca passava dos 13%: o passe não estava forte demais nem mal
apontado — estava a ser jogado PARA DENTRO DE ALGUÉM.

A CAUSA. Há duas camadas a escolher o receptor, e só uma olha para a linha:

  - `findPassTarget` (player.js) mede o corredor de ameaça (`PassLineModel`),
    rejeita quem tem alguém em cima da recta (`bloqueioDuro`) e pesa a
    qualidade da linha no resto;
  - `PassTypes.escolher` (pass_types.js) é quem DECIDE de facto, e a nota dele
    tem três termos — progresso, espaço, distância. **Nenhum é a linha.** O
    alvo que a primeira camada propôs entra aqui apenas como sugestão, e vale
    um `bonusSugerido` de 0,5.

Medido no cenário deste teste, antes do fix: um companheiro 30 m à frente com
um adversário EXACTAMENTE em cima da linha de passe (folga 0,00 m) e com o
leque de candidatos completamente vazio — ou seja, com o próprio sistema a
dizer que ali não há passe nenhum — ganhava com nota 0,767 ao companheiro a
12 m com 14,8 m de folga e o bónus de sugerido (0,539).

O leque vazio ainda piorava as coisas: sem pontos, o `pontoPara` cai no
`pontoLiderancaCurta`, que valida o raio à volta do ponto mas NÃO a linha até
lá. O veredicto "não há passe" transformava-se num ponto de mira 4 m à frente
do companheiro tapado, com o progresso máximo que a nota premeia.

O FIX: a nota do receptor passa a ter um quarto termo, a folga da linha até ao
PONTO DE MIRA — a mesma geometria do `findPassTarget` (`PassLineModel`:
corredor que cresce com a distância, `bloqueioDuro` como piso, e o
`factorUltimoTerco` a perdoar o risco perto da baliza), para as duas camadas
não julgarem a mesma linha por réguas diferentes.

Corre com: node tests/passe_por_linha_tapada.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcConfig = ler('js/config/passing.js');
const srcUtils = ler('js/utils.js');
const srcCand = ler('js/pass_candidates.js');
const srcTypes = ler('js/pass_types.js');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

function extrair(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    if (i < 0) throw new Error(`${nome} não encontrado`);
    const f = src.indexOf(LF + '};', i);
    return src.slice(i, f + 3);
}

function extrairFuncao(src, nome) {
    const i = src.indexOf(`function ${nome}(`);
    if (i < 0) throw new Error(`${nome}() não encontrada`);
    const f = src.indexOf(LF + '}', i);
    return src.slice(i, f + 2);
}

const CAMPO_LARG = 68, CAMPO_COMP = 105;
const PassTypeModel = new Function(`${extrair(srcConfig, 'PassTypeModel')}; return PassTypeModel;`)();
const PassLineModel = new Function(`${extrair(srcConfig, 'PassLineModel')}; return PassLineModel;`)();
const PassModel = { margemSegurancaLinha: 2.5 };
const folgaDaLinha = new Function(`${extrairFuncao(srcUtils, 'folgaDaLinha')}; return folgaDaLinha;`)();

/*
O Match é dado por fora e trocado entre cenários; o Proxy deixa os dois módulos
lerem sempre o cenário actual sem os voltar a construir.
*/
let Match = { players: [], opponents: [] };
const matchProxy = new Proxy({}, { get: (t, k) => Match[k] });

const PassCandidates = new Function(
    'Match', 'CAMPO_LARG', 'CAMPO_COMP', 'PassModel', 'TeamAI',
    `const _vFwd = null; ${extrair(srcCand, 'PassCandidates')}; return PassCandidates;`
)(matchProxy, CAMPO_LARG, CAMPO_COMP, PassModel, undefined);

const PassTypes = new Function(
    'Match', 'CAMPO_LARG', 'CAMPO_COMP', 'PassModel', 'PassTypeModel',
    'PassLineModel', 'PassCandidates', 'folgaDaLinha',
    `${extrair(srcTypes, 'PassTypes')}; return PassTypes;`
)(matchProxy, CAMPO_LARG, CAMPO_COMP, PassModel, PassTypeModel,
    PassLineModel, PassCandidates, folgaDaLinha);

const jog = (nome, x, z, o) => Object.assign({
    nome, id: nome, team: 'TeamA', role: 'mid', pos: 'CM', dirZ: 1,
    targetGoalZ: CAMPO_COMP / 2,
    model: { position: { x: x, z: z } },
    velocity: { x: 0, z: 0 },
    speedMult: 6.0
}, o || {});

const adv = (nome, x, z) => jog(nome, x, z, { team: 'TeamB', dirZ: -1 });

// Os três tipos de passe, para nenhum caso depender do sorteio.
const SORTEIOS = [['direct', 0.01], ['space', 0.5], ['leading', 0.99]];

/* =====================================================================
   1 — LINHA TAPADA PERDE PARA LINHA LIMPA
   ===================================================================== */
console.log(LF + '1 — a linha apertada perde para a linha limpa (é o PESO a decidir)');
{
    const portador = jog('portador', 0, -20);
    const seguro = jog('seguro', 12, -18);   // 12 m, linha limpa
    const tapado = jog('tapado', 0, 10);     // 30 m à frente, linha apertada
    /*
    O muro fica AO LADO da recta e não em cima: a folga sobrevive ao corte duro
    do `bloqueioDuro` (caso 3) e o que decide é o peso da linha. Sem o peso, o
    progresso de 30 m ganhava sozinho.
    */
    const muro = adv('muro', 1.4, -5);
    const outro = adv('outro', 6, 4);

    Match = { players: [portador, seguro, tapado], opponents: [muro, outro] };

    // A premissa do teste: apertada, mas jogável — senão isto testava o corte.
    const f = folgaDaLinha(0, -20, 0, 10, [muro, outro].map(o => o.model.position));
    if (f <= PassLineModel.bloqueioDuro) {
        erro(`cenário inválido: folga de ${f.toFixed(2)} m para o tapado, abaixo ` +
            `do bloqueioDuro de ${PassLineModel.bloqueioDuro} m — isto é o caso 3`);
    } else {
        ok(`folga de ${f.toFixed(2)} m até ao tapado — apertada, mas passa`);
    }

    for (const [nome, rnd] of SORTEIOS) {
        const esc = PassTypes.escolher(portador, seguro, rnd);
        if (!esc) { erro(`sorteio ${nome}: escolher devolveu null`); continue; }
        if (esc.mate === tapado) {
            erro(`sorteio ${nome}: escolheu o tapado (nota ${esc.nota.toFixed(3)}) ` +
                `em vez do seguro`);
        } else {
            ok(`sorteio ${nome}: escolheu o seguro (nota ${esc.nota.toFixed(3)})`);
        }
    }
}

/* =====================================================================
   2 — LINHA LIMPA NÃO É PENALIZADA: GANHA QUEM PROGRIDE
   ===================================================================== */
console.log(LF + '2 — com as duas linhas limpas, ganha quem adianta mais a bola');
{
    const portador = jog('portador', 0, -20);
    const perto = jog('perto', 10, -18);
    const longe = jog('longe', -10, 2);
    // Adversários longe de qualquer uma das duas rectas.
    const a1 = adv('a1', 25, -10);
    const a2 = adv('a2', -26, -12);

    Match = { players: [portador, perto, longe], opponents: [a1, a2] };

    for (const [nome, rnd] of SORTEIOS) {
        // Sem sugerido: é a nota sozinha a decidir.
        const esc = PassTypes.escolher(portador, null, rnd);
        if (!esc) { erro(`sorteio ${nome}: escolher devolveu null`); continue; }
        if (esc.mate !== longe) {
            erro(`sorteio ${nome}: escolheu o ${esc.mate.nome} — com as duas ` +
                `linhas livres tinha de ganhar quem progride`);
        } else {
            ok(`sorteio ${nome}: escolheu o longe (nota ${esc.nota.toFixed(3)})`);
        }
    }
}

/* =====================================================================
   3 — A LINHA TAPADA BAIXA A NOTA, E NÃO SÓ A ORDEM
   ===================================================================== */
console.log(LF + '3 — alguém em cima da recta é corte DURO, não uma nota baixa');
{
    /*
    Uma nota baixa continua a competir, e ganha por não haver melhor: era assim
    que a bola ia parar ao adversário quando não havia mais ninguém livre. O
    `findPassTarget` já descarta estes com `continue` (bloqueioDuro), e o
    `escolher` tem de descartar pela mesma régua — senão o corte duro de uma
    camada é um peso na outra, e quem decide é a que não corta.

    Sem candidato nenhum, o `escolher` devolve null: o `actPass` desce a
    cascata (atrasar a alguém perto, conduzir), que é a jogada certa quando não
    há linha nenhuma.
    */
    const mkCenario = (zMuro) => {
        const portador = jog('portador', 0, -20);
        const unico = jog('unico', 0, 0);
        // zMuro null = sem ninguém na linha (só um adversário bem ao lado).
        const opps = (zMuro === null) ? [adv('longe', 30, -10)] : [adv('muro', 0, zMuro)];
        Match = { players: [portador, unico], opponents: opps };
        return portador;
    };

    // Mesmo sorteio nos dois, para a única diferença ser a linha.
    const limpo = PassTypes.escolher(mkCenario(null), null, 0.01);
    const fechado = PassTypes.escolher(mkCenario(-10), null, 0.01);

    if (!limpo) {
        erro('escolher devolveu null com a linha limpa — cortou a mais');
    } else {
        ok(`linha limpa: escolhe o único companheiro (nota ${limpo.nota.toFixed(3)})`);
    }

    if (fechado) {
        erro(`com o adversário em cima da recta, escolher devolveu ` +
            `${fechado.mate.nome} com nota ${fechado.nota.toFixed(3)} — ` +
            `tinha de devolver null`);
    } else {
        ok('adversário em cima da recta: escolher devolve null e o actPass ' +
            'desce a cascata');
    }
}

/* =====================================================================
   4 — PERTO DA BALIZA O RISCO VALE A PENA
   ===================================================================== */
console.log(LF + '4 — no último terço a linha apertada é perdoada (factorUltimoTerco)');
{
    /*
    A mesma linha apertada, jogada duas vezes: uma no meio-campo e outra à
    entrada da área. O `findPassTarget` já perdoa o risco no último terço, e as
    duas camadas têm de concordar — senão uma abre a bola para dentro da área e
    a outra fecha-a.
    */
    const notaCom = (zPortador, zMate, zMuro) => {
        const portador = jog('portador', 0, zPortador);
        const mate = jog('mate', 0, zMate);
        const muro = adv('muro', 1.6, zMuro);   // ao lado da recta, não em cima
        Match = { players: [portador, mate], opponents: [muro] };
        const esc = PassTypes.escolher(portador, null, 0.01);
        return esc ? esc.nota : null;
    };

    // Geometria idêntica nos dois, deslocada 30 m para a frente.
    const meioCampo = notaCom(-15, 0, -7.5);
    const areaAdv = notaCom(15, 30, 22.5);

    if (meioCampo === null || areaAdv === null) {
        erro('escolher devolveu null num dos dois cenários');
    } else {
        /*
        A nota do último terço traz o progresso todo lá dentro, por isso não se
        comparam as notas cruas: compara-se quanto é que a MESMA linha apertada
        custou em cada sítio. `1.0` seria a linha completamente limpa.
        */
        const E = PassTypeModel.escolha;
        const pesoLinha = E.pesosSemPressao.linha;
        if (typeof pesoLinha !== 'number') {
            erro('não há peso `linha` em PassTypeModel.escolha.pesosSemPressao');
        } else {
            // Progresso é 15 m nos dois (mate 15 m à frente do portador).
            const base = (15 / E.progressoRef) * E.pesosSemPressao.progresso
                - (15 / E.distanciaMax) * E.pesosSemPressao.distancia;
            const custoMeio = pesoLinha - (meioCampo - base);
            const custoArea = pesoLinha - (areaAdv - base);
            if (custoArea >= custoMeio - 1e-9) {
                erro(`a linha apertada custou ${custoArea.toFixed(3)} na área e ` +
                    `${custoMeio.toFixed(3)} no meio-campo — o último terço não ` +
                    `está a ser perdoado`);
            } else {
                ok(`a mesma linha custa ${custoMeio.toFixed(3)} no meio-campo e só ` +
                    `${custoArea.toFixed(3)} à entrada da área`);
            }
        }
    }
}

/* =====================================================================
   5 — O LIMIAR ACOMPANHOU A ESCALA
   ===================================================================== */
console.log(LF + '5 — ter linha limpa não é, sozinho, razão para passar');
{
    /*
    O termo da linha mudou a escala das notas: um passe de linha limpa ganha
    `pesosSemPressao.linha` de graça. Com o `notaMinima` antigo (0.35) isso
    bastava para qualquer passe valer a pena, e a cascata do `actPass`
    (atrasar a alguém perto, conduzir) deixava de disparar.

    O limiar tem de subir exactamente o peso da linha, para que numa linha
    COMPLETAMENTE limpa a exigência seja a de sempre.
    */
    const E = PassTypeModel.escolha;
    const pesoLinha = E.pesosSemPressao.linha;

    if (E.notaMinima < pesoLinha) {
        erro(`notaMinima (${E.notaMinima}) abaixo do peso da linha (${pesoLinha}): ` +
            `um passe sem progresso nenhum passa só por ter a linha livre`);
    } else {
        ok(`notaMinima ${E.notaMinima} >= peso da linha ${pesoLinha}`);
    }

    // Passe puramente lateral, linha limpa: não adianta a bola, não vale a pena.
    const portador = jog('portador', 0, -20);
    const lado = jog('lado', 12, -20);
    Match = { players: [portador, lado], opponents: [adv('longe', -28, 10)] };

    const esc = PassTypes.escolher(portador, null, 0.01);
    if (!esc) {
        erro('escolher devolveu null — a linha estava limpa, tinha de haver candidato');
    } else if (esc.nota >= E.notaMinima) {
        erro(`o passe lateral sem progresso ficou com nota ${esc.nota.toFixed(3)}, ` +
            `acima do notaMinima de ${E.notaMinima}`);
    } else {
        ok(`passe lateral sem progresso: nota ${esc.nota.toFixed(3)} < ` +
            `notaMinima ${E.notaMinima}, desce a cascata`);
    }

    // E um passe que progride mesmo, com linha limpa, continua a passar.
    const frente = jog('frente', 2, 0);
    Match = { players: [portador, frente], opponents: [adv('longe', -28, 10)] };
    const bom = PassTypes.escolher(portador, null, 0.01);
    if (!bom || bom.nota < E.notaMinima) {
        erro(`o passe bom de 20 m com linha limpa ficou em ` +
            `${bom ? bom.nota.toFixed(3) : 'null'} — abaixo do notaMinima, o ` +
            `limiar subiu demais`);
    } else {
        ok(`passe de 20 m com linha limpa: nota ${bom.nota.toFixed(3)} >= ` +
            `notaMinima ${E.notaMinima}`);
    }
}

console.log(LF + (falhas ? `FALHAS: ${falhas}` : 'TUDO OK'));
process.exit(falhas ? 1 : 0);
