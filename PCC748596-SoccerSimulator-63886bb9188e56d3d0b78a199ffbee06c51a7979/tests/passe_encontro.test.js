/*
PASSE DE ENCONTRO — bola e receptor no mesmo ponto, ao mesmo tempo.

O passe aos pés estava certo e o passe no espaço não, e a razão era sempre a
mesma: a força saía SÓ da distância (`velocidadeRasteiraPara`), sem saber
quando é que o companheiro chegava ao ponto. Num lançamento de 15 m à frente
de quem corre, a bola chegava lá mais de um segundo antes dele.

Aqui mede-se a matemática nova (utils.js): o tempo da bola rasteira, a sua
inversão, o tempo do jogador e o `passeDeEncontro` que junta os dois.

As funções são carregadas do ficheiro real, com o BallPhysics e o PassModel
lidos do config.js — não há cópias da conta neste teste.
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'physics.js'), 'utf8')) + '\n' + semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'passing.js'), 'utf8'));
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));

/*
As constantes soltas de que os objectos do config dependem (alturas, medidas
do campo) não vêm no recorte — passam-se como argumentos.
*/
const CONSTANTES = { ALTURA_CABECA: 1.72, CAMPO_COMP: 106, CAMPO_LARG: 68 };

function extrairObjecto(src, nome, ficheiro) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em ${ficheiro}`);
    const fim = src.indexOf(LF + '};', ini);
    const nomes = Object.keys(CONSTANTES);
    return new Function(...nomes,
        `${src.slice(ini, fim + 3)}; return ${nome};`)(...nomes.map(n => CONSTANTES[n]));
}

function extrairFuncao(src, nome) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrada em js/utils.js`);
    // Fecho: a primeira chaveta na coluna 0 depois do início.
    const fim = src.indexOf(LF + '}', ini);
    return src.slice(ini, fim + 2);
}

const BallPhysics = extrairObjecto(srcConfig, 'BallPhysics', 'js/config.js');
/*
`area` e `kArrasto` são escritos DEPOIS do literal (config.js, logo a seguir ao
objecto), portanto não vêm no recorte. Lidos do mesmo sítio, avaliando as duas
linhas contra o objecto já extraído — copiar os números para aqui era arriscar
que divergissem em silêncio.
*/
{
    const ini = srcConfig.indexOf('BallPhysics.area =');
    const fim = srcConfig.indexOf('/ BallPhysics.massa;', ini) + '/ BallPhysics.massa;'.length;
    if (ini < 0 || fim < ini) throw new Error('as derivadas do BallPhysics mudaram de forma');
    new Function('BallPhysics', srcConfig.slice(ini, fim))(BallPhysics);
}
const PassModel = extrairObjecto(srcConfig, 'PassModel', 'js/config.js');

const nomes = ['velocidadeRasteiraPara', 'velocidadeDeChegadaRasteira',
    'velocidadeParaChegarA', 'tempoRasteiroDaBola', 'velocidadeRasteiraEmTempo',
    'tempoDoJogadorAte', 'passeDeEncontro'];
const codigo = nomes.map(n => extrairFuncao(srcUtils, n)).join(LF + LF);
const carregadas = new Function('BallPhysics', 'PassModel',
    `${codigo}; return { ${nomes.join(', ')} };`)(BallPhysics, PassModel);

const { velocidadeRasteiraPara, velocidadeDeChegadaRasteira, velocidadeParaChegarA,
    tempoRasteiroDaBola, velocidadeRasteiraEmTempo, tempoDoJogadorAte,
    passeDeEncontro } = carregadas;

/* ---- a física rasteira, contra integração numérica --------------------- */

/*
Integra `dv/dt = −(k·v² + μg)` em passos pequenos e devolve {tempo, vChegada}
ao fim de `dist`. É a verdade contra a qual a fórmula fechada é medida: se as
duas divergirem, a fórmula está errada (ou a física mudou de forma).
*/
function integrar(dist, v0) {
    const k = BallPhysics.kArrasto;
    const a = BallPhysics.atritoRolamento * BallPhysics.gravidade;
    const dt = 0.0002;
    let v = v0, x = 0, t = 0;
    while (x < dist && v > 0.001 && t < 60) {
        v -= (k * v * v + a) * dt;
        if (v <= 0) return { tempo: null, vChegada: 0, x: x };
        x += v * dt;
        t += dt;
    }
    return { tempo: (x >= dist) ? t : null, vChegada: v, x: x };
}

test('tempo e velocidade de chegada batem com a integração da física', () => {
    for (const [dist, v0] of [[8, 12], [15, 14], [25, 17], [5, 9], [28, 18]]) {
        const ref = integrar(dist, v0);
        const t = tempoRasteiroDaBola(dist, v0);
        const vc = velocidadeDeChegadaRasteira(dist, v0);

        assert.ok(ref.tempo !== null, `caso ${dist}m@${v0} não chega nem na integração`);
        assert.ok(Math.abs(t - ref.tempo) < 0.02,
            `tempo ${dist}m@${v0}: fórmula ${t.toFixed(3)} s vs integração ${ref.tempo.toFixed(3)} s`);
        assert.ok(Math.abs(vc - ref.vChegada) < 0.15,
            `chegada ${dist}m@${v0}: fórmula ${vc.toFixed(2)} vs integração ${ref.vChegada.toFixed(2)}`);
    }
});

test('velocidadeRasteiraEmTempo inverte mesmo o tempo', () => {
    for (const [dist, tempo] of [[10, 1.2], [20, 2.0], [30, 3.0], [6, 0.9]]) {
        const v0 = velocidadeRasteiraEmTempo(dist, tempo);
        const t = tempoRasteiroDaBola(dist, v0);
        assert.ok(t !== null, `${dist}m em ${tempo}s: a bola nem chega`);
        assert.ok(Math.abs(t - tempo) < 0.03,
            `${dist}m: pedido ${tempo}s, obtido ${t.toFixed(3)}s (v0=${v0.toFixed(2)})`);
    }
});

test('tempoDoJogadorAte cobra o arranque a quem está parado', () => {
    const parado = tempoDoJogadorAte(20, 0, 7.0);
    const lancado = tempoDoJogadorAte(20, 7.0, 7.0);
    // A velocidade constante seriam 20/7 = 2.857 s; parado custa ~tau a mais.
    assert.ok(Math.abs(lancado - 20 / 7) < 0.02, `lançado devia ser ~2.86 s: ${lancado.toFixed(3)}`);
    assert.ok(parado > lancado + 0.15,
        `arranque não custou nada: parado ${parado.toFixed(3)} vs lançado ${lancado.toFixed(3)}`);
    // Quem corre para o lado contrário demora ainda mais do que quem está parado.
    const invertendo = tempoDoJogadorAte(20, -5.0, 7.0);
    assert.ok(invertendo > parado, 'inverter o sentido tinha de custar tempo');
});

/* ---- o encontro --------------------------------------------------------- */

test('lançamento no espaço: a bola chega COM ele, não antes', () => {
    /*
    O caso que se via no jogo: companheiro a correr, ponto 12 m à frente dele,
    bola a 22 m do ponto.
    */
    const r = passeDeEncontro({
        distBola: 22, distReceptor: 12, vReceptor: 6.0, vMaxReceptor: 7.0
    });

    assert.ok(r.tempoBola !== null, 'a bola não chega ao ponto');
    const atraso = r.tempoBola - r.tempoReceptor;
    assert.ok(atraso > -0.15 && atraso < 0.75,
        `bola e homem fora de tempo: bola ${r.tempoBola.toFixed(2)}s, ` +
        `homem ${r.tempoReceptor.toFixed(2)}s`);

    // E chega aceitável: abaixo do que ele corre.
    assert.ok(r.vChegada <= 7.0, `chega a ${r.vChegada.toFixed(2)} m/s com ele a 7.0`);

    /*
    Contra o cálculo ANTIGO (só distância): mostra o tamanho do erro que isto
    corrige. A bola saía a `vChegadaLancamento` e chegava mais de meio segundo
    antes dele.
    */
    const antigo = velocidadeRasteiraPara(22, PassModel.vChegadaLancamento,
        { reforcoCurto: false });
    const tAntigo = tempoRasteiroDaBola(22, antigo);
    assert.ok(Math.abs(tAntigo - r.tempoReceptor) > 0.4,
        `o cálculo antigo já estava em tempo (${tAntigo.toFixed(2)}s contra ` +
        `${r.tempoReceptor.toFixed(2)}s do receptor): este teste deixou de medir o que devia`);
});

test('a chegada nunca foge ao receptor, mesmo em bola muito longa', () => {
    // Receptor lento, ponto perto dele, bola muito longe: se mandasse só o
    // tempo, a bola tinha de sair a matar e chegava a passar-lhe pela frente.
    const r = passeDeEncontro({
        distBola: 40, distReceptor: 4, vReceptor: 0, vMaxReceptor: 5.5
    });
    const tecto = Math.min(PassModel.encontro.vChegadaMax,
        5.5 * PassModel.encontro.fracVelReceptor);
    assert.ok(r.vChegada <= tecto + 0.05,
        `chegada ${r.vChegada.toFixed(2)} acima do tecto ${tecto.toFixed(2)}`);
    assert.ok(r.limitada, 'devia ter sido a chegada a mandar, não o tempo');
});

test('a bola nunca morre antes do ponto', () => {
    // Receptor a chegar devagar e muito longe no tempo: sem piso, a conta do
    // tempo mandava uma bola tão mansa que parava a meio.
    const r = passeDeEncontro({
        distBola: 28, distReceptor: 30, vReceptor: 0, vMaxReceptor: 4.5
    });
    assert.ok(r.tempoBola !== null, 'a bola parou antes do ponto');
    assert.ok(r.vChegada >= PassModel.encontro.vChegadaMin - 0.05,
        `chegada ${r.vChegada.toFixed(2)} abaixo do piso`);
});

test('passe aos pés não passa por aqui (distMinAlvo)', () => {
    // Só a constante: quem decide é o executePassGameplay, e o teste do ramo
    // vive lá. Aqui garante-se que o limiar existe e é razoável.
    assert.ok(PassModel.encontro.distMinAlvo >= 1.5 &&
        PassModel.encontro.distMinAlvo <= 6.0,
        `distMinAlvo fora do razoável: ${PassModel.encontro.distMinAlvo}`);
});
