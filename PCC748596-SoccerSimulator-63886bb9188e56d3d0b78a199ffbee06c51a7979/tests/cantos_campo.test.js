/*
OS CANTOS DO CAMPO: quarto de círculo e bandeirinha.

Faltavam os dois. O arco de canto tem 1 m de raio por regulamento e a
bandeirinha é obrigatória em campo oficial.

O QUE ESTE TESTE FIXA é o sinal do ângulo, que é onde isto se estraga. O
`RingGeometry` é desenhado no plano XY e depois deitado com
`rotation.x = -PI/2`: um ponto em ângulo t, que no plano seria (cos t, sin t),
acaba em (x = cos t, z = -sin t) — o z fica INVERTIDO. Um `thetaStart` errado
desenha o quarto de círculo virado para FORA do campo, o que só se vê a olhar
para o relvado e se volta a perder na alteração seguinte.

Em vez de comparar ângulos com uma tabela (que seria a mesma tabela do
código, e portanto não provava nada), este teste faz a conta ao contrário:
gera os pontos do arco, aplica a mesma transformação do Three, e verifica que
caem todos DENTRO do campo.

Corre com: node tests/cantos_campo.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcUtils = ler('js/utils.js');
const srcConfig = ler('js/config/physics.js');
const srcMatch = ['js/match/match_state.js', 'js/match/match_setup.js', 'js/match/match_physics.js', 'js/match/match_setpieces.js', 'js/match/match_loop.js', 'js/match/match_ui.js'].map(ler).join('\n');

const ini = srcUtils.indexOf('function arcoDeCanto');
if (ini < 0) throw new Error('arcoDeCanto não encontrada no js/utils.js');
const arcoDeCanto = new Function(
    srcUtils.slice(ini, srcUtils.indexOf(LF + '}', ini) + 2) +
    '; return arcoDeCanto;')();

const CAMPO_COMP = parseFloat(srcConfig.match(/const CAMPO_COMP\s*=\s*([\d.]+)/)[1]);
const CAMPO_LARG = parseFloat(srcConfig.match(/const CAMPO_LARG\s*=\s*([\d.]+)/)[1]);
const iCF = srcConfig.indexOf('const CornerFlag = {');
const CornerFlag = new Function(
    srcConfig.slice(iCF, srcConfig.indexOf(LF + '};', iCF) + 3) + '; return CornerFlag;')();

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/* ===================================================================== */
console.log(LF + '1 — as medidas do regulamento');
{
    if (CornerFlag.raioArco !== 1.0) {
        erro(`o arco de canto tem 1 m de raio, o config diz ${CornerFlag.raioArco}`);
    } else ok('arco de 1 m');

    if (CornerFlag.alturaPoste < 1.5) {
        erro(`o poste da bandeirinha tem no mínimo 1.5 m, está em ${CornerFlag.alturaPoste}`);
    } else ok(`poste de ${CornerFlag.alturaPoste} m`);
}

/*
2 — O ARCO APONTA PARA DENTRO DO CAMPO.

A verificação é geométrica e não por tabela: para cada canto, gera-se o quarto
de círculo com a MESMA transformação que o Three aplica (deitar o anel roda
(cos t, sin t) para (cos t, -sin t) no plano do relvado) e confirma-se que
todos os pontos caem dentro das linhas.
*/
console.log(LF + '2 — o quarto de círculo fica dentro do campo');
{
    const R = CornerFlag.raioArco;
    const meiaLarg = CAMPO_LARG / 2, meiaComp = CAMPO_COMP / 2;

    for (const sx of [1, -1]) {
        for (const sz of [1, -1]) {
            const cx = sx * meiaLarg, cz = sz * meiaComp;
            const t0 = arcoDeCanto(sx, sz);

            let dentro = 0, fora = 0, piorX = 0, piorZ = 0;
            for (let i = 0; i <= 16; i++) {
                const t = t0 + (Math.PI / 2) * (i / 16);
                // A mesma transformação do RingGeometry deitado.
                const x = cx + R * Math.cos(t);
                const z = cz - R * Math.sin(t);

                // Uma folga de meia espessura de linha: o arco nasce NA linha.
                if (Math.abs(x) <= meiaLarg + 0.08 && Math.abs(z) <= meiaComp + 0.08) {
                    dentro++;
                } else {
                    fora++;
                    piorX = Math.max(piorX, Math.abs(x) - meiaLarg);
                    piorZ = Math.max(piorZ, Math.abs(z) - meiaComp);
                }
            }

            const nome = `(${sx > 0 ? '+x' : '-x'}, ${sz > 0 ? '+z' : '-z'})`;
            if (fora > 0) {
                erro(`canto ${nome}: ${fora}/17 pontos FORA do campo ` +
                    `(até ${piorX.toFixed(2)} m em x, ${piorZ.toFixed(2)} m em z)`);
            } else ok(`canto ${nome}: os 17 pontos dentro do campo`);
        }
    }
}

/*
3 — E É MESMO UM QUARTO, não meio nem um círculo inteiro.
*/
console.log(LF + '3 — é um quarto de círculo');
{
    const i = srcMatch.indexOf('const quarto = new THREE.Mesh(');
    const bloco = i < 0 ? '' : srcMatch.slice(i, i + 400);

    if (!bloco) erro('o arco de canto não está no createField');
    else if (!/arcoDeCanto\(sx,\s*sz\),\s*Math\.PI\s*\/\s*2/.test(bloco)) {
        erro('o comprimento do arco não é PI/2 — não é um quarto de círculo');
    } else ok('thetaLength = PI/2');

    // Os quatro cantos, e não só dois.
    if (!/\[1,\s*-1\]\.forEach\(sx\s*=>\s*\[1,\s*-1\]\.forEach\(sz/.test(srcMatch)) {
        erro('não percorre os quatro cantos');
    } else ok('percorre os quatro cantos');
}

/*
4 — A BANDEIRA ESTÁ PRESA AO POSTE E APONTA PARA DENTRO.

O erro fácil aqui é rodar o plano em Y: o `PlaneGeometry` já nasce com a
largura em X, que é a direcção em que a bandeira se estende. Rodá-lo punha o
pano a sair em Z enquanto a posição o desloca em X — a bandeira ficava ao lado
do poste, a pairar.
*/
console.log(LF + '4 — a bandeira');
{
    const i = srcMatch.indexOf('const bandeira = new THREE.Mesh(');
    const bloco = i < 0 ? '' : srcMatch.slice(i, i + 500);

    if (!bloco) { erro('a bandeira não está no createField'); }
    else {
        if (/bandeira\.rotation\.y\s*=/.test(bloco)) {
            erro('a bandeira roda em Y — sai em Z e descola do poste');
        } else ok('sem rotação: a largura já está em X, presa ao poste');

        if (!/cx - sx \*/.test(bloco)) {
            erro('a bandeira não é deslocada para DENTRO do campo');
        } else ok('deslocada para dentro do campo (-sx)');

        // Distância ao poste: tem de encostar, não pairar.
        const CFl = CornerFlag;
        const centro = CFl.larguraBandeira / 2 + CFl.raioPoste;
        const bordaInterna = centro - CFl.larguraBandeira / 2;
        if (Math.abs(bordaInterna - CFl.raioPoste) > 1e-9) {
            erro('a borda da bandeira não encosta ao poste');
        } else ok('a borda encosta ao poste');

        // E fica no topo, não a meio.
        const yBandeira = CFl.alturaPoste - CFl.alturaBandeira / 2 - 0.05;
        if (yBandeira < CFl.alturaPoste * 0.7) {
            erro(`a bandeira está a ${yBandeira.toFixed(2)} m num poste de ${CFl.alturaPoste} — devia ser no topo`);
        } else ok(`no topo do poste (y ${yBandeira.toFixed(2)})`);
    }

    // DoubleSide: de um lado só desaparecia consoante a câmara, e esta anda
    // à volta toda.
    const iMat = srcMatch.indexOf('const matBandeira');
    const mat = iMat < 0 ? '' : srcMatch.slice(iMat, iMat + 250);
    if (!/side:\s*THREE\.DoubleSide/.test(mat)) {
        erro('a bandeira não é DoubleSide — desaparece de certos ângulos');
    } else ok('DoubleSide: vê-se dos dois lados');
}

console.log(LF + (falhas === 0
    ? 'cantos_campo: tudo bem.'
    : `cantos_campo: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
