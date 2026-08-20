/*
Converte assets/Ball.obj num ficheiro JS carregado por <script> normal.

Porquê não usar o OBJLoader: qualquer loader vai buscar o ficheiro por fetch/XHR,
e o browser bloqueia isso em file:// (CORS). Como o projecto é aberto com duplo
clique no index.html, sem servidor, um loader deixaria a bola por carregar. Um
<script> com os dados lá dentro não tem esse problema.

O OBJ tem 16 292 vértices e 32 580 triângulos depois de triangulado, o que em
texto directo dava 1.5 MB. Aqui é indexado (vértices partilhados) e as posições
vão em Int16 normalizado — 4 micrómetros de precisão numa bola de 14 cm. ~1/4 do
tamanho.

O que se corrige aqui: os triângulos degenerados que saem da triangulação em
leque dos polígonos de 20 lados de cada painel.

O que NÃO se corrige, de propósito: o winding. O OBJ tem orientação
inconsistente, mas o modelo não é uma esfera lisa — 8.4% das faces são as
paredes verticais dos sulcos entre painéis (medido: normais a 80-90° da
direcção radial). Orientar tudo "para fora do centro", como parecia óbvio,
estraga precisamente essas faces. Como as normais são calculadas à parte (ver
Match.criarBolaDaMalha) e o material usa DoubleSide, o winding é irrelevante
para o resultado — mais vale não lhe tocar do que estragá-lo.
*/
const fs = require('fs');

const ROOT = 'z:/OneDrive_LEVU_TEMP/SoccerSimulator';
const src = fs.readFileSync(ROOT + '/assets/Ball.obj', 'utf8');

const verts = [];
const grupos = [];
let atual = null;

for (const linha of src.split('\n')) {
    if (linha.startsWith('v ')) {
        const p = linha.split(/\s+/);
        verts.push([+p[1], +p[2], +p[3]]);
    } else if (linha.startsWith('usemtl ')) {
        atual = { material: linha.slice(7).trim(), tri: [] };
        grupos.push(atual);
    } else if (linha.startsWith('f ')) {
        if (!atual) { atual = { material: 'default', tri: [] }; grupos.push(atual); }
        const idx = linha.slice(2).trim().split(/\s+/).map(t => parseInt(t.split('/')[0], 10) - 1);
        for (let i = 1; i + 1 < idx.length; i++) atual.tri.push([idx[0], idx[i], idx[i + 1]]);
    }
}

// Centrar e normalizar para raio 1.
let cx = 0, cy = 0, cz = 0;
for (const v of verts) { cx += v[0]; cy += v[1]; cz += v[2]; }
cx /= verts.length; cy /= verts.length; cz /= verts.length;
let rmax = 0;
for (const v of verts) rmax = Math.max(rmax, Math.hypot(v[0] - cx, v[1] - cy, v[2] - cz));

console.log('vertices      : ' + verts.length);
console.log('raio original : ' + rmax.toFixed(4));
console.log('grupos        : ' + grupos.map(g => g.material + ' (' + g.tri.length + ' tri)').join(', '));

/*
Quantizar ANTES de decidir a orientação. Se orientássemos com os floats
originais, o arredondamento para Int16 podia virar slivers ao contrário — e o
ficheiro sairia com faces invertidas apesar da correcção.
*/
const Q = new Int16Array(verts.length * 3);
for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    Q[i * 3] = Math.round(((v[0] - cx) / rmax) * 32767);
    Q[i * 3 + 1] = Math.round(((v[1] - cy) / rmax) * 32767);
    Q[i * 3 + 2] = Math.round(((v[2] - cz) / rmax) * 32767);
}
// qi: os inteiros que vão para o ficheiro.
// qf: os mesmos valores como o jogo os vai ver (divididos pela escala) — é
//     sobre estes que se decide orientação e área, senão o conversor e o
//     resultado final podiam discordar nos triângulos mais finos.
const qi = (i) => [Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2]];
const qf = (i) => [Q[i * 3] / 32767, Q[i * 3 + 1] / 32767, Q[i * 3 + 2] / 32767];

/*
Limiar de área (na verdade |produto externo|, que é o dobro da área), com o raio
normalizado a 1. A área média de um triângulo aqui é ~3.9e-4; abaixo de 1/40
disso o triângulo é um sliver da triangulação em leque, não cobre nem um pixel,
e a sua orientação é numericamente indefinida — é o que fazia sobrar faces
viradas para dentro.
*/
const AREA_MIN = 1e-5;

const partes = [];
let totalTri = 0, paredes = 0, largados = 0;

for (const g of grupos) {
    const mapa = new Map();
    const locais = [];
    const indices = [];

    for (const t of g.tri) {
        const [a, b, c] = t.map(qf);
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];

        if (Math.hypot(n[0], n[1], n[2]) < AREA_MIN) { largados++; continue; }

        // Diagnóstico: quão radial é esta face. Perto de 90° são paredes de sulco.
        const gcen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
        const cos = Math.abs(n[0] * gcen[0] + n[1] * gcen[1] + n[2] * gcen[2]) /
            ((Math.hypot(n[0], n[1], n[2]) * Math.hypot(gcen[0], gcen[1], gcen[2])) || 1);
        if (cos < 0.2) paredes++;

        for (const vi of t) {
            let li = mapa.get(vi);
            if (li === undefined) { li = locais.length; mapa.set(vi, li); locais.push(vi); }
            indices.push(li);
        }
    }

    if (indices.length === 0) continue;
    if (locais.length > 65535) throw new Error('grupo com vértices a mais para Uint16');
    totalTri += indices.length / 3;

    const pos = new Int16Array(locais.length * 3);
    for (let i = 0; i < locais.length; i++) {
        const q = qi(locais[i]);
        pos[i * 3] = q[0]; pos[i * 3 + 1] = q[1]; pos[i * 3 + 2] = q[2];
    }

    partes.push({
        material: g.material,
        vertices: locais.length,
        triangulos: indices.length / 3,
        pos: Buffer.from(pos.buffer).toString('base64'),
        idx: Buffer.from(new Uint16Array(indices).buffer).toString('base64')
    });
    console.log('  ' + g.material.padEnd(10) + locais.length + ' vertices, ' + (indices.length / 3) + ' triangulos');
}

console.log('degenerados   : ' + largados + ' triangulos largados');
console.log('paredes sulco : ' + paredes + ' faces quase perpendiculares ao raio (' +
    (paredes / (totalTri || 1) * 100).toFixed(1) + '%) - winding preservado por causa delas');
console.log('triangulos    : ' + totalTri);

const saida = `/*
Malha da bola, convertida de assets/Ball.obj.

GERADA POR SCRIPT — não editar à mão.

Vem num <script> em vez de ser carregada por um loader porque o browser bloqueia
fetch/XHR em file://, e este projecto é aberto sem servidor.

Formato: por cada material do OBJ (o modelo separa os painéis em branco e
preto), as posições em Int16 normalizado (÷32767 = raio 1) e os índices em
Uint16, ambos em base64.

O OBJ não traz UVs nem normais. As normais são calculadas em
Match.criarBolaDaMalha a partir da própria posição — exacto para a superfície da
bola, aproximado nas paredes dos sulcos entre painéis (8% das faces), o que a
esta escala não se vê. O winding do OBJ é inconsistente e foi deixado como está;
o material usa DoubleSide, por isso não importa.
*/
const BallMesh = {
    partes: [
${partes.map(p => `        {
            material: ${JSON.stringify(p.material)},
            vertices: ${p.vertices},
            triangulos: ${p.triangulos},
            pos: "${p.pos}",
            idx: "${p.idx}"
        }`).join(',\n')}
    ],

    _bytes: function (b64) {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    },

    // Posições em Float32, já escaladas para o raio pedido.
    posicoes: function (parte, raio) {
        const crus = new Int16Array(this._bytes(parte.pos).buffer);
        const out = new Float32Array(crus.length);
        const k = raio / 32767;
        for (let i = 0; i < crus.length; i++) out[i] = crus[i] * k;
        return out;
    },

    indices: function (parte) {
        return new Uint16Array(this._bytes(parte.idx).buffer);
    }
};
`;

fs.writeFileSync(ROOT + '/assets/ball_mesh.js', saida);
console.log('escrito       : assets/ball_mesh.js  (' +
    (fs.statSync(ROOT + '/assets/ball_mesh.js').size / 1024).toFixed(0) + ' KB)');
