require('./tools/headless/harness.js');
const dt=1/60, segundos=Number(process.argv[2]||300);
const scene=new THREE.Scene(); Match.init(scene);
if (typeof Officials!=='undefined'&&Officials.init) Officials.init(scene);
if (typeof Tatics!=='undefined'&&Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim==='undefined') global.Sim={}; Sim.running=true;

let passes=0, paraQuemCorre=0;
const origIP = FootballPlayer.prototype.initiatePass;
FootballPlayer.prototype.initiatePass = function (alvo) {
    passes++;
    if (alvo && alvo.runTimer > 0) paraQuemCorre++;
    return origIP.apply(this, arguments);
};
for (let i=0;i<Math.round(segundos/dt);i++) Match.update(dt);
console.log('passes iniciados', passes, '| para quem estava a infiltrar', paraQuemCorre,
  '(' + (100*paraQuemCorre/Math.max(1,passes)).toFixed(1) + '%)');
