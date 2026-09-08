/* Onde é que se MIRA, e onde é que a bola acaba por ir. */
require('./tools/headless/harness.js');
const N = Number(process.argv[2] || 2000);
const tipos = {}, mira = {};
for (let i = 0; i < N; i++) {
    const dist = 6 + Math.random() * 16;
    const t = tipoDeRemate({ dist, tec: 80, distAdversario: 99, gkAdiantado: 0 });
    tipos[t] = (tipos[t] || 0) + 1;
    const m = miraDeRemate({ tipo: t, gkX: (Math.random() * 2 - 1) * 1.5 });
    const chave = t;
    (mira[chave] = mira[chave] || []).push(Math.abs(m.x));
}
const maxC = (LARGURA_BALIZA / 2) - ShotModel.mira.margemPoste;
console.log('meia-baliza util (maxC)', maxC.toFixed(2), 'm  | poste a', (LARGURA_BALIZA/2).toFixed(2));
for (const t of Object.keys(tipos)) {
    const v = mira[t];
    const med = v.reduce((a, b) => a + b, 0) / v.length;
    console.log((t + '        ').slice(0, 10), String(tipos[t]).padStart(5),
        '| |x| mirado medio', med.toFixed(2), 'm  (', (100 * med / maxC).toFixed(0) + '% do canto )');
}
