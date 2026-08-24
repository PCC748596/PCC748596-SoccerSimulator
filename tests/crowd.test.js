/*
Multidão: 15 000 adeptos com o modelo dos jogadores, sentados, em
InstancedMesh.

Corre o `js/crowd.js` a sério com o `three` de node, sobre lugares sintéticos
com a forma de um estádio, e mede o que se pode medir sem olhar para o ecrã:

  - quatro canais de cor, um InstancedMesh cada, todos com as MESMAS matrizes
    (é isso que faz as quatro peças coincidirem no mesmo corpo);
  - a pose está sentada — o corpo é mais baixo do que largo em Z, ao contrário
    de um boneco de pé;
  - as duas claques ficam nas duas pontas e mesclam-se no meio;
  - a construção é determinística: o estádio é igual em cada arranque.
*/
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const amb = { THREE, console };
const mod = new Function(...Object.keys(amb),
    `${ler('js/utils.js').match(/function mergeNonIndexedGeometries[\s\S]*?\n}\n/)[0]}
     ${ler('js/crowd.js')}
     return { Crowd, CrowdModel, mergeNonIndexedGeometries };`)(...Object.values(amb));
const { Crowd, CrowdModel } = mod;

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

/*
Lugares sintéticos com a forma das bancadas: quatro lados à volta do campo,
em degraus. Não são os do jogo — o que se testa é o Crowd, não o createField.
*/
function lugaresDeTeste() {
    const L = [];
    const CAMPO_LARG = 68, CAMPO_COMP = 106;
    for (let fila = 0; fila < 34; fila++) {
        const y = 1.0 + fila * 0.45;
        const rec = fila * 0.8;
        // Laterais (ao longo de Z).
        for (let z = -CAMPO_COMP / 2 - 4; z <= CAMPO_COMP / 2 + 4; z += 0.62) {
            L.push({ x: CAMPO_LARG / 2 + 6 + rec, y, z, rotY: -Math.PI / 2 });
            L.push({ x: -(CAMPO_LARG / 2 + 6 + rec), y, z, rotY: Math.PI / 2 });
        }
        // Topos (ao longo de X).
        for (let x = -CAMPO_LARG / 2 - 4; x <= CAMPO_LARG / 2 + 4; x += 0.62) {
            L.push({ x, y, z: CAMPO_COMP / 2 + 6 + rec, rotY: Math.PI });
            L.push({ x, y, z: -(CAMPO_COMP / 2 + 6 + rec), rotY: 0 });
        }
    }
    return L;
}

const lugares = lugaresDeTeste();
console.log(`lugares construídos: ${lugares.length} (pedidos ${CrowdModel.total} adeptos)`);
if (lugares.length < CrowdModel.total) {
    erro(`o teste só tem ${lugares.length} lugares — não chega para ${CrowdModel.total}`);
}

/*
1 — a geometria: quatro canais, e a pose é de quem está SENTADO.
*/
{
    const geos = Crowd.geometrias();
    const canais = Object.keys(geos).sort();
    console.log(`\ncanais de cor: ${canais.join(', ')}`);
    for (const esperado of ['pele', 'camisa', 'calcao', 'cabelo']) {
        if (!geos[esperado]) erro(`falta o canal '${esperado}'`);
    }

    let vertices = 0;
    for (const c of canais) vertices += geos[c].attributes.position.count;
    console.log(`vértices por adepto: ${vertices} (× ${CrowdModel.total} instâncias, ` +
        `mas a geometria é construída UMA vez)`);

    // Caixa envolvente do corpo inteiro.
    const caixa = new THREE.Box3();
    for (const c of canais) {
        geos[c].computeBoundingBox();
        caixa.union(geos[c].boundingBox);
    }
    const t = new THREE.Vector3();
    caixa.getSize(t);
    console.log(`tamanho do adepto sentado: ${t.x.toFixed(2)} × ${t.y.toFixed(2)} × ` +
        `${t.z.toFixed(2)} m (larg × alt × prof)`);

    /*
    SENTADO: um jogador de pé tem ~1.8 m de altura e ~0.3 m de profundidade.
    Sentado, a altura cai e a profundidade cresce, porque as coxas passam a
    apontar para a frente. É essa a assinatura da pose.
    */
    if (t.y > 1.45) erro(`altura ${t.y.toFixed(2)} m — está de pé, não sentado`);
    if (t.z < 0.45) erro(`profundidade ${t.z.toFixed(2)} m — as coxas não estão à frente`);
    if (t.y < 0.8) erro(`altura ${t.y.toFixed(2)} m — está agachado de mais`);
    console.log(`  (de pé seriam ~1.80 de altura e ~0.30 de profundidade)`);
}

/*
2 — os InstancedMesh: um por canal, todos com as MESMAS matrizes.

Se as matrizes divergissem, a camisa de um adepto apareceria no corpo de
outro — é esta partilha que faz o truque dos quatro meshes funcionar.
*/
let meshes;
{
    const cena = new THREE.Object3D();
    const t0 = Date.now();
    meshes = Crowd.build(cena, lugares);
    const ms = Date.now() - t0;

    const canais = Object.keys(meshes);
    console.log(`\n${canais.length} InstancedMesh criados em ${ms} ms ` +
        `(${meshes.pele.count} instâncias cada)`);

    if (meshes.pele.count !== CrowdModel.total) {
        erro(`${meshes.pele.count} instâncias em vez de ${CrowdModel.total}`);
    }
    if (cena.children.length !== canais.length) {
        erro(`${cena.children.length} filhos na cena, esperados ${canais.length}`);
    }

    const a = new THREE.Matrix4(), b = new THREE.Matrix4();
    let divergentes = 0;
    for (let i = 0; i < meshes.pele.count; i += 97) {
        meshes.pele.getMatrixAt(i, a);
        for (const c of canais) {
            if (c === 'pele') continue;
            meshes[c].getMatrixAt(i, b);
            for (let k = 0; k < 16; k++) {
                if (Math.abs(a.elements[k] - b.elements[k]) > 1e-9) { divergentes++; k = 16; }
            }
        }
    }
    if (divergentes > 0) erro(`${divergentes} instâncias com matrizes diferentes entre canais`);
    else console.log('matrizes idênticas entre os quatro canais');

    if (!meshes.camisa.instanceColor) erro('o mesh das camisas não tem cores por instância');
}

/*
3 — as duas claques: uma em cada ponta, mescladas no meio.
*/
{
    const cor = new THREE.Color();
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();

    // Divide o estádio em cinco faixas em Z e conta as camisas de cada claque.
    const faixas = 5;
    const conta = Array.from({ length: faixas }, () => ({ A: 0, B: 0 }));
    let zMin = Infinity, zMax = -Infinity;
    for (const l of lugares) { zMin = Math.min(zMin, l.z); zMax = Math.max(zMax, l.z); }

    const azul = new THREE.Color(CrowdModel.equipas.A.camisa);
    const vermelho = new THREE.Color(CrowdModel.equipas.B.camisa);

    for (let i = 0; i < meshes.camisa.count; i++) {
        meshes.camisa.getMatrixAt(i, m);
        pos.setFromMatrixPosition(m);
        meshes.camisa.getColorAt(i, cor);

        // A cor leva variação por adepto; classifica-se pela mais próxima.
        const dA = Math.abs(cor.r - azul.r) + Math.abs(cor.g - azul.g) + Math.abs(cor.b - azul.b);
        const dB = Math.abs(cor.r - vermelho.r) + Math.abs(cor.g - vermelho.g) + Math.abs(cor.b - vermelho.b);

        const t = (pos.z - zMin) / (zMax - zMin);
        const f = Math.max(0, Math.min(faixas - 1, Math.floor(t * faixas)));
        conta[f][dA <= dB ? 'A' : 'B']++;
    }

    console.log('\ndistribuição das claques por faixa do estádio (topo -Z -> topo +Z)');
    conta.forEach((c, i) => {
        const tot = c.A + c.B;
        const pctA = tot ? (100 * c.A / tot) : 0;
        const barra = '#'.repeat(Math.round(pctA / 5)) + '.'.repeat(20 - Math.round(pctA / 5));
        console.log(`  faixa ${i + 1}: ${barra} ${pctA.toFixed(0)}% claque A, ` +
            `${(100 - pctA).toFixed(0)}% B  (${tot} adeptos)`);
    });

    const pct = conta.map(c => 100 * c.A / Math.max(1, c.A + c.B));
    if (pct[0] < 90) erro(`a primeira faixa devia ser quase toda da claque A, é ${pct[0].toFixed(0)}%`);
    if (pct[faixas - 1] > 10) erro(`a última faixa devia ser quase toda da B, tem ${pct[faixas - 1].toFixed(0)}% de A`);
    const meio = pct[Math.floor(faixas / 2)];
    if (meio < 15 || meio > 85) {
        erro(`a faixa do meio devia estar mesclada, tem ${meio.toFixed(0)}% de A`);
    }
    // E tem de descer sempre: sem transição via-se uma fronteira a direito.
    for (let i = 1; i < faixas; i++) {
        if (pct[i] > pct[i - 1] + 1) erro('a mescla não é monótona ao longo do estádio');
    }
}

/*
4 — determinismo: o estádio tem de ser igual em cada arranque. Com Math.random
mudava de cores a cada refresh e nenhuma comparação visual seria possível.
*/
{
    const c1 = new THREE.Color(), c2 = new THREE.Color();
    const m2 = Crowd.build(new THREE.Object3D(), lugares);
    let difs = 0;
    for (let i = 0; i < 500; i++) {
        const j = i * 29;
        meshes.camisa.getColorAt(j, c1);
        m2.camisa.getColorAt(j, c2);
        if (Math.abs(c1.r - c2.r) > 1e-9 || Math.abs(c1.g - c2.g) > 1e-9 ||
            Math.abs(c1.b - c2.b) > 1e-9) difs++;
    }
    if (difs > 0) erro(`${difs} adeptos mudaram de cor entre duas construções`);
    else console.log('\nconstrução determinística: mesmo estádio em cada arranque');
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: 15 000 adeptos sentados, em 4 InstancedMesh, com as duas claques no sítio.');
