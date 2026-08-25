/*
GIRO DO CORPO NO LANÇAMENTO LATERAL — `giroDoCorpoNoLateral` (js/utils.js).

PORQUE EXISTE. O jogador que repõe estava virado para dentro do campo o gesto
inteiro: o `case LATERAL` da fsm.js chamava `lookAtBola` para o ponto (0, z)
em TODOS os frames. A única coisa que acompanhava o alvo era a cintura, com
tecto em `LateralPose.giroMax` (0.55 rad, ~31°) — e um lançamento para trás
saía com o jogador de lado para onde atirava.

A regra que este teste fixa: a cintura torce até ao tecto, e o CORPO dá só o
que sobra. Dentro do alcance da cintura o corpo não roda nada, e é isso que
garante que os lançamentos curtos para a frente continuam exactamente como
estavam antes desta alteração.

Corre com: node tests/lateral_giro_corpo.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const utils = ler('js/utils.js');

function extrair(src, nome, ficheiro) {
    const ini = src.indexOf('function ' + nome);
    if (ini < 0) throw new Error(nome + ' não encontrada no ' + ficheiro);
    const fim = src.indexOf(LF + '}', ini) + 2;
    return src.slice(ini, fim);
}

const api = new Function(
    extrair(utils, 'giroDoCorpoNoLateral', 'js/utils.js') + LF +
    extrair(utils, 'rodarNoPlano', 'js/utils.js') + LF +
    extrair(utils, 'alcanceMaximoDoLateral', 'js/utils.js') + LF +
    'return { giroDoCorpoNoLateral, rodarNoPlano, alcanceMaximoDoLateral };')();

const { giroDoCorpoNoLateral, rodarNoPlano, alcanceMaximoDoLateral } = api;

// O valor real do jogo, lido do config para o teste não guardar uma cópia que
// possa divergir.
const cfg = ler('js/config.js');
const GIRO_MAX = parseFloat(cfg.match(/giroMax:\s*([\d.]+)/)[1]);
const VEL_GIRO = parseFloat(cfg.match(/velGiroCorpo:\s*([\d.]+)/)[1]);

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);
const grau = r => (r * 180 / Math.PI).toFixed(0) + '°';

console.log('giroMax da cintura: ' + GIRO_MAX + ' rad (' + grau(GIRO_MAX) + ')');

/*
1 — DENTRO DO ALCANCE DA CINTURA O CORPO NÃO RODA.

É a garantia de não-regressão: o lançamento curto para a frente, que já estava
afinado, tem de continuar a sair com o corpo de frente para o campo.
*/
console.log(LF + '1 — dentro do alcance da cintura, o corpo fica quieto');
{
    for (const ang of [0, 0.1, -0.1, 0.3, -0.3, GIRO_MAX, -GIRO_MAX]) {
        const g = giroDoCorpoNoLateral(ang, GIRO_MAX);
        if (g !== 0) {
            erro(`alvo a ${grau(ang)} cabe na cintura, mas o corpo rodou ${grau(g)}`);
        }
    }
    ok('alvos até ' + grau(GIRO_MAX) + ' para os dois lados: corpo parado');
}

/*
2 — FORA DO ALCANCE, O CORPO DÁ EXACTAMENTE O QUE FALTA.

Cintura + corpo tem de somar o ângulo pedido. Se somasse a mais, o jogador
passava do alvo; a menos, continuava a atirar de lado.
*/
console.log(LF + '2 — cintura + corpo somam o ângulo pedido');
{
    const casos = [0.8, 1.2, Math.PI / 2, -0.8, -1.2, -Math.PI / 2];
    for (const ang of casos) {
        const corpo = giroDoCorpoNoLateral(ang, GIRO_MAX);
        const cintura = Math.max(-GIRO_MAX, Math.min(GIRO_MAX, ang));
        const soma = corpo + cintura;
        if (Math.abs(soma - ang) > 1e-9) {
            erro(`alvo a ${grau(ang)}: cintura ${grau(cintura)} + corpo ${grau(corpo)} = ${grau(soma)}`);
        }
    }
    ok('nos seis casos fora do alcance, a soma bate certo');

    // E o corpo roda para o LADO do alvo, nunca para o contrário.
    if (giroDoCorpoNoLateral(1.2, GIRO_MAX) <= 0) erro('alvo à esquerda, corpo rodou para a direita');
    if (giroDoCorpoNoLateral(-1.2, GIRO_MAX) >= 0) erro('alvo à direita, corpo rodou para a esquerda');
    ok('o corpo roda sempre para o lado do alvo');
}

/*
3 — O CASO QUE MOTIVOU ISTO: ATIRAR PARA TRÁS.

Um lançamento para trás (o alvo atrás da linha dos ombros) é onde a cintura
sozinha ficava pior. Com 150°, a cintura dá 31° e o corpo tem de dar o resto.
*/
console.log(LF + '3 — lançamento para trás');
{
    const ang = 150 * Math.PI / 180;
    const corpo = giroDoCorpoNoLateral(ang, GIRO_MAX);
    const restaSemCorpo = ang - GIRO_MAX;

    if (corpo < 1.0) {
        erro(`atirar para trás devia rodar bem o corpo, rodou só ${grau(corpo)}`);
    } else ok(`alvo a ${grau(ang)}: corpo ${grau(corpo)} + cintura ${grau(GIRO_MAX)}`);

    if (Math.abs(corpo - restaSemCorpo) > 1e-9) {
        erro('o corpo não está a dar exactamente o que faltava');
    } else ok(`sem isto ficavam ${grau(restaSemCorpo)} por cobrir — era o desvio visível`);
}

/*
4 — A DIRECÇÃO RESULTANTE APONTA MESMO AO ALVO.

O `rodarNoPlano` é o que a fsm usa para construir o ponto de `lookAt`, a
partir da direcção "para dentro do campo". Aqui verifica-se a convenção de
sinal: rodar a frente pelo ângulo total tem de dar a direcção do alvo — se o
sinal estivesse trocado, o jogador virava-se ao contrário e ninguém dava por
isso a não ser no ecrã.
*/
console.log(LF + '4 — a rotação aponta na direcção certa');
{
    // Jogador na linha lateral direita (x > 0): "para dentro" é (-1, 0).
    const frente = { x: -1, z: 0 };
    for (const ang of [0.4, -0.4, 1.2, -1.2]) {
        const d = rodarNoPlano(frente.x, frente.z, ang);
        // Ângulo com sinal de `frente` para `d`, a mesma conta do
        // prepararGiroLateral (player.js).
        const obtido = Math.atan2(
            frente.z * d.x - frente.x * d.z,
            frente.x * d.x + frente.z * d.z);
        if (Math.abs(obtido - ang) > 1e-9) {
            erro(`rodar por ${grau(ang)} deu ${grau(obtido)} — convenção de sinal trocada`);
        }
    }
    ok('rodarNoPlano segue a mesma convenção de sinal do prepararGiroLateral');
}

/*
5 — O CORPO CHEGA LÁ ANTES DE A BOLA SAIR.

A rotação é gradual (velGiroCorpo rad/s) para não ler como um salto. Mas se
for lenta de mais, a bola sai antes de o corpo acabar de virar — que é o
defeito original outra vez, só que mais discreto. O pior caso é o alvo a 180°.
*/
console.log(LF + '5 — o corpo chega a tempo do contacto');
{
    const ESPERA = 3.5;                    // ESPERA_APOS_REPOSICAO
    // Lidos do config, não copiados: uma cópia aqui deixava o teste a validar
    // um clip que já não é o do jogo.
    const clip = cfg.match(/throwIn:\s*\{\s*duration:\s*([\d.]+),\s*contactTime:\s*([\d.]+)\s*\/\s*([\d.]+)/);
    const DUR_CLIP = parseFloat(clip[1]);
    const CONTACTO = parseFloat(clip[2]) / parseFloat(clip[3]);
    const pior = giroDoCorpoNoLateral(Math.PI, GIRO_MAX);
    const tempoDeGiro = Math.abs(pior) / VEL_GIRO;
    const disponivel = ESPERA + DUR_CLIP * CONTACTO;

    if (tempoDeGiro > disponivel) {
        erro(`pior caso leva ${tempoDeGiro.toFixed(2)}s a virar, só há ${disponivel.toFixed(2)}s até a bola sair`);
    } else {
        ok(`pior caso (${grau(pior)}) leva ${tempoDeGiro.toFixed(2)}s; há ${disponivel.toFixed(2)}s até ao contacto`);
    }
}

/*
6 — O ALCANCE DO LATERAL SAI DA FORÇA.

Era um multiplicador de ±25% sobre 18 m (`alcanceMax * (1 ± forcaBraco)`), o
que dava 22,5 m ao mais forte — e obrigava a fazer a conta para saber qual era
o alcance de quem tem STRENGTH 100. Agora os dois extremos estão escritos no
config, e é isso que este bloco fixa: 100 tem de dar exactamente 20 m.
*/
console.log(LF + '6 — alcance do lateral por STRENGTH');
{
    const FRACO = parseFloat(cfg.match(/alcanceMaxFraco:\s*([\d.]+)/)[1]);
    const FORTE = parseFloat(cfg.match(/alcanceMaxForte:\s*([\d.]+)/)[1]);

    if (FORTE !== 20.0) {
        erro(`STRENGTH 100 devia chegar a 20 m, o config diz ${FORTE}`);
    } else ok('o config põe STRENGTH 100 em 20 m');

    const a100 = alcanceMaximoDoLateral(100, FRACO, FORTE);
    if (Math.abs(a100 - 20) > 1e-9) erro(`STRENGTH 100 deu ${a100.toFixed(2)} m`);
    else ok(`STRENGTH 100: ${a100.toFixed(1)} m`);

    const a0 = alcanceMaximoDoLateral(0, FRACO, FORTE);
    const a50 = alcanceMaximoDoLateral(50, FRACO, FORTE);
    if (Math.abs(a0 - FRACO) > 1e-9) erro(`STRENGTH 0 deu ${a0.toFixed(2)} m, devia dar ${FRACO}`);
    else ok(`STRENGTH 0: ${a0.toFixed(1)} m`);

    if (Math.abs(a50 - (FRACO + FORTE) / 2) > 1e-9) {
        erro(`STRENGTH 50 devia ficar a meio (${((FRACO + FORTE) / 2).toFixed(1)} m), deu ${a50.toFixed(2)}`);
    } else ok(`STRENGTH 50: ${a50.toFixed(1)} m — a meio, como manda uma recta`);

    // Monotonia: mais força nunca pode atirar menos longe.
    let sobeSempre = true;
    for (let s = 1; s <= 100; s++) {
        if (alcanceMaximoDoLateral(s, FRACO, FORTE) < alcanceMaximoDoLateral(s - 1, FRACO, FORTE)) {
            sobeSempre = false;
        }
    }
    if (!sobeSempre) erro('mais força devia atirar sempre mais longe');
    else ok('monótona em toda a escala');

    // Fora da escala corta nos extremos — um skill a 130 não compra alcance.
    if (alcanceMaximoDoLateral(130, FRACO, FORTE) !== FORTE) erro('STRENGTH acima de 100 não devia passar do tecto');
    else if (alcanceMaximoDoLateral(-10, FRACO, FORTE) !== FRACO) erro('STRENGTH negativo devia cair no mínimo');
    else ok('fora da escala corta nos extremos');
}

console.log(LF + (falhas === 0
    ? 'lateral_giro_corpo: tudo bem.'
    : `lateral_giro_corpo: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
