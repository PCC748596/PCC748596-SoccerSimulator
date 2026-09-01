/*
TRÊS A IR À BOLA DEPOIS DE UM PASSE.

A CONTA. Assim que o passe sai, `Match.ballCarrier` fica null e a bola conta
como SOLTA. O `deveMandarChaser` responde `true` incondicionalmente a bola
solta — sem metade do campo, sem raio de accionamento, sem nada:

    if (o.bolaSolta) return true;
    if (o.isAttacking) return false;      <- nem chega aqui

Resultado, com um passe no ar:

    equipa que passou    o destinatário (o pickChaser dá-lhe o lugar de chaser)
    equipa que defende   um chaser  (corre para onde a bola ESTÁ)
    equipa que defende   um intercetor (corre para onde a bola VAI)

Três pessoas a convergir na mesma bola, e duas delas do mesmo lado a fazer o
mesmo trabalho. O chaser é o pior dos dois: aponta à posição actual da bola,
que é um ponto que já se moveu quando ele lá chega.

A CORRECÇÃO. Uma bola no ar COM DESTINATÁRIO CONHECIDO não está solta — está
endereçada. O intercetor continua a existir (é ele que tem a conta do tempo de
voo e o ponto de encontro); o chaser volta a obedecer às guardas normais de
distância e de metade do campo, e só arranca quando a bola aterra e passa a ter
dono outra vez.

Corre com: node tests/passe_em_voo_nao_e_bola_solta.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcTeam = ler('js/bt/team_bt.js');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

function trecho(nome) {
    const i = srcTeam.indexOf(`function ${nome}(`);
    if (i < 0) throw new Error(`${nome} não encontrada`);
    return srcTeam.slice(i, srcTeam.indexOf(LF + '}', i) + 2);
}

/*
Monta o pickChaser a sério, com o Match por fora. Só o que ele lê é que precisa
de existir: a bola, o portador, o destinatário e a lista da equipa.
*/
function montar(match) {
    const preludio = `
        const MarkingModel = {
            raioDeAccionamento: { low: 8, balanced: 12, high: 18 },
            tercoDeEmergencia: -17.7
        };
        const Tatics = { pressaoDefensiva: 'balanced' };
        const MatchStats = { TeamA: {}, TeamB: {} };
        const escolherChaser = (cands) => (cands && cands.length ? cands[0].p : null);
    `;
    return new Function('Match',
        preludio + trecho('deveMandarChaser') + trecho('alguemAConduzir') +
        trecho('pickChaser') + '; return pickChaser;'
    )(match);
}

const jog = (nome, team, x, z) => ({
    nome, team, role: 'mid', dirZ: team === 'TeamA' ? 1 : -1,
    carryTouchGrace: 0,
    model: { position: { x, z, distanceTo(o) { return Math.hypot(o.x - x, o.z - z); } } }
});

/* =====================================================================
   1 — PASSE NO AR: A EQUIPA QUE DEFENDE NÃO MANDA CHASER
   ===================================================================== */
console.log(LF + '1 — bola endereçada não é bola solta');
{
    const receptor = jog('receptorA', 'TeamA', 0, 10);
    const defesa1 = jog('defesaB1', 'TeamB', 0, 14);
    const defesa2 = jog('defesaB2', 'TeamB', 5, 16);

    const match = {
        ball: { position: { x: 0, z: 5 } },
        ballCarrier: null,
        intendedReceiver: receptor,   // o passe vai a caminho dele
        state: 'PLAY',
        players: [receptor],
        opponents: [defesa1, defesa2]
    };
    const pickChaser = montar(match);

    // A equipa que defende: sem portador nenhum para medir distância, as
    // guardas normais não a mandam sair. Quem trata do passe é o intercetor.
    const bbB = {
        team: 'TeamB', dir: -1, isAttacking: false,
        outfield: [defesa1, defesa2], chaser: null
    };
    pickChaser(bbB);
    if (bbB.chaser) {
        erro(`a equipa que defende mandou ${bbB.chaser.nome} atrás de uma bola ` +
            'que já tem destinatário — é o terceiro homem');
    } else ok('a defender: nenhum chaser enquanto a bola está no ar');

    // A equipa que passou continua a entregar o lugar ao destinatário, que é
    // quem tem mesmo de lá ir.
    const bbA = {
        team: 'TeamA', dir: 1, isAttacking: true,
        outfield: [receptor], chaser: null
    };
    pickChaser(bbA);
    if (bbA.chaser !== receptor) {
        erro(`o chaser da equipa que passou devia ser o destinatário, é ${bbA.chaser && bbA.chaser.nome}`);
    } else ok('quem passou: o chaser é o destinatário, e mais ninguém');
}

/* =====================================================================
   2 — BOLA MESMO PERDIDA: NADA MUDA
   ===================================================================== */
console.log(LF + '2 — sem destinatário, vai-se buscar como sempre');
{
    const defesa1 = jog('defesaB1', 'TeamB', 0, 14);
    const match = {
        ball: { position: { x: 0, z: 30 } },
        ballCarrier: null,
        intendedReceiver: null,       // ninguém a espera: bola perdida
        state: 'PLAY',
        players: [],
        opponents: [defesa1]
    };
    const pickChaser = montar(match);

    const bb = {
        team: 'TeamB', dir: -1, isAttacking: false,
        outfield: [defesa1], chaser: null
    };
    pickChaser(bb);
    if (bb.chaser !== defesa1) {
        erro('bola perdida e ninguém foi buscá-la — o encrave da bola parada volta');
    } else ok('bola perdida: continua a ir-se buscar');
}

/* =====================================================================
   3 — O PASSE MORREU: VOLTA A SER BOLA SOLTA
   ===================================================================== */
console.log(LF + '3 — passe falhado volta a ser disputado');
{
    /*
    O `intendedReceiver` é limpo no updateBall (match.js) quando a bola passa
    ao lado do destinatário e se afasta. A partir daí é bola perdida como
    qualquer outra — isto não pode trancar a equipa numa bola que ninguém vai
    receber.
    */
    const defesa1 = jog('defesaB1', 'TeamB', 0, 14);
    const match = {
        ball: { position: { x: 0, z: 20 } },
        ballCarrier: null,
        intendedReceiver: null,
        state: 'PLAY',
        players: [],
        opponents: [defesa1]
    };
    const pickChaser = montar(match);
    const bb = {
        team: 'TeamB', dir: -1, isAttacking: false,
        outfield: [defesa1], chaser: null
    };
    pickChaser(bb);
    if (!bb.chaser) erro('depois de o passe morrer ninguém vai à bola');
    else ok('passe morto: volta a haver chaser');
}

/* =====================================================================
   4 — O DESTINATÁRIO DA OUTRA EQUIPA NÃO TRANCA O DONO DA BOLA
   ===================================================================== */
console.log(LF + '4 — com portador em campo as guardas normais mandam');
{
    // Bola com dono: o `bolaSolta` já era false aqui, e continua a ser. O que
    // decide é a distância ao portador, como sempre decidiu.
    const portador = jog('portadorA', 'TeamA', 0, 0);
    const perto = jog('defesaB1', 'TeamB', 0, 3);
    const match = {
        ball: { position: { x: 0, z: 0 } },
        ballCarrier: portador,
        intendedReceiver: null,
        state: 'PLAY',
        players: [portador],
        opponents: [perto]
    };
    const pickChaser = montar(match);
    const bb = {
        team: 'TeamB', dir: -1, isAttacking: false,
        outfield: [perto], chaser: null
    };
    pickChaser(bb);
    if (bb.chaser !== perto) erro('portador a 3 m e ninguém lhe sai ao caminho');
    else ok('portador dentro do raio: sai-se à bola');
}

console.log(LF + (falhas ? `FALHOU: ${falhas}` : 'OK'));
process.exit(falhas ? 1 : 0);
