/*
"A linha de passe aparece mas o passe sai noutra direccao."

Duas hipoteses, medidas ao mesmo tempo:

  A) o passe sai mesmo torto — angulo entre a direccao alvo (do sitio da bola
     para o passTargetPos, que e o que a linha desenha) e a velocidade com que
     a bola sai. Deve ser so o erro de execucao (PassErrorModel).

  B) a linha que esta no ecra e de um passe que NUNCA foi executado — o
     initiatePass desenha a linha e so o executePassGameplay a esconde, por
     isso um passe abortado entre a decisao e o contacto deixa a linha la
     ate ao proximo passe.

Uso: node tools/diag_linha_passe.js [sementes] [segundos]
*/
const path = require('path');
const vm = require('vm');
const raiz = path.join(__dirname, '..');
const { ctx } = require(path.join(raiz, 'tests', 'headless.js'));

const SEMENTES = Number(process.argv[2] || 4);
const SEGUNDOS = Number(process.argv[3] || 120);
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

        globalThis.__r = { decididos: 0, executados: 0, abortados: 0, angulos: [], piores: [] };
        globalThis.R = globalThis.__r;

        if (!globalThis.__patched) {
            globalThis.__patched = true;

            // A DECISAO: initiatePass desenha a linha e cria o actionState.
            const iniOrig = FootballPlayer.prototype.initiatePass;
            FootballPlayer.prototype.initiatePass = function (alvo) {
                const r = iniOrig.call(this, alvo);
                R.decididos++;
                this.__passePendente = true;
                /*
                O onContact do ActionState tem uma guarda:
                    if (this.hasBall && this.passTarget) executePassGameplay(this)
                Se ela falhar, o passe nao acontece E A LINHA NUNCA E
                ESCONDIDA (quem a esconde e o executePassGameplay). Conta-se
                aqui quantas vezes o contacto chega e a guarda o recusa.
                */
                /*
                UMA SO LINHA PARA 22 JOGADORES: Match.passLineVisual e
                Match.passTargetVisual sao objectos unicos. Se alguem decide
                passar enquanto o passe de outro ainda nao chegou ao contacto,
                a linha passa a ser a do SEGUNDO — e a bola que sai a seguir e
                a do PRIMEIRO. Conta-se aqui essa sobreposicao.
                */
                for (const lista of [Match.players, Match.opponents]) {
                    for (const outro of lista) {
                        if (outro !== this && outro.__passePendente) {
                            R.sobrepostos = (R.sobrepostos || 0) + 1;
                            R.sobrepostosDetalhe = R.sobrepostosDetalhe || [];
                            if (R.sobrepostosDetalhe.length < 8) {
                                R.sobrepostosDetalhe.push({
                                    primeiro: outro.team + ' ' + outro.pos,
                                    segundo: this.team + ' ' + this.pos
                                });
                            }
                        }
                    }
                }

                const st = this.actionState;
                if (st) {
                    const cbOrig = st.onContact;
                    const jogador = this;
                    st.onContact = () => {
                        if (!jogador.hasBall || !jogador.passTarget) {
                            R.contactoRecusado = (R.contactoRecusado || 0) + 1;
                            R.motivos = R.motivos || { semBola: 0, semAlvo: 0 };
                            if (!jogador.hasBall) R.motivos.semBola++;
                            else R.motivos.semAlvo++;
                            jogador.__passePendente = false;
                        }
                        return cbOrig();
                    };
                }
                return r;
            };

            // O CONTACTO: executePassGameplay poe a bola a andar.
            const execOrig = executePassGameplay;
            globalThis.executePassGameplay = function (p) {
                const alvoX = p.passTargetPos.x, alvoZ = p.passTargetPos.z;
                const bx = Match.ball.position.x, bz = Match.ball.position.z;
                const r = execOrig(p);
                R.executados++;
                p.__passePendente = false;

                // A LINHA desenhada parte do JOGADOR (initiatePass usa
                // this.model.position); a bola parte de onde ESTA.
                const px = p.model.position.x, pz = p.model.position.z;
                const angLinha = Math.atan2(alvoX - px, alvoZ - pz);
                const angAlvo = Math.atan2(alvoX - bx, alvoZ - bz);
                const angSaida = Math.atan2(Match.ballVel.x, Match.ballVel.z);
                let d = Math.abs(angAlvo - angSaida);
                if (d > Math.PI) d = 2 * Math.PI - d;
                const graus = d * 180 / Math.PI;
                R.angulos.push(Math.round(graus * 10) / 10);

                let dl = Math.abs(angLinha - angSaida);
                if (dl > Math.PI) dl = 2 * Math.PI - dl;
                const grausLinha = dl * 180 / Math.PI;
                R.angulosLinha = R.angulosLinha || [];
                R.angulosLinha.push(Math.round(grausLinha * 10) / 10);
                R.distBolaPe = R.distBolaPe || [];
                R.distBolaPe.push(Math.round(Math.hypot(px - bx, pz - bz) * 100) / 100);
                if (grausLinha > 30 && R.piores.length < 10) {
                    R.piores.push({
                        pos: p.pos, graus: Math.round(grausLinha),
                        dist: Math.round(Math.hypot(alvoX - px, alvoZ - pz)),
                        distBolaPe: Math.round(Math.hypot(px - bx, pz - bz) * 10) / 10
                    });
                }
                /*
                EXCESSO: segue-se a bola ate parar, sair do campo ou mudar de
                dono, e projecta-se o ponto final na linha bola->alvo. O que
                interessa e a componente AO LONGO da linha: quanto passou do
                alvo.
                */
                /*
                FORCA: distancia a que a bola PARARIA sozinha, so com o atrito
                de rolamento (a = mu*g), contra a distancia que foi pedida. E
                a medida da forca independente de quem toca na bola.
                */
                {
                    const a = BallPhysics.atritoRolamento * BallPhysics.gravidade;
                    const vh = Math.hypot(Match.ballVel.x, Match.ballVel.z);
                    const pedido = Math.hypot(alvoX - bx, alvoZ - bz);
                    R.forca = R.forca || [];
                    R.forca.push({
                        pedido: Math.round(pedido * 10) / 10,
                        pararia: Math.round((vh * vh / (2 * a)) * 10) / 10,
                        alto: Match.ballVel.y > 0.01,
                        paraAla: Math.abs(alvoX) > 18,
                        vSaida: Math.round(vh * 10) / 10,
                        // Chegada teorica ao alvo, se ninguem lhe tocar.
                        vChegada: Math.round(Math.sqrt(Math.max(0, vh * vh - 2 * a * pedido)) * 10) / 10
                    });
                }

                R.emVoo = {
                    ox: bx, oz: bz, ax: alvoX, az: alvoZ,
                    pedido: Math.hypot(alvoX - bx, alvoZ - bz),
                    alto: Match.ballVel.y > 0.01,
                    vSaida: Math.hypot(Match.ballVel.x, Match.ballVel.z),
                    // Lateral: alvo perto da linha, que e a queixa concreta.
                    paraAla: Math.abs(alvoX) > 18
                };
                return r;
            };
        }

        R.excessos = [];
        // Embates na barreira lateral: a bola sairia pela linha e e devolvida.
        R.barreira = { lateral: 0, fundo: 0, depoisDePasse: 0 };
        globalThis.__ultimoPasse = null;
        for (let i = 0; i < ${FRAMES}; i++) {
            Match.update(${DT});

            {
                const BCx = BarreiraCampo.x - BallPhysics.raio;
                if (Math.abs(Match.ball.position.x) >= BCx - 0.02) {
                    R.barreira.lateral++;
                    if (R.emVoo) R.barreira.depoisDePasse++;
                }
                if (Math.abs(Match.ball.position.z) >= BarreiraCampo.z - BallPhysics.raio - 0.02) {
                    R.barreira.fundo++;
                }
            }

            if (R.emVoo) {
                const v = R.emVoo;
                const parou = Math.hypot(Match.ballVel.x, Match.ballVel.z) < 0.4;
                const dono = !!Match.ballCarrier;
                const foraX = Math.abs(Match.ball.position.x) > CAMPO_LARG / 2 - 0.3;
                const foraZ = Math.abs(Match.ball.position.z) > CAMPO_COMP / 2 - 0.3;
                if (parou || dono || foraX || foraZ) {
                    const ux = (v.ax - v.ox) / (v.pedido || 1);
                    const uz = (v.az - v.oz) / (v.pedido || 1);
                    const px = Match.ball.position.x - v.ox;
                    const pz = Match.ball.position.z - v.oz;
                    const aoLongo = px * ux + pz * uz;
                    R.excessos.push({
                        pedido: Math.round(v.pedido * 10) / 10,
                        percorrido: Math.round(aoLongo * 10) / 10,
                        excesso: Math.round((aoLongo - v.pedido) * 10) / 10,
                        alto: v.alto, paraAla: v.paraAla,
                        vSaida: Math.round(v.vSaida * 10) / 10,
                        bateuNaLinha: foraX || foraZ
                    });
                    R.emVoo = null;
                }
            }
            // Passe decidido que deixou de estar em PASS sem chegar ao
            // contacto: a linha dele fica no ecra ate alguem passar a serio.
            for (const lista of [Match.players, Match.opponents]) {
                for (const p of lista) {
                    if (p.__passePendente && p.fsm.currentState !== 'PASS') {
                        p.__passePendente = false;
                        R.abortados++;
                    }
                }
            }
        }
        globalThis.__out = JSON.stringify(R);
    `, ctx);
    return JSON.parse(vm.runInContext('globalThis.__out', ctx));
}

const T = { decididos: 0, executados: 0, abortados: 0, angulos: [], piores: [] };
for (let s = 1; s <= SEMENTES; s++) {
    const r = correr(s * 7919);
    T.decididos += r.decididos;
    T.executados += r.executados;
    T.abortados += r.abortados;
    T.angulos.push(...r.angulos);
    T.angulosLinha = (T.angulosLinha || []).concat(r.angulosLinha || []);
    T.distBolaPe = (T.distBolaPe || []).concat(r.distBolaPe || []);
    T.excessos = (T.excessos || []).concat(r.excessos || []);
    T.forca = (T.forca || []).concat(r.forca || []);
    T.barreira = T.barreira || { lateral: 0, fundo: 0, depoisDePasse: 0 };
    T.barreira.lateral += r.barreira.lateral;
    T.barreira.fundo += r.barreira.fundo;
    T.barreira.depoisDePasse += r.barreira.depoisDePasse;
    T.contactoRecusado = (T.contactoRecusado || 0) + (r.contactoRecusado || 0);
    T.sobrepostos = (T.sobrepostos || 0) + (r.sobrepostos || 0);
    T.sobrepostosDetalhe = (T.sobrepostosDetalhe || []).concat(r.sobrepostosDetalhe || []);
    T.motivos = T.motivos || { semBola: 0, semAlvo: 0 };
    if (r.motivos) { T.motivos.semBola += r.motivos.semBola; T.motivos.semAlvo += r.motivos.semAlvo; }
    if (T.piores.length < 10) T.piores.push(...r.piores);
    process.stderr.write(`semente ${s} ok\n`);
}

const o = T.angulos.slice().sort((a, b) => a - b);
const q = (f) => o.length ? o[Math.floor(o.length * f)] : NaN;
const pcAcima = (g) => (100 * o.filter(v => v > g).length / o.length).toFixed(1) + '%';

console.log(`\nB) passes DECIDIDOS: ${T.decididos}   executados: ${T.executados}   ` +
    `ABORTADOS antes do contacto: ${T.abortados} ` +
    `(${(100 * T.abortados / Math.max(1, T.decididos)).toFixed(1)}%)`);
console.log('   (um passe abortado deixa a linha desenhada no ecra ate ao passe seguinte)');

console.log(`\nA) desvio entre a linha desenhada e a saida da bola (n=${o.length})`);
console.log(`   mediana ${q(0.5)}   p90 ${q(0.9)}   p99 ${q(0.99)}   max ${o[o.length - 1]} graus`);
console.log(`   acima de 20 graus: ${pcAcima(20)}   acima de 45: ${pcAcima(45)}   acima de 90: ${pcAcima(90)}`);
{
    const oL = (T.angulosLinha || []).slice().sort((a, b) => a - b);
    const qL = (f) => oL.length ? oL[Math.floor(oL.length * f)] : NaN;
    const acima = (g) => (100 * oL.filter(v => v > g).length / oL.length).toFixed(1) + '%';
    console.log(`
C) desvio entre a LINHA (jogador->alvo) e a saida da bola (n=${oL.length})`);
    console.log(`   mediana ${qL(0.5)}   p90 ${qL(0.9)}   p99 ${qL(0.99)}   max ${oL[oL.length - 1]} graus`);
    console.log(`   acima de 20: ${acima(20)}   acima de 45: ${acima(45)}   acima de 90: ${acima(90)}`);
    const d = (T.distBolaPe || []).slice().sort((a, b) => a - b);
    console.log(`   distancia bola-pe no contacto: mediana ${d[Math.floor(d.length / 2)]} m, ` +
        `p90 ${d[Math.floor(d.length * 0.9)]} m, max ${d[d.length - 1]} m`);
}

{
    const ex = (T.excessos || []);
    const grupo = (nome, lista) => {
        if (!lista.length) return;
        const o = lista.map(e => e.excesso).sort((a, b) => a - b);
        const med = o[Math.floor(o.length / 2)];
        const p90 = o[Math.floor(o.length * 0.9)];
        const naLinha = lista.filter(e => e.bateuNaLinha).length;
        const altos = lista.filter(e => e.alto).length;
        console.log(`   ${nome.padEnd(22)} n=${String(lista.length).padStart(4)}  ` +
            `excesso mediano ${String(med).padStart(6)} m   p90 ${String(p90).padStart(6)} m   ` +
            `bateu na linha ${(100 * naLinha / lista.length).toFixed(0)}%   ` +
            `pelo alto ${(100 * altos / lista.length).toFixed(0)}%`);
    };
    console.log('');
    console.log('D) quanto a bola passa ALEM do alvo (ao longo da linha de passe)');
    grupo('todos', ex);
    grupo('alvo na ala (|x|>18)', ex.filter(e => e.paraAla));
    grupo('alvo no meio', ex.filter(e => !e.paraAla));
    grupo('rasteiros', ex.filter(e => !e.alto));
    grupo('pelo alto', ex.filter(e => e.alto));
}

{
    const f = (T.forca || []).filter(x => !x.alto);
    const grupo = (nome, lista) => {
        if (!lista.length) return;
        const med = (sel) => {
            const o = lista.map(sel).sort((a, b) => a - b);
            return o[Math.floor(o.length / 2)];
        };
        const passaria = lista.filter(x => x.pararia > x.pedido + 6).length;
        console.log(`   ${nome.padEnd(22)} n=${String(lista.length).padStart(4)}  ` +
            `pedido ${String(med(x => x.pedido)).padStart(5)} m   ` +
            `pararia a ${String(med(x => x.pararia)).padStart(5)} m   ` +
            `chegada ${String(med(x => x.vChegada)).padStart(5)} m/s   ` +
            `>6 m alem do alvo: ${(100 * passaria / lista.length).toFixed(0)}%`);
    };
    console.log('');
    console.log('E) FORCA dos passes rasteiros (onde a bola pararia sozinha vs onde foi pedida)');
    console.log(`   alvo de chegada calibrado: PassModel.vChegadaRasteira`);
    grupo('todos', f);
    grupo('alvo na ala (|x|>18)', f.filter(x => x.paraAla));
    grupo('alvo no meio', f.filter(x => !x.paraAla));
    grupo('curtos (<10 m)', f.filter(x => x.pedido < 10));
    grupo('medios (10-20 m)', f.filter(x => x.pedido >= 10 && x.pedido < 20));
    grupo('longos (>20 m)', f.filter(x => x.pedido >= 20));
}

{
    const b = T.barreira || { lateral: 0, fundo: 0, depoisDePasse: 0 };
    const minutos = (SEMENTES * SEGUNDOS) / 60;
    console.log('');
    console.log('F) EMBATES NA BARREIRA (frames com a bola encostada a ela)');
    console.log(`   lateral (x = ${'BarreiraCampo.x'}): ${b.lateral} frames  ` +
        `(~${(b.lateral / minutos).toFixed(1)} por minuto de jogo)`);
    console.log(`   dos quais com um passe em curso: ${b.depoisDePasse}`);
    console.log(`   fundo: ${b.fundo} frames`);
}

{
    console.log('');
    console.log('G) CONTACTO RECUSADO (o passe foi decidido, a linha foi desenhada,');
    console.log('   e no instante do contacto a guarda hasBall/passTarget recusou)');
    const rec = T.contactoRecusado || 0;
    console.log(`   ${rec} de ${T.decididos} passes decididos ` +
        `(${(100 * rec / Math.max(1, T.decididos)).toFixed(1)}%)   ` +
        `sem bola: ${T.motivos.semBola}   sem alvo: ${T.motivos.semAlvo}`);
    console.log('   -> nestes, a linha fica desenhada no ecra ate ao passe seguinte');
}

{
    console.log('');
    console.log('H) PASSES SOBREPOSTOS (decidido um enquanto outro ainda nao saiu do pe)');
    const so = T.sobrepostos || 0;
    console.log(`   ${so} de ${T.decididos} passes decididos ` +
        `(${(100 * so / Math.max(1, T.decididos)).toFixed(1)}%)`);
    for (const d of (T.sobrepostosDetalhe || []).slice(0, 6)) {
        console.log(`     linha passa a ser do ${d.segundo}, mas quem chuta a seguir e o ${d.primeiro}`);
    }
}

for (const p of T.piores) {
    console.log(`     ${p.pos.padEnd(3)} ${p.graus} graus, passe de ${p.dist} m, bola a ${p.distBolaPe} m do pe`);
}
