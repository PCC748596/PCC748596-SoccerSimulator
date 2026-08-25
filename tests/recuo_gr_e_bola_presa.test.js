/*
DUAS REGRAS NOVAS, medidas aqui:

1. RECUO PARA O GUARDA-REDES. Um passe deliberado e COM O PÉ de um companheiro
   não pode ser agarrado com as mãos. Cabeça, peito e coxa podem; o toque de um
   adversário também liberta.

2. BOLA POUSADA EM CIMA DA BALIZA. O pano de cima da rede devolve a bola com
   `v.y = -v.y * restituicao`: quem lá chega de cima ressalta cada vez menos até
   ficar parada em cima da rede. Fica inalcançável, e o jogo não recomeça —
   a detecção de bola fora precisa que `|z| - raio` PASSE a linha de fundo, e
   uma bola assente em cima do travessão está praticamente EM CIMA dessa linha.

Corre com: node tests/recuo_gr_e_bola_presa.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcUtils = ler('js/utils.js');
const srcMatch = ler('js/match.js');
const srcConfig = ler('js/config.js');

function extrairFuncao(src, nome, ficheiro) {
    const ini = src.indexOf('function ' + nome);
    if (ini < 0) throw new Error(nome + ' não encontrada em ' + ficheiro);
    const fim = src.indexOf(LF + '}', ini) + 2;
    return src.slice(ini, fim);
}
function extrairMetodo(src, nome, ficheiro) {
    const cabeca = `    ${nome}: function (`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(nome + ' não encontrado em ' + ficheiro);
    const fim = src.indexOf(LF + '    },', ini);
    return src.slice(src.indexOf(') {', ini) + 3, fim);
}

const { maosProibidasNoRecuo } = new Function(
    extrairFuncao(srcUtils, 'maosProibidasNoRecuo', 'js/utils.js') +
    '; return { maosProibidasNoRecuo };')();

// Constantes reais do campo e da rede, lidas do config.
const CAMPO_COMP = parseFloat(srcConfig.match(/const CAMPO_COMP\s*=\s*([\d.]+)/)[1]);
const ALTURA_BALIZA = parseFloat(srcConfig.match(/ALTURA_BALIZA\s*=\s*([\d.]+)/)[1]);
const LARGURA_BALIZA = parseFloat(srcConfig.match(/LARGURA_BALIZA\s*=\s*([\d.]+)/)[1]);
const RAIO = parseFloat(srcConfig.match(/raio:\s*([\d.]+)/)[1]);
const PROF_BASE = parseFloat(srcConfig.match(/profBase:\s*([\d.]+)/)[1]);

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/* ====================================================================== */
console.log(LF + '1 — recuo para o guarda-redes');
{
    if (!maosProibidasNoRecuo('TeamA', 'TeamA')) {
        erro('recuo do TeamA: o GK do TeamA tinha de estar proibido');
    } else ok('recuo com o pé: o próprio guarda-redes não pode pegar');

    if (maosProibidasNoRecuo('TeamA', 'TeamB')) {
        erro('o recuo de uma equipa não pode proibir o guarda-redes da outra');
    } else ok('o guarda-redes adversário não é afectado');

    // Sem recuo nenhum é o caso normal, e tem de deixar agarrar sempre.
    for (const vazio of [null, undefined, '', 0, false]) {
        if (maosProibidasNoRecuo(vazio, 'TeamA')) {
            erro(`sem recuo (${JSON.stringify(vazio)}) o guarda-redes tem de poder agarrar`);
        }
    }
    ok('sem recuo marcado, agarra normalmente');
}

/*
A MARCA SÓ NASCE NUM PASSE COM O PÉ, e morre no toque seguinte. Verifica-se no
código, porque é aí que a distinção vive: `executePassGameplay` é o caminho do
PÉ — a cabeçada e a matada no peito têm caminhos próprios e não passam por lá.
*/
console.log(LF + '2 — onde a marca nasce e onde morre');
{
    const srcFsm = ler('js/fsm.js');
    // A função inteira, não uma janela de tamanho arbitrário: a marca fica a
    // mais de 12 000 caracteres do início e uma janela curta dava falso alarme.
    const corpoPasse = extrairFuncao(srcFsm, 'executePassGameplay(', 'js/fsm.js');
    if (!/Match\.recuoParaGR\s*=\s*p\.team/.test(corpoPasse)) {
        erro('o passe com o pé para o próprio guarda-redes não marca o recuo');
    } else ok('nasce no passe com o pé (executePassGameplay)');

    // A cabeçada e o peito não podem marcar: a regra permite-os.
    const srcPlayer = ler('js/player.js');
    const iPeito = srcPlayer.indexOf('controlarNoPeito(altura)');
    const corpoPeito = srcPlayer.slice(iPeito, iPeito + 2500);
    if (/recuoParaGR\s*=/.test(corpoPeito)) {
        erro('a matada no peito não pode marcar recuo — a regra permite as mãos');
    } else ok('o peito não marca (a regra permite)');

    if (!/this\.recuoParaGR\s*=\s*null/.test(srcMatch)) {
        erro('nada limpa o recuo — ficaria proibido para sempre');
    } else ok('morre no toque seguinte (resolveBallContact)');
}

/* ====================================================================== */
console.log(LF + '3 — bola pousada em cima da baliza');
{
    const corpo = extrairMetodo(srcMatch, 'destravarBolaEmCimaDaBaliza', 'js/match.js');
    const GoalNet = { profBase: PROF_BASE };
    const BallPhysics = { raio: RAIO };

    const correr = (bola, vel) => {
        const Match = {
            ball: { position: Object.assign({}, bola) },
            ballVel: Object.assign({
                lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; },
                set(x, y, z) { this.x = x; this.y = y; this.z = z; }
            }, vel)
        };
        const fn = new Function('CAMPO_COMP', 'ALTURA_BALIZA', 'LARGURA_BALIZA',
            'GoalNet', 'BallPhysics',
            `return function () {${corpo}};`)(CAMPO_COMP, ALTURA_BALIZA, LARGURA_BALIZA,
                GoalNet, BallPhysics);
        fn.call(Match);
        return Match;
    };

    const foraDaLinha = (m) => Math.abs(m.ball.position.z) - RAIO > CAMPO_COMP / 2;

    /*
    O CASO DA IMAGEM: bola parada em cima do travessão, mesmo por cima da linha
    de fundo. Tem de sair, para a detecção de fora que já existe decidir entre
    canto e pontapé de baliza.
    */
    {
        const m = correr(
            { x: 0.5, y: ALTURA_BALIZA + RAIO, z: CAMPO_COMP / 2 },
            { x: 0, y: 0, z: 0 });
        if (!foraDaLinha(m)) {
            erro(`a bola continua presa em z=${m.ball.position.z.toFixed(2)} (linha em ${(CAMPO_COMP / 2).toFixed(2)})`);
        } else ok('bola parada em cima do travessão passa a linha de fundo');
    }

    // Também em cima da rede, mais atrás.
    {
        const m = correr(
            { x: -2.0, y: ALTURA_BALIZA, z: -(CAMPO_COMP / 2 + 0.8) },
            { x: 0.1, y: 0, z: 0 });
        if (!foraDaLinha(m)) erro('bola pousada em cima da rede não foi libertada');
        else ok('bola em cima da rede, do outro lado do campo, também sai');
    }

    /*
    E O QUE NÃO PODE ACONTECER: uma bola a VOAR por cima do travessão a caminho
    da bancada não pode ser interrompida a meio do voo — isso roubava um lance.
    */
    {
        const antes = { x: 0.5, y: ALTURA_BALIZA + 0.3, z: CAMPO_COMP / 2 - 0.05 };
        const m = correr(antes, { x: 0, y: 4.0, z: 12.0 });
        if (m.ball.position.z !== antes.z) {
            erro('uma bola em pleno voo foi teleportada para fora');
        } else ok('bola rápida por cima do travessão não é tocada');
    }

    // E uma bola alta em pleno campo não tem nada de errado.
    {
        const antes = { x: 0, y: ALTURA_BALIZA + 1.0, z: 0 };
        const m = correr(antes, { x: 0, y: 0, z: 0 });
        if (m.ball.position.z !== antes.z) erro('bola alta no meio-campo foi mandada para fora');
        else ok('bola alta e lenta no meio-campo fica onde está');
    }

    // Nem uma bola parada ao lado do poste, fora da largura da baliza.
    {
        const antes = { x: LARGURA_BALIZA, y: ALTURA_BALIZA, z: CAMPO_COMP / 2 };
        const m = correr(antes, { x: 0, y: 0, z: 0 });
        if (m.ball.position.z !== antes.z) erro('bola ao lado da baliza foi afectada');
        else ok('fora da largura da baliza não é caso desta regra');
    }
}

console.log(LF + (falhas === 0
    ? 'recuo_gr_e_bola_presa: tudo bem.'
    : `recuo_gr_e_bola_presa: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
