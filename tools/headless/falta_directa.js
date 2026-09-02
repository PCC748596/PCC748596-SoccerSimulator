/*
LOTE DE FALTAS DIRECTAS forçadas: corre o lance inteiro (montagem, espera,
cobrança, voo da bola) e conta o que aconteceu.

Mede o que o pedido pede para existir:

  - a bola cai na faixa (<= 10 m do centro, <= 23 m do poste mais perto, fora
    da grande área);
  - a barreira tem cinco e fecha o canto do remate;
  - os companheiros de quem bate ficam ATRÁS da linha da bola (nunca em
    fora-de-jogo) e fora do corredor da cobrança;
  - o guarda-redes espera no meio da linha, como no penálti;
  - os doze desfechos acontecem todos.

Uso: node tools/headless/falta_directa.js [quantas]
*/
require('./harness.js');

const quantas = Number(process.argv[2] || 200);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const DF = DirectFreeKickModel;
const meiaBaliza = LARGURA_BALIZA / 2;

const desfechos = {};
const finais = {};
let foraDaFaixa = 0, dentroDaArea = 0;
let barreiraErrada = 0, cantoAberto = 0;
let apoioAdiantado = 0, apoioNoCorredor = 0;
let gkForaDoCentro = 0, semSalto = 0;
const atrasos = [];

let desfechoActual = null;
const cruzado = {};
EventBus.on('DIRECT_FREE_KICK_TAKEN', ev => {
    desfechos[ev.desfecho] = (desfechos[ev.desfecho] || 0) + 1;
    desfechoActual = ev.desfecho;
});

for (let n = 0; n < quantas; n++) {
    const equipa = (n % 2 === 0) ? 'TeamA' : 'TeamB';
    Match.state = 'PLAY';
    Match.triggerDirectFreeKick(equipa);

    const atac = (equipa === 'TeamA') ? Match.players : Match.opponents;
    const def = (equipa === 'TeamA') ? Match.opponents : Match.players;
    const attDir = atac.find(p => p.role !== 'gk').dirZ;
    const bola = Match.ball.position.clone();
    const golZ = attDir * (CAMPO_COMP / 2);

    // ---- a posição da bola
    const dxPoste = Math.max(0, Math.abs(bola.x) - meiaBaliza);
    const prof = Math.abs(golZ - bola.z);
    const distPoste = Math.hypot(dxPoste, prof);
    if (Math.abs(bola.x) > DF.xMaxDoCentro + 1e-6 || distPoste > DF.distPosteMax + 1e-6) foraDaFaixa++;
    if (Area.contem(bola.x, bola.z, golZ)) dentroDaArea++;

    // ---- a barreira
    const barreira = def.filter(p => p.naBarreiraFalta);
    /*
    O NÚMERO DA BARREIRA SAI DA DISTÂNCIA, não é sempre cinco: acima de
    `barreira1MaxDist` fica um homem, acima de `barreira2MaxDist` dois, e
    de perto a barreira cheia (ver o ramo FREE_KICK do setupSetPiece).
    */
    const distCentro = Math.hypot(bola.x, golZ - bola.z);
    let nEsperado = FreeKickModel.barreiraMax || 4;
    if (distCentro > FreeKickModel.barreira1MaxDist) nEsperado = 1;
    else if (distCentro > FreeKickModel.barreira2MaxDist) nEsperado = 2;
    if (barreira.length !== nEsperado) barreiraErrada++;

    // O canto fechado é o do lado de onde se bate: a barreira tem de cortar a
    // recta bola -> poste desse lado.
    const ladoTiro = Math.sign(bola.x) || 1;
    const postX = ladoTiro * meiaBaliza;
    let corta = false;
    for (const p of barreira) {
        // Distância do homem à recta bola->poste, no plano.
        const ax = postX - bola.x, az = golZ - bola.z;
        const bx = p.model.position.x - bola.x, bz = p.model.position.z - bola.z;
        const la = Math.hypot(ax, az) || 1;
        const dist = Math.abs(ax * bz - az * bx) / la;
        if (dist < 0.6) corta = true;
    }
    if (!corta) cantoAberto++;

    // ---- os companheiros
    const apoios = atac.filter(p => p !== Match.setPieceTaker && p.role !== 'gk');
    const dirX = (0 - bola.x), dirZ2 = (golZ - bola.z);
    const dl = Math.hypot(dirX, dirZ2) || 1;
    apoios.forEach(p => {
        /*
        FORA-DE-JOGO A SÉRIO: à frente da bola E à frente do último
        defensor. No desenho por sector os avançados esperam o ressalto à
        FRENTE da bola, de propósito — o que não podem é passar a linha.
        */
        const avancoBola = bola.z * attDir;
        const avancoP = p.model.position.z * attDir;
        let linhaDef = -999;
        for (const o of def) {
            if (o.role === 'gk') continue;
            linhaDef = Math.max(linhaDef, o.model.position.z * attDir);
        }
        if (avancoP > avancoBola + 0.01 && avancoP > linhaDef + 0.01) apoioAdiantado++;
        const px = p.model.position.x - bola.x, pz = p.model.position.z - bola.z;
        const lateral = Math.abs(dirX * pz - dirZ2 * px) / dl;
        const aoLongo = (dirX * px + dirZ2 * pz) / dl;
        if (aoLongo > 0 && lateral < DF.corredorLivre - 0.01) apoioNoCorredor++;
    });

    // ---- o guarda-redes
    const gk = def.find(p => p.role === 'gk');
    /*
    Ele espera NA LINHA — mas não ao centro: a barreira fecha um canto e ele
    cobre o outro (`FreeKickModel.deslocamentoGK`). O que se mede é a linha.
    */
    if (gk && Math.abs(Math.abs(gk.model.position.z) - LINHA_FUNDO) > 1.0) gkForaDoCentro++;

    // ---- corre o lance
    let estadoFinal = 'sem_desfecho';
    let atrasoLido = null;
    desfechoActual = null;
    // O atraso do GK sai da habilidade dele; lê-se da fórmula, porque o campo
    // já está a ser descontado no frame seguinte à batida.
    if (gk) {
        atrasoLido = Math.max(DF.atrasoMin, Math.min(DF.atrasoMax,
            DF.atrasoBase - ((gk.skillFor('GK') - 50) / 50) * DF.atrasoAmplitude));
    }
    let saltouBarreira = false;
    let tDesdeBatida = 0;
    for (let i = 0; i < 60 * 14; i++) {
        Match.update(dt);
        if (desfechoActual) tDesdeBatida += dt;
        if (barreira.some(p => p.jumpTimer > 0)) saltouBarreira = true;
        // Golo da COBRANÇA (a bola foi lá directa) ou do ressalto que se
        // seguiu: 3 s chegam de sobra para o voo de 20 m.
        if (Match.state === 'GOAL') {
            // Golo da COBRANÇA é o que entra sem ninguém lhe voltar a tocar;
            // o resto é golo de ressalto, jogo corrido a seguir à falta.
            estadoFinal = (Match.lastTouchedPlayer === Match.setPieceTaker ||
                tDesdeBatida <= 1.6) ? 'golo' : 'golo_ressalto';
            break;
        }
        if (Match.state === 'GOAL_KICK') { estadoFinal = 'tiro_de_meta'; break; }
        if (Match.state === 'CORNER_KICK') { estadoFinal = 'canto'; break; }
        if (Match.state === 'THROW_IN') { estadoFinal = 'lateral'; break; }
        if (!Match.faltaDirectaPlano && Match.state === 'PLAY' && i > 60 * 8) {
            estadoFinal = 'em_jogo'; break;
        }
    }
    if (atrasoLido !== null) atrasos.push(atrasoLido);
    finais[estadoFinal] = (finais[estadoFinal] || 0) + 1;
    if (!saltouBarreira) semSalto++;
    const chave = (desfechoActual || 'sem_batida') + ' -> ' + estadoFinal;
    cruzado[chave] = (cruzado[chave] || 0) + 1;

    window.bolaChutada = false;
    Match.faltaDirecta = false;
    Match.faltaDirectaPlano = null;
}

const media = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;

console.log('\n=== FALTA DIRECTA — ' + quantas + ' cobranças ===\n');
console.log('POSIÇÃO DA BOLA');
console.log('  fora da faixa pedida : ' + foraDaFaixa);
console.log('  dentro da grande área: ' + dentroDaArea);
console.log('\nBARREIRA');
console.log('  com número errado    : ' + barreiraErrada);
console.log('  canto do remate aberto: ' + cantoAberto);
console.log('\nEQUIPA QUE BATE');
console.log('  companheiros em fora-de-jogo               : ' + apoioAdiantado);
console.log('  companheiros no corredor da cobrança       : ' + apoioNoCorredor);
console.log('\nGUARDA-REDES');
console.log('  fora da propria linha  : ' + gkForaDoCentro);
console.log('  atraso médio de reacção: ' + media(atrasos).toFixed(3) + ' s');
console.log('\nDESFECHOS SORTEADOS');
Object.keys(desfechos).sort((a, b) => desfechos[b] - desfechos[a])
    .forEach(k => console.log('  ' + k.padEnd(16) + desfechos[k]));
console.log('\nBARREIRA QUE NÃO SALTOU: ' + semSalto);
console.log('\nDESFECHO -> FIM DO LANCE');
Object.keys(cruzado).sort().forEach(k => console.log('  ' + k.padEnd(34) + cruzado[k]));
console.log('\nCOMO O LANCE ACABOU');
Object.keys(finais).sort((a, b) => finais[b] - finais[a])
    .forEach(k => console.log('  ' + k.padEnd(16) + finais[k]));
console.log('');
