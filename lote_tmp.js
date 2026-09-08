require('./tools/headless/harness.js');
const scene=new THREE.Scene(); Match.init(scene);
if (typeof Officials!=='undefined'&&Officials.init) Officials.init(scene);
if (typeof Tatics!=='undefined'&&Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim==='undefined') global.Sim={}; Sim.running=true;
const jogos=Number(process.argv[2]||4), dur=Number(process.argv[3]||1080), dt=1/60;
let t={golos:0,rem:0,alvo:0,cantos:0,faltas:0,xg:0,defesas:0,min:0};
for (let g=0;g<jogos;g++){
  MatchStats.reset(); Match.placarA=0; Match.placarB=0; if (Match.resetPlay) Match.resetPlay();
  for (let i=0;i<Math.round(dur/dt);i++) Match.update(dt);
  for (const e of ['TeamA','TeamB']){ const s=MatchStats[e];
    t.golos+=s.remates.golos; t.rem+=s.remates.tentados; t.alvo+=s.remates.noAlvo;
    t.cantos+=s.cantos; t.faltas+=s.faltas; t.xg+=s.xg; t.defesas+=s.defesas; }
  t.min+=(dur*MatchDuration.timeScale)/60;
  console.log('  jogo',g+1,'golos',t.golos,'remates',t.rem,'cantos',t.cantos);
}
const p90=n=>(n*(90/(t.min/jogos))/jogos);
console.log('--- por 90 min (' + jogos + ' jogos) ---');
console.log('golos', p90(t.golos).toFixed(2), '(alvo 2.52) | remates', p90(t.rem).toFixed(1),
  '(26.1) | no alvo', (100*t.alvo/Math.max(1,t.rem)).toFixed(1)+'%');
console.log('golos por enquadrado', (100*t.golos/Math.max(1,t.alvo)).toFixed(1)+'% (real ~32%)',
  '| defesas', p90(t.defesas).toFixed(1));
console.log('xG', p90(t.xg).toFixed(2), '(2.84) | xG/remate', (t.xg/Math.max(1,t.rem)).toFixed(3),
  '(0.109) | cantos', p90(t.cantos).toFixed(2), '(9.92) | faltas', p90(t.faltas).toFixed(1));
