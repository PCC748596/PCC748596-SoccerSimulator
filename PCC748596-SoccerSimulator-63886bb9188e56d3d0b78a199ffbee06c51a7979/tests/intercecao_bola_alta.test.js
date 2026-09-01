/*
INTERCEPÇÃO DE BOLA ALTA ERRADA.

O que se via: um lançamento ou passe alto a passar por cima do destinatário
ia em direção ao adversário e nenhum jogador reagia; ficavam todos a ver a
bola cair. Num jogo real, um defesa (ou um colega por trás do destinatário)
voltava de costas e cabeceava a bola antes que ela aterrasse.

A causa estava na percepção: `computeInterception` só marcava a bola como
interceptável quando ela chegava a uma altura "jogável" genérica (até ao topo
da cabeça). Para uma bola que passava a 3-4 m de altura, o primeiro ponto
jogável estava longe à frente, e ninguém lá chegava. Agora a percepção procura
primeiro o ponto onde a bola DESCE pela altura da testa e só depois recua
para pontos mais baixos.

Corre com: node tests/intercecao_bola_alta.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcPerception = ler('js/perception.js');

function extrairMetodo(src, nome) {
    const i = src.indexOf(`${nome}: function (`);
    if (i < 0) throw new Error(`${nome} não encontrado`);
    const f = src.indexOf(LF + '    },', i);
    const corpo = src.slice(i + `${nome}: function `.length, f + 7);
    const args = corpo.slice(1, corpo.indexOf(')'));
    const bloco = corpo.slice(corpo.indexOf('{') + 1, corpo.lastIndexOf('}'));
    return { args, bloco };
}

const { args, bloco } = extrairMetodo(srcPerception, 'computeInterception');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

function rodar(p, traj, match) {
    const PerceptionMock = {
        _traj: traj,
        passoAmostra: 0.05
    };
    const bb = {
        visible: true, distance: 0, direction: { x: 0, z: 0 },
        velocity: { x: 0, z: 0 }, speed: 0,
        approaching: false, movingAway: false,
        controllable: false, teammatePossession: false, opponentPossession: false
    };
    const env = `
        const ALTURA_BASE_Y = 0.0;
        const ALTURA_CABECA = 1.72;
        const ALTURA_TESTA = 1.62;
        const HeaderModel = { janelaContacto: 0.22 };
        const BallControl = { reach: 1.2, easySpeed: 4.0 };
        const THREE = { MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } };
    `;
    const fn = new Function(args, env + bloco);
    fn.call(PerceptionMock, p, bb, match);
    return bb;
}

function jog(x, z, speed = 50) {
    return {
        skillFor(k) { return speed; },
        model: { position: { x, z } }
    };
}

/* =====================================================================
   1 — BOLA ALTA A PASSAR POR CIMA: o defesa atrás é interceptável
   ===================================================================== */
console.log(LF + '1 — bola alta a passar por cima, defesa por trás');
{
    // Bola a sair de (0,0) a 3 m de altura, com velocidade horizontal forte
    // no sentido +z. Passa pela altura da testa (~1.62 m) por volta de z = 8 m.
    const traj = [];
    let x = 0, y = 3.0, z = 0;
    let vx = 2.0, vy = 0.0, vz = 14.0;
    const dt = 0.05, g = 15.0;
    for (let i = 0; i <= 40; i++) {
        traj.push({ x, y, z });
        vy -= g * dt;
        x += vx * dt; y += vy * dt; z += vz * dt;
        if (y < 0.11) { y = 0.11; vy = -vy * 0.55; vx *= 0.85; vz *= 0.85; }
    }

    const defesa = jog(0, 6, 80);          // defesa por trás, rápido
    const match = {
        ballCarrier: null,
        ball: { position: { x: 0, y: 3.0, z: 0 } },
        ballVel: { x: 2.0, y: 0, z: 14.0 }
    };

    const bb = rodar(defesa, traj, match);

    if (!bb.interceptable) {
        erro('o defesa deveria ser interceptável para uma bola alta a passar por cima dele');
    } else {
        ok('defesa interceptável');
        if (!bb.interceptionPoint) {
            erro('falta o interceptionPoint');
        } else {
            const dist = Math.hypot(bb.interceptionPoint.x - 0, bb.interceptionPoint.z - 6);
            if (dist > 4.0) {
                erro(`o ponto de intercepção está muito longe do defesa: ${dist.toFixed(2)} m`);
            } else ok(`ponto de intercepção a ${dist.toFixed(2)} m do defesa`);
            if (bb.timeToIntercept > 1.5) {
                erro(`tempo de intercepção muito grande: ${bb.timeToIntercept.toFixed(2)} s`);
            } else ok(`chega lá em ${bb.timeToIntercept.toFixed(2)} s`);
        }
    }
}

/* =====================================================================
   2 — BOLA BAIXA/RASTEIRA: continua a funcionar como antes
   ===================================================================== */
console.log(LF + '2 — bola rasteira continua interceptável');
{
    const traj = [];
    let x = 0, y = 0.11, z = 0;
    let vx = 1.0, vy = 0, vz = 10.0;
    const dt = 0.05;
    for (let i = 0; i <= 40; i++) {
        traj.push({ x, y, z });
        x += vx * dt; z += vz * dt;
    }

    const jogador = jog(2, 3, 70);
    const match = {
        ballCarrier: null,
        ball: { position: { x: 0, y: 0.11, z: 0 } },
        ballVel: { x: 1.0, y: 0, z: 10.0 }
    };

    const bb = rodar(jogador, traj, match);
    if (!bb.interceptable) erro('bola rasteira deixou de ser interceptável');
    else ok('bola rasteira interceptável');
}

/* =====================================================================
   3 — BOLA DEMASIADO ALTA/LONGA: ninguém alcança
   ===================================================================== */
console.log(LF + '3 — bola fora de alcance não é interceptável');
{
    const traj = [];
    let x = 0, y = 5.0, z = 0;
    let vx = 1.0, vy = 0, vz = 25.0;
    const dt = 0.05, g = 15.0;
    for (let i = 0; i <= 40; i++) {
        traj.push({ x, y, z });
        vy -= g * dt;
        x += vx * dt; y += vy * dt; z += vz * dt;
    }

    const jogador = jog(0, 2, 50);
    const match = {
        ballCarrier: null,
        ball: { position: { x: 0, y: 5.0, z: 0 } },
        ballVel: { x: 1.0, y: 0, z: 25.0 }
    };

    const bb = rodar(jogador, traj, match);
    if (bb.interceptable) erro('bola impossível foi marcada como interceptável');
    else ok('bola impossível corretamente ignorada');
}

console.log(falhas === 0 ? LF + 'OK' : LF + `FALHOU: ${falhas}`);
process.exit(falhas === 0 ? 0 : 1);
