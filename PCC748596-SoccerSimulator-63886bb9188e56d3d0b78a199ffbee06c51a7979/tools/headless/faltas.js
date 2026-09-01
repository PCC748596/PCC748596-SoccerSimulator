/*
FALTAS — a cobrança sai? com corrida? e em quê?

Uso: node tools/headless/faltas.js [segundos]
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 900);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const cobrancas = [];
let aberta = null;

const origBater = FootballPlayer.prototype.baterFalta;
FootballPlayer.prototype.baterFalta = function () {
    const dist = Math.hypot(
        this.model.position.x - Match.ball.position.x,
        this.model.position.z - Match.ball.position.z);
    aberta = { distNoInicio: dist, t: 0, taker: this, saiu: false };
    origBater.call(this);
};

const origExec = FootballPlayer.prototype.executarFalta;
if (origExec) {
    FootballPlayer.prototype.executarFalta = function (decisao) {
        if (aberta) {
            aberta.decisao = decisao;
            aberta.tempoAteContacto = aberta.t;
            aberta.distNoContacto = Math.hypot(
                this.model.position.x - Match.ball.position.x,
                this.model.position.z - Match.ball.position.z);
        }
        origExec.call(this, decisao);
    };
}

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (aberta) {
        aberta.t += dt;
        if (aberta.decisao !== undefined || aberta.t > 4) {
            if (Match.ballVel.lengthSq() > 1 || aberta.t > 4) {
                aberta.velSaida = Match.ballVel.length();
                cobrancas.push(aberta);
                aberta = null;
            }
        }
    }
}

const mediana = (xs) => {
    const o = xs.filter(x => x !== undefined).sort((a, b) => a - b);
    return o.length ? o[Math.floor(o.length / 2)] : NaN;
};

console.log('');
console.log(`FALTAS COBRADAS — ${cobrancas.length} em ${segundos}s simulados`);
const semContacto = cobrancas.filter(c => c.decisao === undefined).length;
console.log(`  cobranças que nunca chegaram ao contacto: ${semContacto}`);
console.log('');
for (const d of ['remate', 'cruzamento', 'passe']) {
    const g = cobrancas.filter(c => c.decisao === d);
    if (!g.length) { console.log(`  ${d.padEnd(12)} 0`); continue; }
    console.log(`  ${d.padEnd(12)} ${String(g.length).padStart(3)}  ` +
        `distância no início ${mediana(g.map(c => c.distNoInicio)).toFixed(1)}m  ` +
        `no contacto ${mediana(g.map(c => c.distNoContacto)).toFixed(1)}m  ` +
        `corrida ${mediana(g.map(c => c.tempoAteContacto)).toFixed(2)}s`);
}
