/*
Diagnostico de passes: corre N sementes x M frames no harness headless e
mede, por passe, o desfecho e o desvio lateral em relacao a linha
passador->alvo. Nao altera codigo de producao: instrumenta por monkeypatch.

Uso: node diag_passes.js [sementes] [segundos]
*/
const path = require('path');
const vm = require('vm');
const raiz = 'z:/OneDrive_LEVU_TEMP/SoccerSimulator';
const { ctx } = require(path.join(raiz, 'tests', 'headless.js'));

const SEMENTES = Number(process.argv[2] || 6);
const SEGUNDOS = Number(process.argv[3] || 90);
const DT = 0.016;
const FRAMES = Math.round(SEGUNDOS / DT);

// PRNG deterministico injectado no contexto do jogo.
function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function correrSemente(semente) {
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
        MatchStats.amostrasPasse.length = 0;
        MatchStats.relogio = 0;
        MatchStats._pendingSample = null;
        MatchStats._pendingPassType = null;
        MatchStats._pendingPassTeam = null;
        globalThis.__diag = { amostras: [] };

        if (!MatchStats.__patched) {
            MatchStats.__patched = true;
            const execOrig = executePassGameplay;
            globalThis.executePassGameplay = function (p) {
                Match.__passadorAtual = p;
                return execOrig(p);
            };
            const iniOrig = MatchStats.registarPasseIniciado;
            MatchStats.registarPasseIniciado = function (team, tipo, dados) {
                iniOrig.call(this, team, tipo, dados);
                const p = Match.ultimoPassador || null;
                if (this._pendingSample && p) {
                    this._pendingSample.passadorPos = { x: p.model.position.x, z: p.model.position.z };
                    this._pendingSample.alvoPos = p.passTargetPos
                        ? { x: p.passTargetPos.x, z: p.passTargetPos.z } : null;
                    this._pendingSample.alvoNome = p.passTarget ? p.passTarget.pos : null;
                    this._pendingSample.alvoRef = p.passTarget || null;
                    this._pendingSample.passador = p;
                }
            };
            const recOrig = MatchStats.registarRecepcao;
            MatchStats.registarRecepcao = function (jogador, dominou) {
                if (this._pendingSample) {
                    this._pendingSample.recetor = jogador;
                    this._pendingSample.recetorNome = jogador ? jogador.pos : null;
                    this._pendingSample.recetorEquipa = jogador ? jogador.team : null;
                    this._pendingSample.bolaPos = { x: Match.ball.position.x, z: Match.ball.position.z };
                }
                return recOrig.call(this, jogador, dominou);
            };
            const fecharOrig = MatchStats.fecharAmostraPasse;
            MatchStats.fecharAmostraPasse = function (desfecho, vChegada) {
                const a = this._pendingSample;
                if (a && !a.__bolaFinal) {
                    a.__bolaFinal = { x: Match.ball.position.x, z: Match.ball.position.z };
                }
                return fecharOrig.call(this, desfecho, vChegada);
            };
        }
        for (let i = 0; i < ${FRAMES}; i++) Match.update(${DT});
        globalThis.__out = MatchStats.amostrasPasse.map(a => ({
            tipo: a.tipo, dist: a.dist, alto: a.alto, vSaida: a.vSaida,
            vChegada: a.vChegada, tVoo: a.tVoo, desfecho: a.desfecho,
            alvoNome: a.alvoNome, recetorNome: a.recetorNome,
            equipa: a.equipa, recetorEquipa: a.recetorEquipa,
            alvoPos: a.alvoPos, passadorPos: a.passadorPos,
            bolaFinal: a.__bolaFinal || null,
            recebeuOAlvo: !!(a.alvoRef && a.recetor && a.alvoRef === a.recetor)
        }));
    `, ctx);
    return vm.runInContext('JSON.stringify(globalThis.__out)', ctx);
}

// Match.ultimoPassador nao existe no jogo — cria-se um espelho aqui,
// preenchido no proprio patch a partir de quem tem a bola.
vm.runInContext(`
    Object.defineProperty(Match, 'ultimoPassador', {
        get() { return Match.__passadorAtual || null; },
        configurable: true
    });
`, ctx);

const todas = [];
for (let s = 1; s <= SEMENTES; s++) {
    const json = correrSemente(s * 7919);
    const arr = JSON.parse(json);
    arr.forEach(a => { a.semente = s; });
    todas.push(...arr);
    process.stderr.write(`semente ${s}: ${arr.length} passes\n`);
}

const n = todas.length;
const conta = (f) => todas.filter(f).length;
const pct = (k) => Math.round(1000 * k / n) / 10;

console.log(`\nTOTAL passes: ${n} (${SEMENTES} sementes x ${SEGUNDOS}s)`);
console.log('desfechos:');
for (const d of ['certo', 'corte', 'falhou', 'ninguem', null]) {
    const k = conta(a => a.desfecho === d);
    if (k) console.log(`  ${String(d)}: ${k} (${pct(k)}%)`);
}
console.log(`recebeu O ALVO pretendido: ${pct(conta(a => a.recebeuOAlvo))}%`);

const faixas = [[0, 8], [8, 15], [15, 25], [25, 999]];
console.log('\nfaixa   n   %certo %corte %falhou %ninguem  vSaida vCheg  tVoo');
for (const [lo, hi] of faixas) {
    const sub = todas.filter(a => a.dist >= lo && a.dist < hi);
    if (!sub.length) continue;
    const p = (d) => Math.round(100 * sub.filter(a => a.desfecho === d).length / sub.length);
    const med = (sel) => {
        const v = sub.map(sel).filter(x => typeof x === 'number').sort((a, b) => a - b);
        return v.length ? Math.round(v[Math.floor(v.length / 2)] * 10) / 10 : '-';
    };
    console.log(`${lo}-${hi}m  ${String(sub.length).padStart(4)}  ${String(p('certo')).padStart(5)} ${String(p('corte')).padStart(6)} ${String(p('falhou')).padStart(7)} ${String(p('ninguem')).padStart(8)}   ${String(med(a => a.vSaida)).padStart(5)} ${String(med(a => a.vChegada)).padStart(5)} ${String(med(a => a.tVoo)).padStart(5)}`);
}

console.log('\npor tipo:');
for (const t of ['passe', 'lancamento', 'cruzamento']) {
    const sub = todas.filter(a => a.tipo === t);
    if (!sub.length) continue;
    const p = (d) => Math.round(100 * sub.filter(a => a.desfecho === d).length / sub.length);
    console.log(`  ${t}: n=${sub.length} certo=${p('certo')}% corte=${p('corte')}% falhou=${p('falhou')}% ninguem=${p('ninguem')}%`);
}

// desvio da bola final ao alvo pretendido
const comAlvo = todas.filter(a => a.alvoPos && a.bolaFinal);
if (comAlvo.length) {
    const desvios = comAlvo.map(a => Math.hypot(a.bolaFinal.x - a.alvoPos.x, a.bolaFinal.z - a.alvoPos.z)).sort((x, y) => x - y);
    const q = (f) => Math.round(desvios[Math.floor(desvios.length * f)] * 10) / 10;
    console.log(`\ndesvio bola-final -> alvo: p25=${q(0.25)} med=${q(0.5)} p75=${q(0.75)} p90=${q(0.9)} m (n=${comAlvo.length})`);
}

// Dispersao entre sementes: a media global esconde jogos maus.
{
    const porSem = [];
    for (let s = 1; s <= SEMENTES; s++) {
        const sub = todas.filter(a => a.semente === s);
        if (!sub.length) continue;
        porSem.push(100 * sub.filter(a => a.desfecho === 'certo').length / sub.length);
    }
    const m = porSem.reduce((a, b) => a + b, 0) / porSem.length;
    const sd = Math.sqrt(porSem.reduce((a, b) => a + (b - m) ** 2, 0) / (porSem.length - 1));
    console.log(`\n%certo por semente: media ${m.toFixed(1)} +- ${sd.toFixed(1)} (n=${porSem.length}), ` +
        `min ${Math.min(...porSem).toFixed(0)} max ${Math.max(...porSem).toFixed(0)}, ` +
        `erro-padrao ${(sd / Math.sqrt(porSem.length)).toFixed(1)}`);
    console.log('  abaixo de 70%: ' + porSem.filter(v => v < 70).length + '/' + porSem.length + ' sementes');
}
