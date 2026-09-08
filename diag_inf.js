/* Porque e que o ramo do passe para quem infiltra quase nunca dispara. */
require('./tools/headless/harness.js');
const dt=1/60, segundos=Number(process.argv[2]||300);
const scene=new THREE.Scene(); Match.init(scene);
if (typeof Officials!=='undefined'&&Officials.init) Officials.init(scene);
if (typeof Tatics!=='undefined'&&Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim==='undefined') global.Sim={}; Sim.running=true;

let decisoes=0, comCorredor=0, naFaixa=0, linhaLivre=0;
const orig = global.tratarJogadaCombinada;
global.tratarJogadaCombinada = function (ctx) {
    const p = ctx.p;
    decisoes++;
    const colegas = (p.team==='TeamA')?Match.players:Match.opponents;
    const advs = (p.team==='TeamA')?Match.opponents:Match.players;
    const I = JogadasCombinadas.infiltracao;
    let temCorredor=false, temFaixa=false, temLinha=false;
    for (const m of colegas) {
        if (m===p||!m.model||!(m.runTimer>0)) continue;
        temCorredor=true;
        const d=p.model.position.distanceTo(m.model.position);
        if (d<I.distMin||d>I.distMax) continue;
        temFaixa=true;
        const alvo={x:m.runAlvo?m.runAlvo.x:m.model.position.x, z:m.model.position.z+p.dirZ*I.avancoDoPasse};
        if (corredorLivre(Match.ball.position.x,Match.ball.position.z,alvo.x,alvo.z,advs,I.margemLinha,true)) temLinha=true;
    }
    if (temCorredor) comCorredor++;
    if (temFaixa) naFaixa++;
    if (temLinha) linhaLivre++;
    return orig.apply(this, arguments);
};
for (let i=0;i<Math.round(segundos/dt);i++) Match.update(dt);
const pc=n=>(100*n/Math.max(1,decisoes)).toFixed(1)+'%';
console.log('decisoes de passe            ', decisoes);
console.log('  com colega a infiltrar     ', comCorredor, pc(comCorredor));
console.log('  ... dentro da faixa 8-34 m ', naFaixa, pc(naFaixa));
console.log('  ... com linha de passe livre', linhaLivre, pc(linhaLivre));
