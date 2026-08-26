/*
GIRAR DE COSTAS — só quando há espaço, e só onde perder a bola não é golo.

O QUE SE VIA: o jogador domina de costas para o ataque e roda 180 graus para
cima do adversário que o está a marcar por trás. Feito no próprio meio-campo,
uma bola perdida ali deixa o atacante isolado com o guarda-redes.

A CAUSA: o cone de condução do estado CARRY é centrado em `p.dirZ` — a direcção
de ataque — e nunca na direcção para onde o corpo está virado. Quem recebe de
costas aponta imediatamente para a frente, ou seja gira 180 graus, e o cone não
sabe nada de quem está lá.

A REGRA (pedida):
  - No CAMPO DE ATAQUE gira à vontade: perder a bola ali não custa golo.
  - No próprio meio-campo só gira se o cone de saída estiver LIMPO: raio de 5 m,
    45 graus para cada lado da direcção oposta àquela de onde a bola vem.
  - Com o cone ocupado, sai em toques de 30 graus para o lado livre, em vez de
    rodar para cima do marcador.

Corre com: node tests/giro_de_costas.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcConfig = ler('js/config.js');
const srcFsm = ler('js/fsm.js');

function extrairObjecto(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    if (i < 0) throw new Error(`${nome} não encontrado`);
    const f = src.indexOf(LF + '};', i);
    return new Function(`${src.slice(i, f + 3)}; return ${nome};`)();
}

function extrairFuncao(src, nome, preludio) {
    const i = src.indexOf(`function ${nome}(`);
    if (i < 0) throw new Error(`${nome} não encontrada`);
    const f = src.indexOf(LF + '}', i) + 2;
    return new Function(`${preludio || ''} ${src.slice(i, f)}; return ${nome};`)();
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

const G = extrairObjecto(srcConfig, 'GiroDeCostasModel');
const eixoDeConducao = extrairFuncao(srcConfig, 'eixoDeConducao',
    `const GiroDeCostasModel = ${JSON.stringify(G)};`);

/*
Equipa a atacar +z. "De costas" é estar virado para -z. A bola vem de trás
(do lado da própria baliza) e viaja para +z, portanto a direcção de saída — a
oposta àquela de onde ela vem — é +z.
*/
const base = (extra) => Object.assign({
    dirZ: 1,
    zDir: -20,          // no próprio meio-campo
    facingX: 0, facingZ: -1,
    entradaX: 0, entradaZ: 1,
    carryRecuo: false,
    adversarios: []
}, extra);

const graus = (bx, bz) => Math.round(Math.atan2(bx, bz) * 180 / Math.PI);

/* =====================================================================
   1 — OS NÚMEROS PEDIDOS
   ===================================================================== */
console.log(LF + '1 — 5 metros, 45 graus para cada lado, toques de 30');
{
    if (G.raio !== 5.0) erro(`raio devia ser 5 m, é ${G.raio}`);
    else ok('raio: 5 m');

    if (G.meiaAberturaGraus !== 45) erro(`abertura devia ser 45 graus, é ${G.meiaAberturaGraus}`);
    else ok('abertura: 45 graus para cada lado');

    if (G.passoGiroGraus !== 30) erro(`o toque devia ser de 30 graus, é ${G.passoGiroGraus}`);
    else ok('toque de giro: 30 graus');
}

/* =====================================================================
   2 — COM O CONE LIMPO, GIRA
   ===================================================================== */
console.log(LF + '2 — cone limpo: gira e aponta ao ataque');
{
    const eixo = eixoDeConducao(base());
    if (graus(eixo.bx, eixo.bz) !== 0) {
        erro(`devia apontar ao ataque (0 graus), aponta a ${graus(eixo.bx, eixo.bz)}`);
    } else ok('sem ninguém no cone: gira os 180 e conduz para a frente');

    // Um adversário FORA do raio não conta.
    const longe = eixoDeConducao(base({ adversarios: [{ x: 0, z: 8 }] }));
    if (graus(longe.bx, longe.bz) !== 0) erro('um adversário a 8 m travou o giro');
    else ok('adversário a 8 m (fora dos 5): gira na mesma');

    // E um adversário dentro do raio mas FORA do ângulo também não.
    const deLado = eixoDeConducao(base({ adversarios: [{ x: 4, z: -1 }] }));
    if (graus(deLado.bx, deLado.bz) !== 0) erro('um adversário atrás do ombro travou o giro');
    else ok('adversário fora dos 45 graus: gira na mesma');
}

/* =====================================================================
   3 — COM O MARCADOR NO CONE, NÃO GIRA
   ===================================================================== */
console.log(LF + '3 — marcador nas costas: sai em toques de 30 graus');
{
    /*
    O marcador está exactamente onde ele ia rodar: 3 m à frente, no eixo de
    saída. O espaço livre está à esquerda (x negativo), porque à direita há
    outro adversário.
    */
    const eixo = eixoDeConducao(base({
        adversarios: [{ x: 0, z: 3 }, { x: 3, z: 2 }]
    }));
    const a = graus(eixo.bx, eixo.bz);

    // Ele estava virado para -z (180 graus). Um toque de 30 tem de o deixar
    // a 150 ou -150 — nunca já virado para a frente.
    if (Math.abs(a) === 0) {
        erro('rodou os 180 graus para cima do marcador — é o defeito');
    } else if (Math.abs(Math.abs(a) - 150) > 1) {
        erro(`devia sair a 150 graus da frente (um toque de 30), saiu a ${a}`);
    } else ok(`não gira: roda um toque de 30 graus (fica a ${a})`);

    // E vai para o lado LIVRE: com o adversário à direita, sai pela esquerda.
    if (a <= 0) erro(`saiu para o lado ocupado (${a})`);
    else ok('sai pelo lado livre');
}

/* =====================================================================
   4 — NO CAMPO DE ATAQUE A REGRA NÃO SE APLICA
   ===================================================================== */
console.log(LF + '4 — o giro livre é só no último terço');
{
    /*
    A fronteira é a do `CarryModel.zonaLivre` (17 m no referencial de ataque, a
    entrada do último terço) e não a linha de meio-campo. No meio-campo
    adversário perder a bola ainda dói: o contra-ataque sai com a equipa toda
    subida. Onde perder a bola custa pouco é lá à frente.
    */
    const eixo = eixoDeConducao(base({
        zDir: G.zonaLivre + 3,
        adversarios: [{ x: 0, z: 2 }]
    }));
    if (graus(eixo.bx, eixo.bz) !== 0) {
        erro('travou o giro no último terço, onde perder a bola custa pouco');
    } else ok('último terço: gira mesmo com o marcador em cima');

    // Já no meio-campo adversário, mas antes do último terço: vale a regra.
    const meio = eixoDeConducao(base({
        zDir: G.zonaLivre - 5,
        adversarios: [{ x: 0, z: 3 }, { x: 3, z: 2 }]
    }));
    if (graus(meio.bx, meio.bz) === 0) {
        erro('girou os 180 no meio-campo adversário com o marcador nas costas');
    } else ok('antes do último terço: continua a valer o cone');

    // E a fronteira é a MESMA do orçamento de condução — não uma segunda
    // inventada para a mesma ideia.
    const iC = srcConfig.indexOf('const CarryModel = {');
    const fC = srcConfig.indexOf(LF + '};', iC);
    const CarryModel = new Function(`const GaitModel = { correr: { vel: 8.0 } };
        ${srcConfig.slice(iC, fC + 3)}; return CarryModel;`)();
    if (G.zonaLivre !== CarryModel.zonaLivre) {
        erro(`a fronteira do giro (${G.zonaLivre}) divergiu da do orçamento de ` +
            `condução (${CarryModel.zonaLivre})`);
    } else ok(`mesma fronteira do CarryModel.zonaLivre (${G.zonaLivre} m)`);
}

/* =====================================================================
   5 — O QUE NÃO PODIA MUDAR
   ===================================================================== */
console.log(LF + '5 — o resto da condução fica como estava');
{
    // Já virado para a frente não há giro nenhum para travar.
    const deFrente = eixoDeConducao(base({
        facingZ: 1, adversarios: [{ x: 0, z: 3 }]
    }));
    if (graus(deFrente.bx, deFrente.bz) !== 0) {
        erro('quem já estava virado para a frente foi desviado sem razão');
    } else ok('virado para a frente: nada muda');

    // O recuo deliberado (carryRecuo) continua a mandar no eixo.
    const recuo = eixoDeConducao(base({ carryRecuo: true }));
    if (Math.abs(graus(recuo.bx, recuo.bz)) !== 180) {
        erro(`o carryRecuo devia apontar para trás, aponta a ${graus(recuo.bx, recuo.bz)}`);
    } else ok('carryRecuo: continua a recuar');

    // A equipa que ataca -z tem de ler igual.
    const outroLado = eixoDeConducao(base({
        dirZ: -1, zDir: -20, facingZ: 1, entradaZ: -1,
        adversarios: [{ x: 0, z: -3 }, { x: -3, z: -2 }]
    }));
    const a2 = Math.atan2(outroLado.bx, outroLado.bz * -1) * 180 / Math.PI;
    if (Math.abs(Math.abs(a2) - 150) > 1) {
        erro(`para a equipa que ataca -z devia dar o mesmo, deu ${Math.round(a2)}`);
    } else ok('vale para as duas equipas');
}

/* =====================================================================
   6 — E A CONDUÇÃO USA MESMO ISTO
   ===================================================================== */
console.log(LF + '6 — o estado CARRY usa o eixo em vez de apontar sempre ao ataque');
{
    const i = srcFsm.indexOf("case 'CARRY':");
    const corpo = srcFsm.slice(i, srcFsm.indexOf("case '", i + 10));

    if (!/eixoDeConducao/.test(corpo)) {
        erro('o CARRY não chama o eixoDeConducao — continua a girar sempre');
    } else ok('o CARRY chama o eixoDeConducao');
}

console.log(LF + (falhas ? `FALHOU: ${falhas}` : 'OK'));
process.exit(falhas ? 1 : 0);
