/*
O PASSE ESTÁ FORTE DEMAIS — e a razão é um multiplicador por cima da física.

A CALIBRAÇÃO do passe rasteiro é feita pela velocidade de CHEGADA e não pela de
saída: pede-se "quero que chegue a `vChegadaRasteira` m/s" e o
`velocidadeRasteiraPara` (utils.js) inverte o arrasto e o rolamento para dar a
velocidade de saída. É a chegada que decide se o receptor domina a bola —
`BallControl.easySpeed`.

O QUE ESTAVA A ACONTECER: depois de toda essa conta, o `executePassGameplay`
fazia isto, para todos os passes, lançamentos e cruzamentos:

    forcaPasse *= 1.20;
    Match.ballVel.y /= 1.20;

Ou seja, a única manípula do ritmo — a velocidade de chegada — deixava de
descrever o que sai. A bola chega ~20% mais rápida do que aquilo para que o
domínio está calibrado, e passa por cima de quem a devia receber. E o `/1.20`
na vertical encurta o voo dos passes altos, que foram resolvidos para uma
elevação que já não é a que sai.

O TESTE fixa a invariante: sair pela conta e chegar à velocidade pedida.

Corre com: node tests/forca_do_passe.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcConfig = ler('js/config.js');
const srcUtils = ler('js/utils.js');
const srcFsm = ler('js/fsm.js');

function extrairObjecto(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    if (i < 0) throw new Error(`${nome} não encontrado`);
    const f = src.indexOf(LF + '};', i);
    // Constantes de que os modelos dependem; só as usadas por estes objectos.
    return new Function(`const GaitModel = { correr: { vel: 8.0 } };
        const ALTURA_CABECA = 1.62; const ALTURA_BASE_Y = 0;
        const CAMPO_COMP = 106; const CAMPO_LARG = 68;
        ${src.slice(i, f + 3)}; return ${nome};`)();
}

const BallPhysics = extrairObjecto(srcConfig, 'BallPhysics');
/*
`area` e `kArrasto` são escritos DEPOIS da literal do objecto (config.js), a
partir do raio, da massa e do Cd — o extrairObjecto não os apanha. Repete-se
aqui a mesma conta, a partir dos mesmos campos.
*/
BallPhysics.area = Math.PI * BallPhysics.raio * BallPhysics.raio;
BallPhysics.kArrasto = 0.5 * BallPhysics.densidadeAr * BallPhysics.cd *
    BallPhysics.area / BallPhysics.massa;
const PassModel = extrairObjecto(srcConfig, 'PassModel');
const BallControl = extrairObjecto(srcConfig, 'BallControl');

const i = srcUtils.indexOf('function velocidadeRasteiraPara(');
const velocidadeRasteiraPara = new Function('BallPhysics',
    srcUtils.slice(i, srcUtils.indexOf(LF + '}', i) + 2) + '; return velocidadeRasteiraPara;'
)(BallPhysics);

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/*
Integra o rolamento de uma bola rasteira: a = k·v² + μ·g, contra o movimento.
Devolve a velocidade ao fim de `dist` metros.
*/
function velocidadeAoChegar(v0, dist) {
    const k = BallPhysics.kArrasto;
    const atrito = BallPhysics.atritoRolamento * BallPhysics.gravidade;
    let v = v0, x = 0;
    const passo = 0.001;
    while (x < dist && v > 0.01) {
        v -= (k * v * v + atrito) * passo;
        x += v * passo;
    }
    return Math.max(0, v);
}

/* =====================================================================
   1 — NÃO HÁ MULTIPLICADOR POR CIMA DA BALÍSTICA
   ===================================================================== */
console.log(LF + '1 — a força sai da conta, e mais nada lhe toca depois');
{
    const j = srcFsm.indexOf('function executePassGameplay(');
    /*
    Sem comentários: o bloco que explica porque o multiplicador saiu cita-o
    literalmente, e um teste que não distingue código de comentário falharia
    para sempre com a correcção feita.
    */
    const corpo = srcFsm.slice(j, srcFsm.indexOf(LF + '}' + LF, j))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(LF).map(l => l.replace(/\/\/.*$/, '')).join(LF);

    if (/forcaPasse\s*\*=\s*1\.2/.test(corpo)) {
        erro('o multiplicador global de 1.20 continua lá — a velocidade de ' +
            'chegada deixa de descrever o que sai');
    } else ok('sem multiplicador global na força');

    if (/ballVel\.y\s*\/=\s*1\.2/.test(corpo)) {
        erro('a vertical continua dividida por 1.20 — o passe alto sai com uma ' +
            'elevação diferente daquela para que foi resolvido');
    } else ok('sem divisão global na vertical');
}

/* =====================================================================
   2 — A INVARIANTE: CHEGA À VELOCIDADE PEDIDA
   ===================================================================== */
console.log(LF + '2 — o passe rasteiro chega ao pé como manda o PassModel');
{
    /*
    O `vAlvo` não é o `vChegada` cru — o passe curto chega mais vivo e o longo
    mais manso (ver velocidadeRasteiraPara). Aqui repete-se essa correcção para
    saber o que ESPERAR, e o que se testa é a física entre saída e chegada.
    */
    const alvoPara = (dist) => {
        const v = PassModel.vChegadaRasteira;
        if (dist < 12.0) return v + (12.0 - dist) * 0.18;
        if (dist > 15.0) return Math.max(1.5, v - (dist - 15.0) * 0.15);
        return v;
    };

    for (const dist of [5, 10, 14, 20]) {
        const v0 = velocidadeRasteiraPara(dist, PassModel.vChegadaRasteira);
        const chegada = velocidadeAoChegar(v0, dist);
        const esperado = alvoPara(dist);

        if (Math.abs(chegada - esperado) > 0.35) {
            erro(`passe de ${dist} m: sai a ${v0.toFixed(1)} e chega a ` +
                `${chegada.toFixed(1)} m/s, devia chegar a ${esperado.toFixed(1)}`);
        } else {
            ok(`${dist} m: sai a ${v0.toFixed(1)}, chega a ${chegada.toFixed(1)} m/s`);
        }
    }
}

/* =====================================================================
   3 — E CHEGA DOMINÁVEL
   ===================================================================== */
console.log(LF + '3 — a chegada fica abaixo do limiar de domínio');
{
    /*
    É esta a consequência prática de a bola vir 20% mais forte: o receptor
    deixa de dominar ao primeiro toque. O `easySpeed` já tinha sido empurrado
    para 9.69 por causa disto; com a força a sair da conta, a folga volta.
    */
    for (const dist of [3, 5, 10, 20]) {
        const v0 = velocidadeRasteiraPara(dist, PassModel.vChegadaRasteira);
        const chegada = velocidadeAoChegar(v0, dist);
        if (chegada > BallControl.easySpeed) {
            erro(`passe de ${dist} m chega a ${chegada.toFixed(1)} m/s, acima do ` +
                `easySpeed (${BallControl.easySpeed}) — não se domina ao primeiro toque`);
        } else {
            ok(`${dist} m: chega a ${chegada.toFixed(1)}, abaixo do easySpeed`);
        }
    }
}

/* =====================================================================
   4 — O RITMO CONTINUA A TER UMA MANÍPULA
   ===================================================================== */
console.log(LF + '4 — quem manda no ritmo é o vChegadaRasteira');
{
    const dist = 12;
    const lento = velocidadeRasteiraPara(dist, 4.0);
    const rapido = velocidadeRasteiraPara(dist, 9.0);

    if (!(rapido > lento)) {
        erro('a velocidade de chegada deixou de mandar na de saída');
    } else ok(`a 12 m: chegada 4.0 -> sai ${lento.toFixed(1)}; ` +
        `chegada 9.0 -> sai ${rapido.toFixed(1)}`);

    // E o tecto continua a existir: um passe rasteiro não vira disparo.
    const absurdo = velocidadeRasteiraPara(60, 20.0);
    if (absurdo > 18.5) erro(`o tecto de 18.5 m/s foi furado: ${absurdo.toFixed(1)}`);
    else ok(`tecto do rasteiro: ${absurdo.toFixed(1)} m/s`);
}

/* =====================================================================
   5 — O LANÇAMENTO CHEGA AO SÍTIO
   ===================================================================== */
console.log(LF + '5 — o passe no espaço chega onde foi apontado');
{
    /*
    O 1.20 global tinha um par: uma redução de 15% nos lançamentos longos ou
    laterais, logo a seguir. As duas juntas dão 1.20 x 0.85 = 1.02, ou seja
    NADA — o 0.85 existia só para cancelar o 1.20 nesse caminho.

    Tirar o 1.20 e deixar o 0.85 deixava os lançamentos 15% fracos, e um passe
    no espaço 15% fraco não chega a lado nenhum: medido, um lançamento de 25 m
    morria aos 20. Era isso que se via como "só os passes directos estão
    certos".

    Este teste mede o ALCANCE de verdade: integra o rolamento até a bola parar.
    */
    const j = srcFsm.indexOf('function executePassGameplay(');
    const corpo = srcFsm.slice(j, srcFsm.indexOf(LF + '}' + LF, j))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(LF).map(l => l.replace(/\/\/.*$/, '')).join(LF);

    if (/forcaPasse\s*\*=\s*0\.85/.test(corpo)) {
        erro('a redução de 15% do lançamento continua lá, agora sem o 1.20 ' +
            'que ela cancelava — os lançamentos ficam curtos');
    } else ok('sem a redução de 15% no lançamento');

    /*
    O cruzamento tinha o mesmo par: 1.20 x 0.80 = 0.96. Sozinho, o 0.80 põe a
    bola 20% fraca e ela cai antes da área — e o cruzamento alto é resolvido
    para chegar à altura da CABEÇA no ponto do alvo, conta que qualquer
    multiplicador posterior desfaz.
    */
    if (/forcaPasse\s*\*=\s*0\.8/.test(corpo)) {
        erro('a redução de 20% do cruzamento continua lá, sem o 1.20 que ela cancelava');
    } else ok('sem a redução de 20% no cruzamento');

    // Quanto anda uma bola rasteira lançada a v0, até parar.
    const alcanceDe = (v0) => {
        const k = BallPhysics.kArrasto;
        const atrito = BallPhysics.atritoRolamento * BallPhysics.gravidade;
        let v = v0, x = 0;
        while (v > 0.05) { v -= (k * v * v + atrito) * 0.001; x += v * 0.001; }
        return x;
    };

    for (const dist of [12, 20, 25]) {
        const v0 = velocidadeRasteiraPara(dist, PassModel.vChegadaLancamento);
        const alcance = alcanceDe(v0);
        if (alcance < dist - 0.5) {
            erro(`lançamento de ${dist} m morre aos ${alcance.toFixed(1)} m`);
        } else ok(`${dist} m: a bola chega aos ${alcance.toFixed(1)} m`);
    }
}

/* =====================================================================
   6 — O LANÇAMENTO NÃO PODE PASSAR MUITO DO ALVO
   ===================================================================== */
console.log(LF + '6 — o passe no espaço morre perto do ponto, não muito depois');
{
    /*
    Um lançamento é apontado a um PONTO que já está à frente de quem corre.
    Se, por cima disso, a bola ainda passa metros para lá do ponto, o
    companheiro nunca a apanha — e some-se a isso o erro de peso, que é
    aleatório e existe de propósito.

    O desvio sistemático vinha de duas coisas somadas:

      - `vChegadaLancamento` a 3.5 m/s: a bola CHEGA viva ao ponto, portanto
        continua a rolar depois dele;
      - o reforço do passe curto do `velocidadeRasteiraPara` (`+ (12 - dist) *
        0.18`), que existe para uma bola de 3 m aos PÉS não sair a passo. Num
        lançamento não faz sentido nenhum: o alvo já é o espaço à frente.

    Medido antes: um lançamento de 6 m parava 2.7 m depois do ponto.
    */
    const alcanceDe = (v0) => {
        const k = BallPhysics.kArrasto;
        const atrito = BallPhysics.atritoRolamento * BallPhysics.gravidade;
        let v = v0, x = 0;
        while (v > 0.05) { v -= (k * v * v + atrito) * 0.001; x += v * 0.001; }
        return x;
    };

    for (const dist of [6, 10, 15, 20]) {
        const v0 = velocidadeRasteiraPara(dist, PassModel.vChegadaLancamento,
            { reforcoCurto: false });
        const passou = alcanceDe(v0) - dist;

        if (passou > 1.0) {
            erro(`lançamento de ${dist} m passa ${passou.toFixed(1)} m do alvo`);
        } else if (passou < 0) {
            erro(`lançamento de ${dist} m fica ${(-passou).toFixed(1)} m curto — ` +
                'a bola morre antes de quem corre para ela');
        } else ok(`${dist} m: passa ${passou.toFixed(1)} m do alvo`);
    }

    // O reforço do curto continua a existir para quem o precisa: o passe AOS
    // PÉS. Tirá-lo de todo lado punha as bolas de 3 m a sair a passo.
    const comReforco = velocidadeRasteiraPara(5, PassModel.vChegadaRasteira);
    const semReforco = velocidadeRasteiraPara(5, PassModel.vChegadaRasteira,
        { reforcoCurto: false });
    if (!(comReforco > semReforco)) {
        erro('o reforço do passe curto desapareceu para toda a gente');
    } else ok(`passe curto aos pés continua reforçado (${comReforco.toFixed(1)} vs ` +
        `${semReforco.toFixed(1)} m/s)`);
}

console.log(LF + (falhas ? `FALHOU: ${falhas}` : 'OK'));
process.exit(falhas ? 1 : 0);
