/*
Torcida viva: a bancada que reage ao jogo.

O movimento do público vive todo no vertex shader (ver o cabeçalho do
js/crowd.js), portanto não há como o ver correr sem GPU. O que se testa aqui é
tudo o que ALIMENTA o shader, que é onde os erros doem:

  - as quatro poses dão exactamente o mesmo número de vértices — a invariante
    do morph, e a única cujo incumprimento faz os adeptos explodirem em picos;
  - os atributos de morph estão lá, com a contagem certa;
  - as quatro poses são MESMO diferentes (um erro que gerasse quatro poses
    iguais deixava a bancada estática sem partir nada);
  - as regras do CrowdTrigger: golo, ataque, repouso;
  - a histerese não deixa a bancada piscar com a bola a entrar e a sair do
    terço;
  - os atributos por instância são determinísticos e coerentes entre canais.
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
     return { Crowd, CrowdModel, CrowdTrigger };`)(...Object.values(amb));
const { Crowd, CrowdModel, CrowdTrigger } = mod;

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/* Lugares sintéticos: os do jogo não interessam, o que se testa é o Crowd. */
function lugaresDeTeste() {
    const L = [];
    const CAMPO_LARG = 68, CAMPO_COMP = 106;
    for (let fila = 0; fila < 34; fila++) {
        const y = 1.0 + fila * 0.45;
        const rec = fila * 0.8;
        for (let z = -CAMPO_COMP / 2 - 4; z <= CAMPO_COMP / 2 + 4; z += 0.62) {
            L.push({ x: CAMPO_LARG / 2 + 6 + rec, y, z, rotY: -Math.PI / 2 });
            L.push({ x: -(CAMPO_LARG / 2 + 6 + rec), y, z, rotY: Math.PI / 2 });
        }
        for (let x = -CAMPO_LARG / 2 - 4; x <= CAMPO_LARG / 2 + 4; x += 0.62) {
            L.push({ x, y, z: CAMPO_COMP / 2 + 6 + rec, rotY: Math.PI });
            L.push({ x, y, z: -(CAMPO_COMP / 2 + 6 + rec), rotY: 0 });
        }
    }
    return L;
}

/*
1 — A INVARIANTE DO MORPH: as quatro poses, mesma contagem de vértices.
*/
console.log('\n1 — as quatro poses e o morph');
{
    const porPose = {};
    for (const nome in CrowdModel.poses) {
        porPose[nome] = Crowd._geometriasDaPose(CrowdModel.poses[nome]);
    }
    const canais = Object.keys(porPose.sentado).sort();

    for (const canal of canais) {
        const contagens = {};
        for (const nome in porPose) {
            contagens[nome] = porPose[nome][canal].attributes.position.count;
        }
        const valores = Object.values(contagens);
        const iguais = valores.every(v => v === valores[0]);
        if (!iguais) {
            erro(`canal ${canal}: contagens diferentes entre poses — ` +
                JSON.stringify(contagens));
        }
    }
    if (!falhas) ok(`as 4 poses dão a mesma contagem de vértices nos ${canais.length} canais`);

    // As poses têm de ser MESMO diferentes.
    const alt = (g) => {
        g.computeBoundingBox();
        return g.boundingBox.max.y - g.boundingBox.min.y;
    };
    const altSentado = alt(porPose.sentado.pele);
    const altDePe = alt(porPose.dePe.pele);
    const altFesta = alt(porPose.festa.pele);

    console.log(`  altura da silhueta: sentado ${altSentado.toFixed(2)} m, ` +
        `de pé ${altDePe.toFixed(2)} m, festa ${altFesta.toFixed(2)} m`);

    /*
    1.15 e não 1.5: a "altura sentada" aqui é da PLANTA DO PÉ ao topo da
    cabeça, e os pés estão no chão à frente do degrau, não no assento. Medido
    assim, um adulto sentado tem cerca de 4/5 da altura a que fica de pé — o
    que muda é sobretudo a perna, que passa de dobrada a esticada. Um limiar
    mais alto exigiria uma pose de pé irrealista.
    */
    if (!(altDePe > altSentado * 1.15)) {
        erro(`de pé (${altDePe.toFixed(2)}) devia ser bem mais alto do que ` +
            `sentado (${altSentado.toFixed(2)})`);
    } else ok(`a pose de pé é ${(altDePe / altSentado).toFixed(2)}× a sentada`);

    if (!(altFesta > altDePe * 1.05)) {
        erro(`festa (${altFesta.toFixed(2)}) devia ser mais alta do que de pé ` +
            `(${altDePe.toFixed(2)}) — os braços não estão acima da cabeça`);
    } else ok('a pose de festa tem os braços acima da cabeça');

    // A pose idle tem de diferir da sentada, senão a oscilação de repouso não
    // move nada e a bancada fica a fotografia que era.
    const a = porPose.sentado.pele.attributes.position.array;
    const b = porPose.idle.pele.attributes.position.array;
    let maxDif = 0;
    for (let i = 0; i < a.length; i++) maxDif = Math.max(maxDif, Math.abs(a[i] - b[i]));
    if (maxDif < 0.01) {
        erro(`a pose idle é igual à sentada (desvio máximo ${maxDif.toFixed(4)} m) — ` +
            'a oscilação de repouso não moveria nada');
    } else ok(`a pose idle difere da sentada em até ${maxDif.toFixed(3)} m`);
}

/*
2 — Os atributos de morph chegam à geometria final.
*/
console.log('\n2 — os atributos na geometria final');
{
    const geos = Crowd.geometrias();
    const esperados = ['aPosIdle', 'aPosDePe', 'aPosFesta', 'aNorIdle', 'aNorDePe', 'aNorFesta'];
    for (const canal in geos) {
        const g = geos[canal];
        const n = g.attributes.position.count;
        for (const nome of esperados) {
            if (!g.attributes[nome]) { erro(`canal ${canal}: falta o atributo ${nome}`); continue; }
            if (g.attributes[nome].count !== n) {
                erro(`canal ${canal}: ${nome} tem ${g.attributes[nome].count} ` +
                    `vértices e position tem ${n}`);
            }
        }
    }
    ok(`${esperados.length} atributos de morph presentes e alinhados em todos os canais`);
}

/*
3 — As regras do CrowdTrigger.
*/
console.log('\n3 — as regras (golo, ataque, repouso)');
{
    const T = CrowdTrigger;

    // Golo do TeamA: a claque A toda de pé a festejar, a B sentada.
    T.reset();
    let r = T.avaliar({ estado: 'GOAL', posse: null, bolaZ: 40, equipaQueMarcou: 'TeamA', dt: 0.016 });
    if (r.A !== CrowdModel.fraccaoGolo) erro(`golo do TeamA: claque A em ${r.A}, esperado ${CrowdModel.fraccaoGolo}`);
    if (r.B !== 0) erro(`golo do TeamA: claque B em ${r.B}, esperado 0`);
    if (r.festa !== 'A') erro(`golo do TeamA: festa em '${r.festa}', esperado 'A'`);
    else ok('golo do TeamA: claque A toda de pé a festejar, claque B sentada');

    T.reset();
    r = T.avaliar({ estado: 'GOAL', posse: null, bolaZ: -40, equipaQueMarcou: 'TeamB', dt: 0.016 });
    if (r.B !== CrowdModel.fraccaoGolo || r.A !== 0 || r.festa !== 'B') {
        erro(`golo do TeamB: A=${r.A} B=${r.B} festa=${r.festa}`);
    } else ok('golo do TeamB: simétrico');

    // Repouso: ninguém ataca, e a minoria fixa fica de pé.
    T.reset();
    r = T.avaliar({ estado: 'PLAY', posse: 'TeamA', bolaZ: 0, equipaQueMarcou: null, dt: 0.016 });
    if (r.A !== CrowdModel.fraccaoRepouso || r.B !== CrowdModel.fraccaoRepouso) {
        erro(`repouso: A=${r.A} B=${r.B}, esperado ${CrowdModel.fraccaoRepouso} nos dois`);
    } else if (r.festa !== null) {
        erro('repouso: não devia haver festa');
    } else ok(`repouso: ${CrowdModel.fraccaoRepouso} nas duas claques, sem festa`);

    /*
    Ataque do TeamA. O TeamA ataca para z positivo (a baliza do TeamA é a de z
    negativo — ver a detecção de golo em match.js).
    */
    T.reset();
    const ataqueA = { estado: 'PLAY', posse: 'TeamA', bolaZ: 40, equipaQueMarcou: null, dt: 0.1 };
    for (let i = 0; i < 10; i++) r = T.avaliar(ataqueA);
    if (r.A !== CrowdModel.fraccaoAtaque) {
        erro(`ataque do TeamA: claque A em ${r.A}, esperado ${CrowdModel.fraccaoAtaque}`);
    } else if (r.B !== CrowdModel.fraccaoRepouso) {
        erro(`ataque do TeamA: claque B em ${r.B} — quem defende não se levanta`);
    } else ok('ataque do TeamA: metade da claque A de pé, claque B em repouso');

    // Posse do adversário no mesmo sítio do campo: ninguém se levanta.
    T.reset();
    const posseErrada = { estado: 'PLAY', posse: 'TeamB', bolaZ: 40, equipaQueMarcou: null, dt: 0.1 };
    for (let i = 0; i < 10; i++) r = T.avaliar(posseErrada);
    if (r.A !== CrowdModel.fraccaoRepouso || r.B !== CrowdModel.fraccaoRepouso) {
        erro(`bola no terço do TeamA mas com posse do TeamB: A=${r.A} B=${r.B}`);
    } else ok('bola no terço mas sem posse: ninguém se levanta');
}

/*
4 — A histerese.
*/
console.log('\n4 — a histerese');
{
    const T = CrowdTrigger;
    const dt = 0.1;

    /*
    Bola a entrar e sair do terço a cada frame — a disputa em cima da linha que
    fazia a bancada piscar. A fracção tem de ficar quieta.
    */
    T.reset();
    let mudou = 0, anterior = null;
    for (let i = 0; i < 60; i++) {
        const r = T.avaliar({
            estado: 'PLAY', posse: 'TeamA',
            bolaZ: (i % 2 === 0) ? CrowdModel.tercoZ + 2 : CrowdModel.tercoZ - 2,
            equipaQueMarcou: null, dt: dt
        });
        if (anterior !== null && r.A !== anterior) mudou++;
        anterior = r.A;
    }
    if (mudou > 1) {
        erro(`a bancada piscou ${mudou} vezes com a bola a saltar a linha do terço`);
    } else ok(`bola a entrar e sair do terço 60 frames: ${mudou} mudança(s) de fracção`);

    /*
    Condição sustentada: a claque levanta-se, e depois de o ataque acabar
    demora a sentar-se — não cai no frame seguinte.
    */
    T.reset();
    const dentro = { estado: 'PLAY', posse: 'TeamA', bolaZ: 40, equipaQueMarcou: null, dt: dt };
    let r = null;
    for (let i = 0; i < 20; i++) r = T.avaliar(dentro);
    if (r.A !== CrowdModel.fraccaoAtaque) erro('condição sustentada não levantou a claque');
    else ok('condição sustentada levanta a claque');

    const fora = { estado: 'PLAY', posse: 'TeamB', bolaZ: 0, equipaQueMarcou: null, dt: dt };
    r = T.avaliar(fora);
    if (r.A !== CrowdModel.fraccaoAtaque) {
        erro('a claque sentou-se no primeiro frame sem ataque — falta a permanência');
    } else ok('a claque não se senta no primeiro frame sem ataque');

    // Passado o tempo de saída, senta-se.
    for (let i = 0; i < 60; i++) r = T.avaliar(fora);
    if (r.A !== CrowdModel.fraccaoRepouso) {
        erro(`a claque ficou de pé (${r.A}) muito depois de o ataque acabar`);
    } else ok('passado o tempo de saída, a claque senta-se');

    // Entrar exige tempo: um único frame com a condição não chega.
    T.reset();
    r = T.avaliar({ estado: 'PLAY', posse: 'TeamA', bolaZ: 40, equipaQueMarcou: null, dt: 0.016 });
    if (r.A !== CrowdModel.fraccaoRepouso) {
        erro('a claque levantou-se num único frame — a entrada não está a esperar');
    } else ok('um frame isolado no terço não levanta a claque');
}

/*
5 — Os atributos por instância: determinismo e coerência entre canais.
*/
console.log('\n5 — os atributos por instância');
{
    const lugares = lugaresDeTeste();
    const m1 = Crowd.build(new THREE.Object3D(), lugares);
    const canais = Object.keys(m1);

    // Os quatro canais têm de partilhar os MESMOS valores: senão a camisa
    // levantava-se e a cabeça ficava sentada.
    const ref = m1.pele.geometry.attributes;
    for (const canal of canais) {
        for (const nome of ['aLimiar', 'aFase', 'aRitmo', 'aClaque']) {
            const a = m1[canal].geometry.attributes[nome];
            if (!a) { erro(`canal ${canal}: falta o atributo de instância ${nome}`); continue; }
            if (a.array !== ref[nome].array) {
                erro(`canal ${canal}: ${nome} não partilha o array com o canal pele`);
            }
        }
    }
    ok('os quatro canais partilham os atributos por instância');

    // O limiar tem de estar espalhado em 0..1, senão a fracção não separa nada.
    const lim = ref.aLimiar.array;
    let abaixo = 0;
    for (let i = 0; i < lim.length; i++) if (lim[i] < CrowdModel.fraccaoAtaque) abaixo++;
    const pct = abaixo / lim.length;
    console.log(`  com fracção ${CrowdModel.fraccaoAtaque}: ${(pct * 100).toFixed(1)}% da bancada de pé`);
    if (Math.abs(pct - CrowdModel.fraccaoAtaque) > 0.02) {
        erro(`a fracção ${CrowdModel.fraccaoAtaque} levanta ${(pct * 100).toFixed(1)}% — ` +
            'o limiar não está uniforme em 0..1');
    } else ok('a fracção de ataque levanta mesmo metade da bancada');

    // As claques só têm dois valores, 0 e 1.
    const cl = ref.aClaque.array;
    let mau = 0;
    for (let i = 0; i < cl.length; i++) if (cl[i] !== 0 && cl[i] !== 1) mau++;
    if (mau) erro(`${mau} instâncias com aClaque fora de {0,1}`);
    else ok('aClaque só tem 0 e 1');

    // Determinismo: dois builds dão os mesmos valores.
    const m2 = Crowd.build(new THREE.Object3D(), lugares);
    const lim2 = m2.pele.geometry.attributes.aLimiar.array;
    let dif = 0;
    for (let i = 0; i < lim.length; i++) if (lim[i] !== lim2[i]) dif++;
    if (dif) erro(`${dif} limiares diferentes entre dois builds — a bancada não é reprodutível`);
    else ok('dois builds dão a mesma bancada');
}

/*
6 — O update por frame não toca em matrizes.
*/
console.log('\n6 — o custo por frame');
{
    const meshes = Crowd._meshes;
    let escritas = 0;
    for (const canal in meshes) {
        const orig = meshes[canal].setMatrixAt.bind(meshes[canal]);
        meshes[canal].setMatrixAt = function (...a) { escritas++; return orig(...a); };
    }
    // Sem `Match` definido o update só avança o tempo, que é o caso mínimo.
    for (let i = 0; i < 120; i++) Crowd.update(1 / 60);
    if (escritas) erro(`${escritas} escritas de matriz em 120 frames — devia ser 0`);
    else ok('120 frames: 0 escritas de matriz de instância');

    if (Math.abs(Crowd._uniforms.uTempo.value - 2.0) > 1e-6) {
        erro(`uTempo em ${Crowd._uniforms.uTempo.value}, esperado 2.0`);
    } else ok('uTempo avança com o dt');
}

console.log('');
if (falhas) {
    console.error(`FALHOU: ${falhas} problema(s).`);
    process.exit(1);
}
console.log('OK: a bancada reage ao jogo — morph coerente, regras e histerese no sítio.');
