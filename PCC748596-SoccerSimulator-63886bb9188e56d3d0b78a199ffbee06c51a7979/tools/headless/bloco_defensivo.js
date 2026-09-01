/*
ONDE ESTÃO OS ALVOS quando a equipa DEFENDE, por função — e o que a
mentalidade lhes faz.

Uso: node tools/headless/bloco_defensivo.js [estilo] [segundos]
     estilo: muito_defensiva | defesa | balanceado | ataque | muito_ofensiva
*/
require('./harness.js');

const estilo = process.argv[2] || 'defesa';
const segundos = Number(process.argv[3] || 300);
const dt = 1 / 60;

const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);

/*
Mentalidade pedida. Escreve-se no SELECT e chama-se o `Tatics.update()`, que é
o caminho do painel — pôr `Tatics.estilo` à mão não chega: qualquer
`Tatics.update()` posterior relê o valor do DOM e desfaz.
*/
const sel = document.getElementById('t-estilo');
if (!sel) throw new Error('select t-estilo não existe no body carregado');
sel.value = estilo;
if (sel.value !== estilo) throw new Error('o select não tem a opção ' + estilo);
Tatics.update();
if (Tatics.estilo !== estilo) throw new Error('Tatics.estilo ficou ' + Tatics.estilo);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const dados = {};
const reg = (chave, campo, valor) => {
    if (!dados[chave]) dados[chave] = {};
    (dados[chave][campo] = dados[chave][campo] || []).push(valor);
};

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 6) continue;
    for (const [eq, lista] of [['TeamA', Match.players], ['TeamB', Match.opponents]]) {
        const bb = (typeof TeamAI !== 'undefined') ? TeamAI.get(eq) : null;
        if (!bb) continue;
        const fase = bb.isAttacking ? 'ataque' : 'DEFESA';
        for (const p of lista) {
            if (p.role === 'gk') continue;
            const chave = `${p.role} ${fase}`;
            // Tudo no referencial de ataque DELE: negativo = no seu próprio meio-campo.
            reg(chave, 'pos', p.model.position.z * p.dirZ);
            if (p.dynamicTarget) reg(chave, 'alvo', p.dynamicTarget.z * p.dirZ);
            if (p.postoBase) reg(chave, 'posto', p.postoBase.z * p.dirZ);
            reg(chave, 'bola', bb.ballZ * bb.dir);
            /*
            RELATIVO À BOLA. Comparar profundidades absolutas entre corridas
            não diz nada: a bola está noutro sítio em cada uma, e o bloco
            segue-a. O que a Mentalidade mexe é a distância do bloco À BOLA.
            */
            if (p.dynamicTarget) reg(chave, 'alvoRelBola', p.dynamicTarget.z * p.dirZ - bb.ballZ * bb.dir);
            if (bb.bloco) reg(chave, 'centroBlocoRelBola',
                ((bb.bloco.z0 + bb.bloco.z1) / 2) * bb.dir - bb.ballZ * bb.dir);
        }
    }
}

const mediana = (xs) => {
    const o = xs.slice().sort((a, b) => a - b);
    return o.length ? o[Math.floor(o.length / 2)] : NaN;
};

console.log('');
console.log(`MENTALIDADE "${estilo}" — profundidade no referencial de ataque de cada um`);
console.log('  (0 = meio-campo; negativo = no seu próprio meio-campo; +53 = baliza adversária)');
console.log('');
console.log('  função/fase          n    posição     alvo    posto   |   bola  |  alvo-bola  centroBloco-bola');
for (const k of Object.keys(dados).sort()) {
    const d = dados[k];
    console.log(`  ${k.padEnd(16)} ${String(d.pos.length).padStart(5)}  ` +
        `${mediana(d.pos).toFixed(1).padStart(8)}  ${mediana(d.alvo || [NaN]).toFixed(1).padStart(7)}  ` +
        `${mediana(d.posto || [NaN]).toFixed(1).padStart(7)}   |  ${mediana(d.bola).toFixed(1).padStart(6)}  |  ` +
        `${mediana(d.alvoRelBola || [NaN]).toFixed(1).padStart(9)}  ${mediana(d.centroBlocoRelBola || [NaN]).toFixed(1).padStart(16)}`);
}
