/*
Diagnostico de POSICIONAMENTO por posicao/estilo.

Corre o jogo em headless e amostra, por jogador de campo e por frame, onde ele
esta no referencial de ATAQUE dele — separando as fases (equipa com bola vs.
sem bola). Serve para responder a perguntas do tipo "o lateral ofensivo sobe
mesmo pela ala?" com numeros em vez de impressao.

Colunas:
  |x|        distancia ao eixo do campo (0 = meio, 34 = linha lateral)
  avanco     z * dirZ (negativo = campo proprio, +53 = linha de fundo adversaria)
  %area      fraccao do tempo dentro da grande area adversaria
  %ala       fraccao do tempo com |x| > CrossModel.alaX (15 m)

Uso: node tools/diag_posicoes.js [sementes] [segundos]
*/
const path = require('path');
const vm = require('vm');
const raiz = path.join(__dirname, '..');
const { ctx } = require(path.join(raiz, 'tests', 'headless.js'));

const SEMENTES = Number(process.argv[2] || 6);
const SEGUNDOS = Number(process.argv[3] || 90);
const DT = 0.016;
const FRAMES = Math.round(SEGUNDOS / DT);

function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function correr(semente) {
    ctx.Math.random = mulberry32(semente);
    vm.runInContext(`
        EventBus._listeners = {};
        Match.players.length = 0;
        Match.opponents.length = 0;
        Match.ballCarrier = null;
        Match.setPieceTaker = null;
        Match.init(new THREE.Scene());
        Match.delta = ${DT};
        for (let i = 0; i < 120; i++) Match.update(${DT});

        globalThis.__acc = {};
        globalThis.guardar = function (p, comBola, tercoFinal, parceiro, bbEstado) {
            const chave = p.team + ' ' + p.pos + ' ' + (p.playingStyle || '-');
            let a = globalThis.__acc[chave];
            if (!a) a = globalThis.__acc[chave] = { com: [], sem: [] };
            const lista = comBola ? a.com : a.sem;
            // Lado NATURAL do jogador na formacao: +1 = ele joga por aquele
            // lado. xLado positivo = esta do seu lado; negativo = atravessou
            // para o lado contrario (infiltrou pelo meio e passou).
            const lado = Math.sign(p.baseTarget.x) || 1;
            lista.push({
                ax: Math.abs(p.model.position.x),
                xLado: p.model.position.x * lado,
                av: p.model.position.z * p.dirZ,
                tx: p.dynamicTarget ? p.dynamicTarget.x * lado : null,
                tv: p.dynamicTarget ? p.dynamicTarget.z * p.dirZ : null,
                terco: !!tercoFinal,
                st: (p.fsm && p.fsm.currentState) || '?',
                ativo: !!p.styleAtivo && !p.playingStyleDesligado,
                off: bbEstado === 'Offensive',
                // Mesmo lado do parceiro de ataque (outro CF), quando existe.
                mesmoLado: parceiro
                    ? (Math.sign(p.model.position.x) === Math.sign(parceiro.model.position.x))
                    : null
            });
        };

        for (let i = 0; i < ${FRAMES}; i++) {
            Match.update(${DT});
            if (i % 5) continue;   // amostra a ~12 Hz, chega e sobra
            for (const lado of [['TeamA', Match.players], ['TeamB', Match.opponents]]) {
                const bb = TeamAI.blackboards[lado[0]] || null;
                const comBola = bb ? !!bb.isAttacking : false;
                const dir = lado[0] === 'TeamA' ? 1 : -1;
                // Terco final: a bola no terco de ataque desta equipa.
                const tercoFinal = (Match.ball.position.z * dir) > (CAMPO_COMP / 6);
                const atacantes = lado[1].filter(j => j.role === 'atk');
                for (const p of lado[1]) {
                    if (p.role === 'gk') continue;
                    const parceiro = (p.role === 'atk')
                        ? atacantes.find(j => j !== p) || null : null;
                    guardar(p, comBola, tercoFinal, parceiro, bb ? bb.state : null);
                }
            }
        }
        globalThis.__out = JSON.stringify(globalThis.__acc);
    `, ctx);
    return JSON.parse(vm.runInContext('globalThis.__out', ctx));
}

const acc = {};
for (let s = 1; s <= SEMENTES; s++) {
    const parcial = correr(s * 7919);
    for (const k of Object.keys(parcial)) {
        if (!acc[k]) acc[k] = { com: [], sem: [] };
        acc[k].com.push(...parcial[k].com);
        acc[k].sem.push(...parcial[k].sem);
    }
    process.stderr.write(`semente ${s} ok\n`);
}

const AREA_Z = 34.0, AREA_X = 20.5, ALA_X = 15.0;
const mediana = (arr) => {
    if (!arr.length) return NaN;
    const o = arr.slice().sort((a, b) => a - b);
    return o[Math.floor(o.length / 2)];
};
const f1 = (v) => (Number.isNaN(v) ? '  -  ' : v.toFixed(1).padStart(5));
const pc = (v) => (v * 100).toFixed(0).padStart(4);

// Quem entra na area, e em que estado da FSM � a diferenca entre o tecto
// posicional estar furado e ser o PlayerBT a levar la o jogador.
{
    console.log('');
    console.log('ESTADOS DENTRO DA GRANDE AREA (por estilo, todas as fases)');
    const porEstilo = {};
    for (const k of Object.keys(acc)) {
        const estilo = k.split(' ').slice(2).join(' ');
        for (const fase of ['com', 'sem']) {
            for (const r of acc[k][fase]) {
                if (!(r.av > AREA_Z && r.ax < AREA_X)) continue;
                const e = porEstilo[estilo] || (porEstilo[estilo] = { n: 0, st: {} });
                e.n++; e.st[r.st] = (e.st[r.st] || 0) + 1;
            }
        }
    }
    for (const est of Object.keys(porEstilo).sort()) {
        const e = porEstilo[est];
        const top = Object.entries(e.st).sort((a, b) => b[1] - a[1]).slice(0, 4)
            .map(([k2, v]) => `${k2} ${Math.round(100 * v / e.n)}%`).join('  ');
        console.log(`  ${est.padEnd(22)} n=${String(e.n).padStart(5)}   ${top}`);
    }
}

const cab = 'equipa pos estilo                     n   xLado alvoX  avanco alvoAv  %ala %area %areaTF %cruzou %mLado %estOn';
const linhas = Object.keys(acc).sort();

// So a fase COM BOLA, e so os frames com o estilo LIGADO: e a unica medida que
// responde a "quando o estilo manda, para onde e que ele leva o jogador".
console.log('');
console.log('COM BOLA, e SO nos frames com o estilo LIGADO');
console.log('equipa pos estilo                     n   xLado  avanco  %ala %areaTF %mLado');
for (const k of linhas) {
    const a = acc[k].com.filter(r => r.ativo);
    if (a.length < 30) { console.log(`${k.padEnd(34)} ${String(a.length).padStart(5)}  (amostra curta)`); continue; }
    const noTerco = a.filter(r => r.terco);
    const comPar = a.filter(r => r.mesmoLado !== null);
    console.log(`${k.padEnd(34)} ${String(a.length).padStart(5)} ${f1(mediana(a.map(r => r.xLado)))} ` +
        `${f1(mediana(a.map(r => r.av)))}  ${pc(a.filter(r => r.ax > ALA_X).length / a.length)}   ` +
        `${noTerco.length ? pc(noTerco.filter(r => r.av > AREA_Z && r.ax < AREA_X).length / noTerco.length) : '  - '}   ` +
        `${comPar.length ? pc(comPar.filter(r => r.mesmoLado).length / comPar.length) : '  - '}`);
}

// Quanto custa a regra dos 3 s de posse (TeamState.OFFENSIVE): fraccao dos
// frames COM BOLA em que a equipa chega sequer a estar em OFFENSIVE.
console.log('');
for (const eq of ['TeamA', 'TeamB']) {
    const todas = [];
    for (const k of linhas) if (k.startsWith(eq + ' ')) todas.push(...acc[k].com);
    if (!todas.length) continue;
    console.log(`${eq}: com bola, state===OFFENSIVE em ${pc(todas.filter(r => r.off).length / todas.length)}% dos frames`);
}

for (const fase of ['com', 'sem']) {
    console.log(fase === 'com' ? '\nfase COM BOLA (equipa a atacar)' : '\nfase SEM BOLA');
    console.log(cab);
    for (const k of linhas) {
        const a = acc[k][fase];
        if (!a.length) continue;
        const pAla = a.filter(r => r.ax > ALA_X).length / a.length;
        const pArea = a.filter(r => r.av > AREA_Z && r.ax < AREA_X).length / a.length;
        const noTerco = a.filter(r => r.terco);
        const pAreaTF = noTerco.length
            ? noTerco.filter(r => r.av > AREA_Z && r.ax < AREA_X).length / noTerco.length : NaN;
        // "cruzou": esta do lado contrario ao seu lado natural na formacao.
        const pCruzou = a.filter(r => r.xLado < 0).length / a.length;
        const comPar = a.filter(r => r.mesmoLado !== null);
        const pMesmo = comPar.length ? comPar.filter(r => r.mesmoLado).length / comPar.length : NaN;
        console.log(`${k.padEnd(34)} ${String(a.length).padStart(5)} ${f1(mediana(a.map(r => r.xLado)))} ` +
            `${f1(mediana(a.map(r => r.tx).filter(v => v !== null)))}  ` +
            `${f1(mediana(a.map(r => r.av)))} ${f1(mediana(a.map(r => r.tv).filter(v => v !== null)))}  ` +
            `${pc(pAla)} ${pc(pArea)}   ${Number.isNaN(pAreaTF) ? '  - ' : pc(pAreaTF)}    ${pc(pCruzou)}   ` +
            `${Number.isNaN(pMesmo) ? '  - ' : pc(pMesmo)}  ` +
            `${pc(a.filter(r => r.ativo).length / a.length)}`);
    }
}
