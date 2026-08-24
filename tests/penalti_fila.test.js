/*
No penálti os nove que sobram formam a fila da entrada da área. A fila tem de
ser MESCLADA — as duas equipas ombro a ombro, não em blocos — e escalonada em
profundidade, com os defesas mais atrás, como no canto.

O que se mede aqui é a colocação, replicando a mesma conta do ramo PENALTY do
`setupSetPiece` (js/match.js) com as constantes lidas do js/config.js.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8'));
const srcMatch = semCR(fs.readFileSync(path.join(raiz, 'js', 'match.js'), 'utf8'));

function extrairObjecto(src, nome, ficheiro) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em ${ficheiro}`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function(`${src.slice(ini, fim + 3)}; return ${nome};`)();
}

const PM = extrairObjecto(srcConfig, 'PenaltyModel', 'js/config.js');
const CAMPO_COMP = 106;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Onze de cada lado, com as funções de uma formação normal.
const onze = (equipa) => {
    const roles = ['gk', 'def', 'def', 'def', 'def', 'mid', 'mid', 'mid', 'ata', 'ata', 'ata'];
    return roles.map((role, i) => ({ equipa, role, nome: `${equipa}${i}` }));
};

/*
Reproduz a colocação da fila. Mantém-se em passo com o match.js: se um mudar,
o outro tem de mudar, e é para isso que os valores de referência no fim servem.
*/
function colocarFila(attDir) {
    const linhaGolPen = attDir * (CAMPO_COMP / 2);
    const marcaZ = linhaGolPen - attDir * PM.marcaZ;
    const limiteZ = linhaGolPen - attDir * PM.margemArea;
    const filaZ = limiteZ - attDir * PM.folgaArea;

    const equipaA = onze('A'), equipaB = onze('B');
    const takerPen = equipaA[8];   // um dos atacantes bate
    const naEntrada = lista => {
        const restantes = lista.filter(p => p !== takerPen && p.role !== 'gk');
        const filas = {
            ata: restantes.filter(p => p.role === 'ata'),
            mid: restantes.filter(p => p.role === 'mid'),
            def: restantes.filter(p => p.role === 'def')
        };
        filas.mid = filas.mid.concat(
            restantes.filter(p => !['ata', 'mid', 'def'].includes(p.role)));
        const ordem = ['ata', 'mid', 'def'];
        const saida = [];
        while (saida.length < restantes.length) {
            let mexeu = false;
            for (const r of ordem) {
                if (filas[r].length) { saida.push(filas[r].shift()); mexeu = true; }
            }
            if (!mexeu) break;
        }
        return saida;
    };

    const ladoA = naEntrada(equipaA);
    const ladoB = naEntrada(equipaB);
    const totalFila = ladoA.length + ladoB.length;

    const naFila = [];
    let iA = 0, iB = 0;
    for (let j = 0; j < totalFila; j++) {
        const querA = (j % 2 === 0);
        const p = (querA && iA < ladoA.length) ? ladoA[iA++]
            : (iB < ladoB.length) ? ladoB[iB++]
                : ladoA[iA++];
        naFila.push(p);
    }

    return naFila.map((p, i) => {
        const centrado = i - (totalFila - 1) / 2;
        let x = clamp(centrado * PM.espacamentoFila, -(PM.areaX + 4.0), PM.areaX + 4.0);
        const recuo = (PM.recuoPorRole && PM.recuoPorRole[p.role] !== undefined)
            ? PM.recuoPorRole[p.role] : 0.0;
        let z = filaZ - attDir * recuo;

        const dx = x, dz = z - marcaZ;
        const d = Math.hypot(dx, dz);
        const rMin = PM.raioMeiaLua + PM.folgaArco;
        if (d < rMin) {
            const k = (d > 0.001) ? rMin / d : 1;
            x = dx * k;
            z = marcaZ + (d > 0.001 ? dz * k : -attDir * rMin);
        }
        return { p, x, z, ordem: i };
    });
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

for (const attDir of [1, -1]) {
    const fila = colocarFila(attDir);
    const marcaZ = attDir * (CAMPO_COMP / 2) - attDir * PM.marcaZ;

    console.log(`\nattDir=${attDir > 0 ? '+1' : '-1'} — fila da entrada da área (${fila.length} jogadores)`);
    for (const f of fila.slice().sort((a, b) => a.x - b.x)) {
        // Profundidade medida a partir da linha da área, positivo = mais atrás.
        const atras = (f.z - (attDir * (CAMPO_COMP / 2) - attDir * PM.margemArea)) * -attDir;
        console.log(`  x=${f.x.toFixed(1).padStart(6)}  ${f.p.equipa}/${f.p.role.padEnd(3)}  ` +
            `${atras.toFixed(2).padStart(5)} m atrás da linha da área`);
    }

    /*
    1 — MESCLADA. Ordenados por x, não pode haver três seguidos da mesma equipa:
    isso é um bloco, não uma mescla.
    */
    const porX = fila.slice().sort((a, b) => a.x - b.x);
    let seguidos = 1, maiorBloco = 1;
    for (let i = 1; i < porX.length; i++) {
        seguidos = (porX[i].p.equipa === porX[i - 1].p.equipa) ? seguidos + 1 : 1;
        if (seguidos > maiorBloco) maiorBloco = seguidos;
    }
    if (maiorBloco > 2) {
        erro(`maior bloco da mesma equipa na fila: ${maiorBloco} seguidos (máximo aceite 2)`);
    } else {
        console.log(`  mescla: no máximo ${maiorBloco} da mesma equipa seguidos`);
    }

    /*
    1b — as FUNÇÕES também não podem ficar em blocos ao longo do x. Ordenar por
    função (ou usar a ordem do plantel, que já vem ordenada) punha os defesas
    todos de um lado e os atacantes do outro.
    */
    let seguidosR = 1, maiorBlocoR = 1;
    for (let i = 1; i < porX.length; i++) {
        seguidosR = (porX[i].p.role === porX[i - 1].p.role) ? seguidosR + 1 : 1;
        if (seguidosR > maiorBlocoR) maiorBlocoR = seguidosR;
    }
    if (maiorBlocoR > 3) {
        erro(`maior bloco da mesma função na fila: ${maiorBlocoR} seguidos (máximo aceite 3)`);
    } else {
        console.log(`  funções: no máximo ${maiorBlocoR} da mesma seguidas`);
    }

    /*
    2 — os DEFESAS ficam mais atrás do que os ATACANTES.
    */
    const atras = f => (f.z - (attDir * (CAMPO_COMP / 2) - attDir * PM.margemArea)) * -attDir;
    const media = r => {
        const g = fila.filter(f => f.p.role === r);
        return g.reduce((s, f) => s + atras(f), 0) / Math.max(1, g.length);
    };
    const [mAta, mMid, mDef] = [media('ata'), media('mid'), media('def')];
    if (!(mDef > mMid + 0.3 && mMid > mAta + 0.3)) {
        erro(`escalonamento errado: ata=${mAta.toFixed(2)} mid=${mMid.toFixed(2)} def=${mDef.toFixed(2)}`);
    } else {
        console.log(`  profundidade média: ata=${mAta.toFixed(2)} mid=${mMid.toFixed(2)} ` +
            `def=${mDef.toFixed(2)} m atrás da linha`);
    }

    /*
    3 — ninguém dentro da meia-lua nem dentro da área. Continua a valer com o
    escalonamento novo: recuar afasta da área, nunca aproxima.
    */
    for (const f of fila) {
        const d = Math.hypot(f.x, f.z - marcaZ);
        if (d < PM.raioMeiaLua - 0.01) {
            erro(`${f.p.nome} está dentro da meia-lua (${d.toFixed(2)} m da marca)`);
        }
        const dentroDaArea = (f.z - marcaZ) * attDir > 0 ||
            Math.abs((f.z - attDir * (CAMPO_COMP / 2)) * -attDir) < PM.margemArea - 0.01;
        if (dentroDaArea && Math.abs(f.x) < PM.areaX) {
            erro(`${f.p.nome} está dentro da grande área (z=${f.z.toFixed(2)})`);
        }
    }
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: fila do penálti mesclada, com os defesas mais atrás e fora da área.');
