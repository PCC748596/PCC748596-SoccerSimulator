/*
NÃO SE CORRE PARA TRÁS CONTRA UM ALVO QUE VEM TER CONNOSCO.

O QUE SE VIA: um jogador sai da posição para participar na jogada e fica mais
adiantado do que o seu posto. A jogada progride, o posto dele avança — mas
ainda não passou por cima dele. Ele vira-se para trás para o ir buscar, a
inércia leva-o longe de mais, e quando o passe sai o apoio que devia lá estar
vem a meio caminho, no sentido errado.

DUAS CAUSAS, e a segunda só existe por causa da primeira:

1. Ninguém lhe diz que o alvo vem a caminho. O `tickFinal` escreve um ponto e o
   `steerArrive` persegue-o, sem olhar se esse ponto se está a APROXIMAR. Um
   jogador real não recua contra um posto que avança na direcção dele: espera
   e deixa-o chegar.

2. O `velocity.lerp(desired, 5*dt)` em player.js é um filtro de 0,2 s, igual em
   todas as direcções. Inverter o sentido custa quase meio segundo, e nesse
   meio segundo ele percorre 2-3 m no sentido errado. Este teste não trata
   disso — trata de nunca chegar a haver a inversão.

A REGRA: se o posto se aproxima e está perto, fica-se. Se ele se afasta, ou se
está longe de mais para esperar, vai-se buscá-lo como sempre.

Corre com: node tests/esperar_pelo_slot.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcConfig = ler('js/config/player_behavior.js');
const srcUtils = ler('js/utils.js');
const srcTeam = ler('js/bt/team_bt.js');

function extrairObjecto(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    if (i < 0) throw new Error(`${nome} não encontrado`);
    const f = src.indexOf(LF + '};', i);
    return new Function(`${src.slice(i, f + 3)}; return ${nome};`)();
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

const E = extrairObjecto(srcConfig, 'EsperaPeloSlotModel');

const i = srcUtils.indexOf('function esperarPeloSlot(');
if (i < 0) throw new Error('esperarPeloSlot não encontrada');
const esperarPeloSlot = new Function(
    `const EsperaPeloSlotModel = ${JSON.stringify(E)};` +
    srcUtils.slice(i, srcUtils.indexOf(LF + '}', i) + 2) + '; return esperarPeloSlot;'
)();

/*
Cenário base: jogador em (0,0). O posto está 4 m à frente dele (z positivo) e
vem a caminho a 3 m/s — ou seja, aproxima-se.
*/
const base = (extra) => Object.assign({
    px: 0, pz: 0,
    slotX: 0, slotZ: 4,
    slotAnteriorX: 0, slotAnteriorZ: 4.05,   // andou 0.05 m na direcção dele
    dt: 0.016
}, extra);

/* =====================================================================
   1 — O POSTO VEM A CAMINHO: ESPERA
   ===================================================================== */
console.log(LF + '1 — posto a aproximar-se e perto: fica-se');
{
    if (!esperarPeloSlot(base())) {
        erro('foi buscar um posto que vinha ter com ele — é o vaivém');
    } else ok('posto a 4 m e a aproximar-se: espera');

    // Já em cima dele não há nada para esperar nem para andar.
    if (esperarPeloSlot(base({ slotZ: 0.2, slotAnteriorZ: 0.25 }))) {
        ok('praticamente em cima: espera na mesma (não há corrida nenhuma a fazer)');
    } else ok('praticamente em cima: indiferente');
}

/* =====================================================================
   2 — O POSTO FOGE: VAI-SE BUSCAR
   ===================================================================== */
console.log(LF + '2 — posto a afastar-se: corre-se atrás dele');
{
    const aFugir = base({ slotAnteriorZ: 3.95 });   // andou 0.05 m para longe
    if (esperarPeloSlot(aFugir)) {
        erro('ficou parado com o posto a fugir — deixa de acompanhar a jogada');
    } else ok('posto a afastar-se: vai-se buscá-lo');

    // Parado é o mesmo que a afastar-se: não há nada a chegar.
    const quieto = base({ slotAnteriorZ: 4.0 });
    if (esperarPeloSlot(quieto)) erro('esperou por um posto que está parado');
    else ok('posto parado: vai-se buscá-lo');
}

/* =====================================================================
   3 — LONGE DE MAIS PARA ESPERAR
   ===================================================================== */
console.log(LF + '3 — o posto vem, mas está longe: não se espera por ele');
{
    const longe = base({ slotZ: E.distanciaMax + 3, slotAnteriorZ: E.distanciaMax + 3.05 });
    if (esperarPeloSlot(longe)) {
        erro(`esperou por um posto a ${(E.distanciaMax + 3).toFixed(1)} m — ` +
            'ficava fora da jogada à espera');
    } else ok(`além dos ${E.distanciaMax} m: vai-se ao encontro dele`);

    // A fronteira é inclusiva do lado de esperar.
    const naLinha = base({ slotZ: E.distanciaMax, slotAnteriorZ: E.distanciaMax + 0.05 });
    if (!esperarPeloSlot(naLinha)) erro(`exactamente a ${E.distanciaMax} m devia esperar`);
    else ok(`a fronteira (${E.distanciaMax} m) espera`);
}

/* =====================================================================
   4 — APROXIMAÇÃO LENTA DE MAIS NÃO CONTA
   ===================================================================== */
console.log(LF + '4 — um posto que mal se mexe não é um posto que vem');
{
    /*
    Sem este piso, o ruído do alisamento (PositionSmoothing) bastava para
    parecer aproximação e o jogador ficava colado ao chão a jogada inteira.
    */
    const quaseParado = base({ slotAnteriorZ: 4.0 + 0.00001 });
    if (esperarPeloSlot(quaseParado)) {
        erro('o ruído do alisamento passou por aproximação');
    } else ok('aproximação abaixo do piso: não conta');
}

/* =====================================================================
   5 — LATERAL TAMBÉM CONTA
   ===================================================================== */
console.log(LF + '5 — a regra não é só no eixo z');
{
    const deLado = {
        px: 0, pz: 0,
        slotX: 4, slotZ: 0,
        slotAnteriorX: 4.05, slotAnteriorZ: 0,
        dt: 0.016
    };
    if (!esperarPeloSlot(deLado)) erro('um posto a chegar pelo lado não foi reconhecido');
    else ok('posto a aproximar-se pelo lado: espera');
}

/* =====================================================================
   6 — E O TICKFINAL USA MESMO ISTO
   ===================================================================== */
console.log(LF + '6 — o posicionamento consulta a regra');
{
    const j = srcTeam.indexOf('tickFinal: function');
    const corpo = srcTeam.slice(j, srcTeam.indexOf(LF + '};', j));

    if (!/esperarPeloSlot/.test(corpo)) {
        erro('o tickFinal não chama o esperarPeloSlot — continua o vaivém');
    } else ok('o tickFinal chama o esperarPeloSlot');

    if (!/slotAnterior/.test(corpo)) {
        erro('ninguém guarda o posto do frame anterior — não há velocidade para ler');
    } else ok('o posto do frame anterior fica guardado');
}

console.log(LF + (falhas ? `FALHOU: ${falhas}` : 'OK'));
process.exit(falhas ? 1 : 0);
