/*
AS LINHAS, POR OCUPAÇÃO REAL — quantos estão em cada uma, e quem se atropela.

Três coisas medidas:

  1. quantos jogadores estão de facto na linha defensiva (pela profundidade
     efectiva, não pelo `role` da formação, que nunca muda);
  2. quantas vezes a linha defensiva fica com menos de dois;
  3. a que distância ficam o lateral e o meia-lateral do mesmo lado — é o par
     que se vê amontoado.

A linha de um jogador sai da profundidade dele no referencial de ataque,
comparada com as duas divisórias do bloco (1/3 e 2/3).

Uso: node tools/headless/linhas_ocupacao.js [segundos]
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 400);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

/*
A LINHA DE TRÁS é quem está junto do jogador mais RECUADO — não um terço do
bloco. Medir contra os terços dá ruído: o bloco é empurrado pela bola e pela
linha de fora-de-jogo, e há frames em que os onze caem todos no mesmo terço
(medido: a contagem oscilava entre 0 e 10). O que se vê no ecrã é a linha de
trás relativa aos COMPANHEIROS, e é isso que se mede aqui.
*/
const FAIXA = 6.0;   // metros a contar do mais recuado

const classificar = (lista, dir) => {
    const comZ = lista.map(p => ({ p: p, z: p.model.position.z * dir })).sort((a, b) => a.z - b.z);
    const traseira = comZ[0].z;
    const naLinha = comZ.filter(o => o.z <= traseira + FAIXA).map(o => o.p);
    return naLinha;
};

const conta = { def: [], mid: [], atk: [] };
let menosDeDois = 0, amostras = 0;
const parLateral = [];      // distância lateral↔meia-lateral do mesmo lado
const parTotal = [];        // distância a 3D
let colados = 0, paresContados = 0;
const larguraDef = [];

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 12) continue;

    for (const eq of ['TeamA', 'TeamB']) {
        const bb = TeamAI.get(eq); if (!bb || !bb.bloco) continue;
        const lista = ((eq === 'TeamA') ? Match.players : Match.opponents).filter(p => p.role !== 'gk');
        amostras++;

        const naDef = classificar(lista, bb.dir);
        conta.def.push(naDef.length);
        // Quantos CENTRAIS ainda estão na linha de trás: é o que a regra pede.
        conta.mid.push(naDef.filter(p => p.pos === 'CB').length);
        conta.atk.push(naDef.filter(p => p.pos === 'LB' || p.pos === 'RB').length);
        if (naDef.length < 2) menosDeDois++;

        // Largura ocupada por quem está de facto na linha defensiva.
        if (naDef.length >= 2) {
            const xs = naDef.map(p => p.model.position.x).sort((a, b) => a - b);
            larguraDef.push(xs[xs.length - 1] - xs[0]);
        }

        // O par do mesmo lado: LB com LM, RB com RM.
        for (const [a, b] of [['LB', 'LM'], ['RB', 'RM']]) {
            const pa = lista.find(p => p.pos === a), pb = lista.find(p => p.pos === b);
            if (!pa || !pb) continue;
            paresContados++;
            const d = pa.model.position.distanceTo(pb.model.position);
            parTotal.push(d);
            parLateral.push(Math.abs(pa.model.position.x - pb.model.position.x));
            if (d < 4.0) colados++;
        }
    }
}

const m = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const hist = (a) => {
    const h = {};
    a.forEach(v => { h[v] = (h[v] || 0) + 1; });
    return Object.keys(h).map(Number).sort((x, y) => x - y)
        .map(k => k + ':' + (100 * h[k] / a.length).toFixed(1) + '%').join('  ');
};

console.log('na linha de trás (a ' + FAIXA + ' m do mais recuado): ' + m(conta.def).toFixed(2) +
    ' jogadores  | destes, centrais: ' + m(conta.mid).toFixed(2) + '  laterais: ' + m(conta.atk).toFixed(2));
console.log('distribuição da linha DEFENSIVA: ' + hist(conta.def));
console.log('frames com MENOS DE DOIS na defesa: ' +
    (100 * menosDeDois / Math.max(1, amostras)).toFixed(1) + '%');
console.log('largura ocupada pela linha defensiva: ' + m(larguraDef).toFixed(1) + ' m');
console.log('');
console.log('par lateral <-> meia-lateral do mesmo lado:');
console.log('  distância média ' + m(parTotal).toFixed(2) + ' m  (só em x: ' + m(parLateral).toFixed(2) + ' m)');
console.log('  a menos de 4 m: ' + (100 * colados / Math.max(1, paresContados)).toFixed(1) + '% dos casos');
