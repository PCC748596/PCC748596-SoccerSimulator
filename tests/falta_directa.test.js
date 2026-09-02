/*
FALTA DIRECTA — a faixa, a barreira, o remate por cima dela e os doze desfechos.

O lance monta-se no ramo `FREE_KICK` do `setupSetPiece` e resolve-se em
`executarFalta` (player.js), no ramo do REMATE, mas toda a GEOMETRIA e o SORTEIO vivem em
funções puras do utils.js — é isso que permite varrer mil cobranças aqui sem
montar um jogo. O comportamento em campo (quem defende, quem sai pela linha de
fundo) mede-se com `node tools/headless/falta_directa.js`.

Corre com: node --test tests/falta_directa.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcFisica = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'physics.js'), 'utf8'));
const srcTiro = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'shooting.js'), 'utf8'));
const srcGK = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'goalkeeper.js'), 'utf8'));
const srcPlayer = semCR(fs.readFileSync(path.join(raiz, 'js', 'player.js'), 'utf8'));

const LARGURA_BALIZA = 7.32, ALTURA_BALIZA = 2.44;
const CAMPO_COMP = 106, CAMPO_LARG = 68;
const LINHA_FUNDO = CAMPO_COMP / 2, MEIA_LARGURA_CAMPO = CAMPO_LARG / 2;

function extrairObjecto(src, nome, extras) {
    const ini = src.indexOf(`const ${nome} = {`);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    const nomes = Object.keys(extras || {});
    return new Function(...nomes, `${src.slice(ini, fim + 3)}; return ${nome};`)
        (...nomes.map(n => extras[n]));
}

function extrairFuncao(src, nome) {
    const ini = src.indexOf(`function ${nome}(`);
    if (ini < 0) throw new Error(`${nome} não encontrada`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const BallPhysics = extrairObjecto(srcFisica, 'BallPhysics');
{
    const ini = srcFisica.indexOf('BallPhysics.area =');
    const fim = srcFisica.indexOf('/ BallPhysics.massa;', ini) + '/ BallPhysics.massa;'.length;
    new Function('BallPhysics', srcFisica.slice(ini, fim))(BallPhysics);
}
const Area = extrairObjecto(srcFisica, 'Area', { LINHA_FUNDO });
const DF = extrairObjecto(srcTiro, 'DirectFreeKickModel', { Area });
const GoalkeeperPose = extrairObjecto(srcGK, 'GoalkeeperPose',
    { LARGURA_BALIZA, ALTURA_BALIZA, Area, LINHA_FUNDO });

const nomesFn = ['velocidadeParaAlturaNoAlvo', 'velocidadeParaAlcance',
    'velocidadeRasteiraPara',
    'pontoDaFaltaDirecta', 'lugaresDaBarreira', 'alturaDaBolaEm',
    'bandaDaFaltaDirecta', 'desfechoDaFaltaDirecta', 'alvoDaFaltaDirecta',
    'tiroDaFaltaDirecta', 'tiroTensoDaFaltaDirecta',
    'lugaresDoApoioNaFaltaDirecta'];
const codigo = nomesFn.map(n => extrairFuncao(srcUtils, n)).join(LF + LF);
const fns = new Function(
    'BallPhysics', 'Area', 'DirectFreeKickModel',
    'LARGURA_BALIZA', 'ALTURA_BALIZA', 'LINHA_FUNDO', 'MEIA_LARGURA_CAMPO',
    `${codigo}; return { ${nomesFn.join(', ')} };`)(
        BallPhysics, Area, DF,
        LARGURA_BALIZA, ALTURA_BALIZA, LINHA_FUNDO, MEIA_LARGURA_CAMPO);

const { pontoDaFaltaDirecta, lugaresDaBarreira, alturaDaBolaEm,
    desfechoDaFaltaDirecta, alvoDaFaltaDirecta, tiroDaFaltaDirecta,
    tiroTensoDaFaltaDirecta, lugaresDoApoioNaFaltaDirecta } = fns;

const meiaBaliza = LARGURA_BALIZA / 2;

// Sorteio determinista, para os varrimentos serem repetíveis.
function rndSemente(s) {
    let x = s >>> 0;
    return () => {
        x = (x * 1664525 + 1013904223) >>> 0;
        return x / 4294967296;
    };
}

test('a bola cai na faixa pedida: 10 m do centro, 23 m do poste, fora da área', () => {
    const r = rndSemente(7);
    const fora = [];
    for (let i = 0; i < 2000; i++) {
        const attDir = (i % 2) ? 1 : -1;
        const p = pontoDaFaltaDirecta(attDir, r);
        const golZ = attDir * LINHA_FUNDO;
        const dxPoste = Math.max(0, Math.abs(p.x) - meiaBaliza);
        const prof = Math.abs(golZ - p.z);
        const distPoste = Math.hypot(dxPoste, prof);

        if (Math.abs(p.x) > DF.xMaxDoCentro + 1e-9) fora.push(`x=${p.x.toFixed(2)}`);
        else if (distPoste > DF.distPosteMax + 1e-9) fora.push(`poste=${distPoste.toFixed(2)}`);
        else if (prof < Area.profundidade + DF.folgaArea - 1e-9) fora.push(`prof=${prof.toFixed(2)}`);
        else if (Area.contem(p.x, p.z, golZ)) fora.push(`dentro da área em ${p.x.toFixed(1)}`);
    }
    assert.strictEqual(fora.length, 0, `fora da faixa: ${fora.slice(0, 5).join(', ')}`);
});

test('a barreira fica a 9.15 m e fecha o canto do remate', () => {
    const r = rndSemente(11);
    const abertos = [];
    for (let i = 0; i < 500; i++) {
        const attDir = (i % 2) ? 1 : -1;
        const b = pontoDaFaltaDirecta(attDir, r);
        const golZ = attDir * LINHA_FUNDO;
        const lugares = lugaresDaBarreira(b.x, b.z, attDir, DF.barreiraN, DF);

        assert.strictEqual(lugares.length, DF.barreiraN);
        lugares.forEach(l => {
            const d = Math.hypot(l.x - b.x, l.z - b.z);
            assert.ok(Math.abs(d - DF.distanciaBarreira) < 1.6,
                `homem da barreira a ${d.toFixed(2)} m da bola`);
        });

        // A recta bola -> poste do lado de onde se bate tem de ser cortada por
        // alguém da barreira: é esse o canto que ela fecha.
        const ladoTiro = Math.sign(b.x) || 1;
        const ax = ladoTiro * meiaBaliza - b.x, az = golZ - b.z;
        const la = Math.hypot(ax, az) || 1;
        const corta = lugares.some(l => {
            const bx = l.x - b.x, bz = l.z - b.z;
            return Math.abs(ax * bz - az * bx) / la < 0.6;
        });
        if (!corta) abertos.push(`bola (${b.x.toFixed(1)}, ${b.z.toFixed(1)})`);
    }
    assert.strictEqual(abertos.length, 0, `canto aberto: ${abertos.slice(0, 4).join(', ')}`);
});

test('os doze desfechos existem e todos saem do sorteio', () => {
    const esperados = ['gol', 'defesa', 'defesa_fora', 'trave_gol', 'trave_fora',
        'travessao_gol', 'travessao_fora', 'fora', 'na_barreira',
        'barreira_gol', 'barreira_fora', 'por_baixo'];

    Object.keys(DF.desfechos).forEach(banda => {
        const chaves = Object.keys(DF.desfechos[banda]).sort();
        assert.deepStrictEqual(chaves, esperados.slice().sort(),
            `a banda ${banda} não tem os doze desfechos`);
    });

    const r = rndSemente(3);
    const vistos = new Set();
    for (let i = 0; i < 4000; i++) {
        const diff = (i % 25) - 12;
        vistos.add(desfechoDaFaltaDirecta(diff, r));
    }
    esperados.forEach(n => assert.ok(vistos.has(n), `o desfecho ${n} nunca sai`));
});

test('quem bate melhor faz mais golos e menos disparates', () => {
    const r = rndSemente(5);
    const conta = (diff) => {
        let golos = 0, foras = 0;
        for (let i = 0; i < 4000; i++) {
            const d = desfechoDaFaltaDirecta(diff, r);
            if (d === 'gol' || d === 'trave_gol' || d === 'travessao_gol' ||
                d === 'barreira_gol') golos++;
            if (d === 'fora' || d === 'trave_fora' || d === 'travessao_fora') foras++;
        }
        return { golos, foras };
    };
    const bom = conta(8), mau = conta(-8);
    assert.ok(bom.golos > mau.golos * 3,
        `um remate perfeito faz ${bom.golos} golos e um péssimo ${mau.golos}`);
    assert.ok(mau.foras > bom.foras,
        `o mau devia mandar mais fora (${mau.foras} contra ${bom.foras})`);
});

test('o alvo de cada desfecho está do lado certo do ferro', () => {
    const r = rndSemente(13);
    for (let i = 0; i < 600; i++) {
        const lado = (i % 2) ? 1 : -1;

        const gol = alvoDaFaltaDirecta('gol', lado, r);
        assert.ok(Math.abs(gol.x) < meiaBaliza && gol.y < ALTURA_BALIZA,
            `o remate a golo saiu da baliza: x=${gol.x.toFixed(2)} y=${gol.y.toFixed(2)}`);
        // E longe do guarda-redes, que espera ao meio da linha.
        assert.ok(Math.abs(gol.x) >= GoalkeeperPose.mergulhoLateralMin,
            `golo mirado a ${Math.abs(gol.x).toFixed(2)} m do eixo: ele apanha de pé`);
        // Sempre para o canto que a barreira NÃO fecha.
        assert.strictEqual(Math.sign(gol.x), -lado,
            'o remate colocado tem de ir ao canto oposto ao da barreira');

        const tf = alvoDaFaltaDirecta('trave_fora', lado, r);
        assert.ok(Math.abs(tf.x) > meiaBaliza, 'trave_fora tem de passar por fora do poste');

        const tg = alvoDaFaltaDirecta('trave_gol', lado, r);
        assert.ok(Math.abs(tg.x) < meiaBaliza, 'trave_gol tem de entrar por dentro');

        const bg = alvoDaFaltaDirecta('travessao_gol', lado, r);
        assert.ok(bg.y < ALTURA_BALIZA - BallPhysics.raio,
            `travessao_gol a ${bg.y.toFixed(2)} m bate no ferro em vez de entrar`);

        const bf = alvoDaFaltaDirecta('travessao_fora', lado, r);
        assert.ok(bf.y > ALTURA_BALIZA, 'travessao_fora tem de passar por cima');

        const pb = alvoDaFaltaDirecta('por_baixo', lado, r);
        assert.ok(pb.porBaixo && pb.y <= BallPhysics.raio + 0.01,
            'o remate por baixo da barreira é rasteiro');
    }
});

test('o remate limpa a barreira em toda a faixa de distâncias', () => {
    const topo = DF.alturaSalto + DF.folgaSobreBarreira;
    const baixos = [];
    for (let dist = 17.5; dist <= 23; dist += 0.5) {
        for (const alvoY of [1.0, 1.6, 2.2]) {
            const t = tiroDaFaltaDirecta(dist, DF.distanciaBarreira, alvoY, false, DF);
            assert.ok(t, `sem solução a ${dist} m`);
            if (t.alturaNaBarreira < topo - 0.01) {
                baixos.push(`${dist}m/${alvoY}m -> ${t.alturaNaBarreira.toFixed(2)}m`);
            }
            // E a elevação é de remate, não de balão.
            assert.ok(t.elev >= DF.elevMin - 1e-9 && t.elev <= DF.elevMax + 1e-9,
                `elevação fora da faixa: ${(t.elev * 180 / Math.PI).toFixed(1)}°`);
        }
    }
    assert.strictEqual(baixos.length, 0, `remates dentro da barreira: ${baixos.slice(0, 4).join(', ')}`);
});

test('o remate por baixo passa mesmo por baixo da barreira no ar', () => {
    for (let dist = 17.5; dist <= 23; dist += 0.5) {
        const t = tiroDaFaltaDirecta(dist, DF.distanciaBarreira, BallPhysics.raio, true, DF);
        assert.ok(t, `sem solução rasteira a ${dist} m`);
        assert.ok(t.alturaNaBarreira <= DF.alturaSaltoBarreira,
            `a ${dist} m a bola passa a ${t.alturaNaBarreira.toFixed(2)} m: dava na barreira`);
    }
});

test('os companheiros ficam onside e fora do corredor da cobrança', () => {
    const r = rndSemente(21);
    for (let i = 0; i < 300; i++) {
        const attDir = (i % 2) ? 1 : -1;
        const b = pontoDaFaltaDirecta(attDir, r);
        const golZ = attDir * LINHA_FUNDO;
        const lugares = lugaresDoApoioNaFaltaDirecta(b.x, b.z, attDir, 9, DF);

        const dirX = 0 - b.x, dirZ = golZ - b.z;
        const dl = Math.hypot(dirX, dirZ) || 1;
        lugares.forEach(l => {
            // Atrás da linha da bola: com a bola à frente não há fora-de-jogo.
            assert.ok(l.z * attDir <= b.z * attDir + 1e-9,
                'companheiro à frente da bola (fora-de-jogo possível)');
            const px = l.x - b.x, pz = l.z - b.z;
            const aoLongo = (dirX * px + dirZ * pz) / dl;
            const lateral = Math.abs(dirX * pz - dirZ * px) / dl;
            assert.ok(aoLongo <= 0 || lateral >= DF.corredorLivre - 1e-9,
                'companheiro dentro do corredor bola->baliza');
        });
    }
});

test('o atraso do guarda-redes sai da habilidade dele', () => {
    const atraso = gk => Math.max(DF.atrasoMin, Math.min(DF.atrasoMax,
        DF.atrasoBase - ((gk - 50) / 50) * DF.atrasoAmplitude));

    assert.ok(atraso(0) > atraso(50) && atraso(50) > atraso(100),
        'o atraso tem de cair com a habilidade');
    assert.ok(Math.abs(atraso(50) - DF.atrasoBase) < 1e-9,
        'no meio da escala o atraso é o atrasoBase');
    assert.ok(atraso(100) >= DF.atrasoMin && atraso(0) <= DF.atrasoMax,
        'o atraso tem de ficar dentro dos limites');

    // E a fórmula é mesmo a que está no jogo (não uma cópia deste teste).
    const ini = srcPlayer.indexOf('executarFalta(decisao) {');
    const fim = srcPlayer.indexOf(LF + '    }' + LF, ini);
    const corpo = srcPlayer.slice(ini, fim);
    assert.ok(corpo.includes('DF.atrasoBase - ((gkSkill - 50) / 50) * DF.atrasoAmplitude'),
        'o baterFaltaDirecta já não tira o atraso da habilidade do guarda-redes');
    assert.ok(corpo.includes('fraccaoAtrasoDefesa'),
        'o tecto do atraso nas defesas desapareceu');
});

test('o guarda-redes espera na linha, como num penálti', () => {
    /*
    A montagem põe-no em cima da linha e desloca-o para o canto que a barreira
    não fecha; sem isto a âncora do jogo corrido (`gkAnchor`) puxava-o dali
    durante os três segundos de espera — medido, 1.27 m à frente da linha no
    instante da batida.
    */
    assert.ok(srcPlayer.includes('const naLinhaDaFalta ='),
        'a âncora do guarda-redes já não o prende à linha durante a falta');
    assert.ok(srcPlayer.includes(': naLinhaDaFalta'),
        'o naLinhaDaFalta existe mas a âncora não o lê');
});

/*
As correcções que vieram de ver o lance em campo: o ressalto na barreira que
voltava para o batedor, o leque de nove que arrastava as duas equipas, e a
marcação que puxava os laterais para a bandeirola de canto.
*/
const srcLoop = semCR(fs.readFileSync(path.join(raiz, 'js', 'match', 'match_loop.js'), 'utf8'));
const srcSetPieces = semCR(fs.readFileSync(path.join(raiz, 'js', 'match', 'match_setpieces.js'), 'utf8'));

test('o ressalto na barreira sai de lado, nunca para quem bateu', () => {
    assert.ok(DF.ricocheteAnguloMin >= 60 * Math.PI / 180,
        'um ressalto a menos de 60° da direcção do remate volta para o batedor');
    assert.ok(DF.ricocheteAnguloMax > DF.ricocheteAnguloMin,
        'a faixa de ângulos do ricochete está invertida');
    assert.ok(DF.ricocheteParaGK >= 0 && DF.ricocheteParaGK <= 1,
        'ricocheteParaGK é uma fracção');
    assert.ok(srcLoop.includes('ricocheteAnguloMin'),
        'o ramo da falta directa já não usa a faixa de ângulos do ricochete');
    assert.ok(!srcLoop.includes('this.ballVel.x *= -DF.barreiraTravagem'),
        'o ressalto voltou a ser a velocidade invertida (ia direito ao batedor)');
});

/*
O leque e a marcação da montagem própria do DIRECT_FREE_KICK deixaram de
existir: a falta directa passou a ser o ramo FREE_KICK do `setupSetPiece`, com
o desenho por SECTOR (`lugaresDaFalta`, `FreeKickModel.formacaoPorSetor`) e a
marcação pelos `slotsMarcacao`. O que se guarda daquele desenho é o que o
remate precisa: a linha da cobrança livre.
*/
test('a montagem deixa livre o corredor da cobrança', () => {
    const F = extrairObjecto(srcTiro, 'FreeKickModel', { Area });
    assert.ok(F.corredorLivre >= 3 && F.corredorLivre <= 8,
        `corredorLivre=${F.corredorLivre}: fora do que é um corredor de cobrança`);
    assert.ok(srcSetPieces.includes('foraDoCorredor'),
        'a montagem já não tira os companheiros da linha bola->baliza');
    assert.ok(srcSetPieces.includes("decisaoFK !== 'remate'"),
        'o corredor livre passou a valer também para o cruzamento e o passe');
});

test('a batida solta toda a gente do lugar do lance parado', () => {
    const ini = srcPlayer.indexOf('executarFalta(decisao) {');
    const fim = srcPlayer.indexOf(LF + '    }' + LF, ini);
    const corpo = srcPlayer.slice(ini, fim);
    assert.ok(corpo.includes('pl.setPieceTarget = null'),
        'o setPieceTarget não é limpo na batida: a equipa fica especada nos lugares da cobrança');
});

/*
A COBRANÇA SAI TENSA: a velocidade é a do batedor, não a que a geometria dá.

Com o solver antigo — fixar o ponto de chegada e procurar a elevação — a bola
saía a 19.1 m/s a 23.7°, uma bola lobada. O `tiroTensoDaFaltaDirecta` bate com
a força pedida e procura a QUEDA EXTRA que a põe no ponto.
*/
test('a cobrança sai com a força do batedor, e é a queda extra que a faz cair', () => {
    const topo = DF.alturaSalto + DF.folgaSobreBarreira;
    let houve = 0;
    for (let dist = 17; dist <= 25; dist += 2) {
        for (const alvoY of [1.0, 1.6, 2.1]) {
            const t = tiroTensoDaFaltaDirecta(dist, DF.distanciaBarreira, alvoY, 28.0, DF);
            if (!t) continue;
            houve++;
            assert.strictEqual(t.v, 28.0, 'a velocidade tem de ser a que se pediu');
            assert.ok(t.extraGrav >= 0 && t.extraGrav <= DF.dipMax + 1e-9,
                `extraGrav=${t.extraGrav.toFixed(1)} fora do tecto dipMax`);
            assert.ok(t.alturaNaBarreira >= topo - 1e-6,
                `a ${dist} m a bola passa a ${t.alturaNaBarreira.toFixed(2)} m: bate na barreira`);
        }
    }
    assert.ok(houve >= 10, `só ${houve} cobranças tensas resolveram: a faixa toda tem de ter solução`);
});

test('bater com força é bater mais tenso do que o solver antigo', () => {
    let tensoMedio = 0, antigoMedio = 0, n = 0;
    for (let dist = 18; dist <= 24; dist += 2) {
        const t = tiroTensoDaFaltaDirecta(dist, DF.distanciaBarreira, 1.6, 28.0, DF);
        const a = tiroDaFaltaDirecta(dist, DF.distanciaBarreira, 1.6, false, DF);
        if (!t || !a) continue;
        tensoMedio += t.v; antigoMedio += a.v; n++;
    }
    assert.ok(n > 0, 'nenhuma distância resolveu nos dois solvers');
    assert.ok(tensoMedio / n > antigoMedio / n + 3.0,
        `tenso ${(tensoMedio / n).toFixed(1)} m/s vs antigo ${(antigoMedio / n).toFixed(1)}: a cobrança não ficou mais forte`);
});

test('a queda extra é pedida pelo remate e aplicada pela física', () => {
    assert.ok(srcPlayer.includes('Match.freeKickDip ='),
        'o remate já não pede a queda extra');
    const srcFisica2 = semCR(fs.readFileSync(path.join(raiz, 'js', 'match', 'match_physics.js'), 'utf8'));
    assert.ok(srcFisica2.includes('this.freeKickDip.extraGrav'),
        'a física não lê o freeKickDip: a bola sai com o ângulo de uma gravidade que não existe');
    assert.ok(srcFisica2.includes('this.freeKickDip = null'),
        'a queda extra nunca se apaga: fica ligada para o resto do jogo');
});
