/*
=============================================================================
POSE — o corpo do jogador e as poses dos clips, sem depender do jogo
=============================================================================
Tudo aqui é função pura: recebe um `rig` e números, escreve rotações. Não sabe
o que é o `Match`, não sabe o que é um `FootballPlayer`, e não guarda estado.

PORQUÊ ISTO EXISTE. Os gestos do jogo (remate, chutão, tiro de meta,
lançamento do GR, arremesso lateral) são clips de keyframes no `js/config.js`,
e afiná-los à mão é escrever radianos às cegas. O editor de animação
(`animEditor.html`) mostra-os num boneco, mas para servir de alguma coisa tem
de desenhar EXACTAMENTE o que o jogo desenha.

    Se o editor tivesse a sua própria leitura dos ângulos, afinava-se uma pose
    ali e no jogo ficava outra, sem aviso. Uma ferramenta que mente é pior do
    que não ter ferramenta.

Por isso as poses vivem aqui, e são as MESMAS funções que o `js/player.js` e o
editor chamam. Uma implementação só.

Ver docs/superpowers/specs/2026-08-25-editor-de-animacao-design.md.
=============================================================================
*/

/*
O CORPO. Era o método `buildBody` do FootballPlayer, e só usava da instância a
aparência (tons de pele e cabelo) e o material das costas da camisola — ambos
passam agora pelos argumentos e pelo valor devolvido.

Devolve `{ corpo, rig, backMat }`:
  `corpo`    o Group já à escala do jogo, para pendurar na cena
  `rig`      os nós articulados, que é o que as poses daqui para baixo mexem
  `backMat`  o material das costas, onde o número da camisola é desenhado
*/
function construirCorpo(corCamisa, corCalcao, aparencia) {
    // Pele e juntas seguem o tom do jogador; as juntas ficam um pouco mais
    // escuras que a pele, para o contorno das articulações não desaparecer.
    const ap = aparencia || escolherAparencia(0, 11, 0);
    const corPele = ap.pele;
    const corJunta = new THREE.Color(corPele).multiplyScalar(0.72).getHex();
    const blockMat = new THREE.MeshStandardMaterial({ color: corPele, roughness: 0.8 }); const jointMat = new THREE.MeshStandardMaterial({ color: corJunta, roughness: 0.6 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: corCamisa, roughness: 0.9 }); const shortMat = new THREE.MeshStandardMaterial({ color: corCalcao, roughness: 0.9 });
    const bootMat = new THREE.MeshStandardMaterial({ color: ap.corChuteira, roughness: 0.5 }); const studMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const hairMat = new THREE.MeshStandardMaterial({ color: ap.cabelo, roughness: 0.9 });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x2f3640, linewidth: 2 }); const lineMat = new THREE.LineBasicMaterial({ color: 0x2f3640 });

    const cvsV = document.createElement('canvas'); cvsV.width = 512; cvsV.height = 512; const ctxV = cvsV.getContext('2d');
    ctxV.fillStyle = corCamisa; ctxV.fillRect(0, 0, 512, 512); ctxV.fillStyle = '#dcdde1'; ctxV.beginPath(); ctxV.moveTo(136, 0); ctxV.lineTo(376, 0); ctxV.lineTo(256, 280); ctxV.fill(); ctxV.strokeStyle = '#2f3640'; ctxV.lineWidth = 12; ctxV.stroke();

    const backMat = new THREE.MeshStandardMaterial({ color: corCamisa, roughness: 0.9 });
    const chestMats = [shirtMat, shirtMat, shirtMat, shirtMat, new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cvsV) }), backMat];

    const cvsS = document.createElement('canvas'); cvsS.width = 256; cvsS.height = 256; const ctxS = cvsS.getContext('2d');
    ctxS.fillStyle = corCamisa; ctxS.fillRect(0, 0, 256, 256); ctxS.fillStyle = '#ffffff'; ctxS.fillRect(0, 20, 256, 30); ctxS.fillRect(0, 70, 256, 15); ctxS.strokeStyle = '#2f3640'; ctxS.lineWidth = 4; ctxS.strokeRect(0, 0, 256, 256);
    const sockTex = new THREE.CanvasTexture(cvsS);
    const sockMats = [new THREE.MeshStandardMaterial({ map: sockTex }), new THREE.MeshStandardMaterial({ map: sockTex }), new THREE.MeshStandardMaterial({ color: corCamisa }), new THREE.MeshStandardMaterial({ color: corCamisa }), new THREE.MeshStandardMaterial({ map: sockTex }), new THREE.MeshStandardMaterial({ map: sockTex })];

    const u = 1.0; const corpo = new THREE.Group();
    const rig = { pelvis: null, chest: null, neck: null, lArm: null, rArm: null, lElbow: null, rElbow: null, lHand: null, rHand: null, lLeg: null, rLeg: null, lKnee: null, rKnee: null, lFoot: null, rFoot: null, olhoEsq: null, olhoDir: null };

    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 850);
    /*
    QUEM PROJECTA SOMBRA.

    Das 24 pecas do corpo so a BACIA tinha `castShadow` — a sombra no relvado
    era uma manchinha do tamanho da anca, sem tronco, sem cabeca e sem pernas.
    Agora as pecas ESTRUTURAIS projectam (tronco, cabeca, bracos, coxas,
    canelas, chuteiras) e as decorativas nao: o cabelo, as mangas, os calcoes,
    os meioes, as juntas e as travas das chuteiras estao todos DENTRO de uma
    peca que ja projecta, e a sombra deles seria a mesma silhueta desenhada
    duas vezes — custo no shadow pass a troco de nada.

    Em tablets continua tudo desligado, como estava.
    */
    function criarPeca(geo, mat, castShadow = false) { 
        const m = new THREE.Mesh(geo, mat); 
        m.castShadow = isTouchDevice ? false : castShadow; 
        m.receiveShadow = true; 
        return m; 
    }

    const pelvis = criarPeca(new THREE.BoxGeometry(u * 1.3, u * 0.6, u * 0.8), blockMat, true); pelvis.position.y = 2.6; pelvis.add(criarPeca(new THREE.BoxGeometry(u * 1.35, u * 0.65, u * 0.85), shortMat)); corpo.add(pelvis); rig.pelvis = pelvis;
    /*
    TRONCO — uma peça só (pedido).

    Eram três caixas empilhadas: pelvis (1.30 de largura), belly (1.10) e
    chest (1.40). Como a do meio era a mais ESTREITA das três, o tronco
    fazia uma cintura em degrau — dois vincos visíveis de perfil, que é o
    que se via na captura.

    Agora belly e chest são a mesma caixa: vai de onde começava a barriga
    (y 0.30 no espaço da pelvis) até ao topo do peito (y 1.75), logo
    1.45 de altura, centrada em 1.025. Os filhos do peito (pescoço,
    braços) levam +0.225 para compensar a origem ter descido de 1.25
    para 1.025 — a pose fica idêntica à de antes.
    */
    const chest = criarPeca(new THREE.BoxGeometry(u * 1.4, u * 1.45, u * 0.75), blockMat);
    chest.position.y = 1.025;
    chest.add(criarPeca(new THREE.BoxGeometry(u * 1.45, u * 1.5, u * 0.8), chestMats));
    pelvis.add(chest); rig.chest = chest;
    const neck = criarPeca(new THREE.BoxGeometry(u * 0.35, u * 0.15, u * 0.35), blockMat); neck.position.y = 0.8; chest.add(neck); rig.neck = neck;
    const head = criarPeca(new THREE.BoxGeometry(u * 0.8, u * 1.0, u * 0.85), blockMat, true); head.position.y = 0.575;

    const faceGrp = new THREE.Group(); const faceZ = u * 0.426;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2f3640 });
    rig.olhoEsq = new THREE.Mesh(new THREE.PlaneGeometry(u * 0.08, u * 0.14), eyeMat); rig.olhoEsq.position.set(-u * 0.16, u * 0.15, faceZ);
    rig.olhoDir = new THREE.Mesh(new THREE.PlaneGeometry(u * 0.08, u * 0.14), eyeMat); rig.olhoDir.position.set(u * 0.16, u * 0.15, faceZ);
    const nariz = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, u * 0.05, faceZ), new THREE.Vector3(0, -u * 0.08, faceZ), new THREE.Vector3(u * 0.06, -u * 0.08, faceZ)]), lineMat);
    const boca = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-u * 0.12, -u * 0.22, faceZ), new THREE.Vector3(u * 0.12, -u * 0.22, faceZ)]), lineMat);
    faceGrp.add(rig.olhoEsq, rig.olhoDir, nariz, boca); head.add(faceGrp);

    const hairGrp = new THREE.Group();
    const hT = criarPeca(new THREE.BoxGeometry(u * 0.88, u * 0.25, u * 0.9), hairMat); hT.position.set(0, u * 0.5, 0);
    const hB = criarPeca(new THREE.BoxGeometry(u * 0.88, u * 0.7, u * 0.25), hairMat); hB.position.set(0, u * 0.15, -u * 0.35);
    const hL = criarPeca(new THREE.BoxGeometry(u * 0.15, u * 0.6, u * 0.65), hairMat); hL.position.set(-u * 0.4, u * 0.2, -u * 0.1);
    const hR = criarPeca(new THREE.BoxGeometry(u * 0.15, u * 0.6, u * 0.65), hairMat); hR.position.set(u * 0.4, u * 0.2, -u * 0.1);
    const hF = criarPeca(new THREE.BoxGeometry(u * 0.88, u * 0.15, u * 0.2), hairMat); hF.position.set(0, u * 0.45, u * 0.38);
    hairGrp.add(hT, hB, hL, hR, hF); head.add(hairGrp); neck.add(head);

    const jointGeo = new THREE.SphereGeometry(u * 0.2, 16, 16); const smallJointGeo = new THREE.SphereGeometry(u * 0.15, 16, 16);

    function criarBraco(x) {
        // 0.525 = 0.30 de antes + 0.225 da nova origem do tronco.
        const grp = new THREE.Group(); grp.position.set(x, 0.525, 0);
        const up = criarPeca(new THREE.BoxGeometry(u * 0.35, u * 1.0, u * 0.35), blockMat, true); up.position.y = -0.5;
        const manga = criarPeca(new THREE.BoxGeometry(u * 0.4, u * 0.5, u * 0.4), shirtMat); manga.position.y = 0.25; up.add(manga); grp.add(up);
        const elb = new THREE.Group(); elb.position.y = -1.0; grp.add(elb); elb.add(criarPeca(smallJointGeo, jointMat));
        const low = criarPeca(new THREE.BoxGeometry(u * 0.3, u * 0.8, u * 0.3), blockMat, true); low.position.y = -0.4; elb.add(low);
        const handG = new THREE.Group(); handG.position.y = -0.8; elb.add(handG);
        const mao = criarPeca(new THREE.BoxGeometry(u * 0.35, u * 0.4, u * 0.2), blockMat); mao.position.y = -0.2; mao.rotation.y = Math.PI / 2; handG.add(mao);
        grp.rotation.z = x < 0 ? -Math.PI / 16 : Math.PI / 16; chest.add(grp); return { raiz: grp, cotovelo: elb, mao: handG };
    }

    function criarPerna(x) {
        const grp = new THREE.Group(); grp.position.set(x, -0.3, 0); grp.add(criarPeca(jointGeo, jointMat));
        const coxa = criarPeca(new THREE.BoxGeometry(u * 0.45, u * 1.0, u * 0.45), blockMat, true); coxa.position.y = -0.5;
        const shortL = criarPeca(new THREE.BoxGeometry(u * 0.5, u * 0.5, u * 0.5), shortMat); shortL.position.y = 0.25; coxa.add(shortL); grp.add(coxa);
        const joelho = new THREE.Group(); joelho.position.y = -1.0; grp.add(joelho); joelho.add(criarPeca(smallJointGeo, jointMat));
        const canela = criarPeca(new THREE.BoxGeometry(u * 0.35, u * 0.9, u * 0.35), blockMat, true); canela.position.y = -0.45;
        const meiao = criarPeca(new THREE.BoxGeometry(u * 0.4, u * 0.85, u * 0.4), sockMats); meiao.position.y = 0.0; canela.add(meiao); joelho.add(canela);
        const peG = new THREE.Group(); peG.position.y = -0.9; joelho.add(peG);

        const footGeo = new THREE.BoxGeometry(u * 0.45, u * 0.4, u * 1.0); const p = footGeo.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getZ(i) > 0 && p.getY(i) > 0) p.setY(i, p.getY(i) - u * 0.25); } footGeo.computeVertexNormals();
        const chuteira = criarPeca(footGeo, bootMat, true); chuteira.position.set(0, -0.2, u * 0.25); peG.add(chuteira);

        const studGeo = new THREE.CylinderGeometry(u * 0.03, u * 0.02, u * 0.04, 8);
        const posTravas = [[-u * 0.12, u * 0.25], [u * 0.12, u * 0.25], [-u * 0.12, 0], [u * 0.12, 0], [-u * 0.12, -u * 0.3], [u * 0.12, -u * 0.3]];
        posTravas.forEach(pos => { const t = criarPeca(studGeo, studMat); t.position.set(pos[0], -0.22, pos[1]); chuteira.add(t); });

        grp.rotation.z = x < 0 ? -Math.PI / 32 : Math.PI / 32; peG.rotation.y = x < 0 ? -Math.PI / 16 : Math.PI / 16; pelvis.add(grp); return { raiz: grp, joelho: joelho, pe: peG };
    }

    // As mãos entram no rig: o IK precisa da ponta da cadeia, e o teste
    // de defesa lê a posição REAL dela no mundo (ver js/gk_dive.js).
    const bracoEsq = criarBraco(0.8); rig.lArm = bracoEsq.raiz; rig.lElbow = bracoEsq.cotovelo; rig.lHand = bracoEsq.mao;
    const bracoDir = criarBraco(-0.8); rig.rArm = bracoDir.raiz; rig.rElbow = bracoDir.cotovelo; rig.rHand = bracoDir.mao;
    const pernaEsq = criarPerna(0.4); rig.lLeg = pernaEsq.raiz; rig.lKnee = pernaEsq.joelho; rig.lFoot = pernaEsq.pe;
    const pernaDir = criarPerna(-0.4); rig.rLeg = pernaDir.raiz; rig.rKnee = pernaDir.joelho; rig.rFoot = pernaDir.pe;

    corpo.scale.set((1.8 / 5.5) * 0.9, (1.8 / 5.5) * 0.9, (1.8 / 5.5) * 0.9); return { corpo, rig, backMat };
}


/*
PÉS E CABEÇA — canais OPCIONAIS, comuns a todos os clips.

Os pés estavam fixos em ±PI/16 e a cabeça nunca era tocada: nenhum dos cinco
clips tinha canais para eles. Agora tem, mas só se o keyframe os trouxer — um
keyframe sem eles comporta-se exactamente como antes, portanto acrescentar
isto não mexeu em nenhuma animação existente.

Canais: `peLx`, `peLy`, `peRx`, `peRy`, `cabecaX`, `cabecaY`.
*/
function aplicarPesECabeca(rig, K) {
    if (!rig || !K) return;
    const n = (v) => typeof v === 'number';

    if (rig.lFoot) {
        rig.lFoot.rotation.set(n(K.peLx) ? K.peLx : rig.lFoot.rotation.x,
            n(K.peLy) ? K.peLy : rig.lFoot.rotation.y, 0);
    }
    if (rig.rFoot) {
        rig.rFoot.rotation.set(n(K.peRx) ? K.peRx : rig.rFoot.rotation.x,
            n(K.peRy) ? K.peRy : rig.rFoot.rotation.y, 0);
    }
    // A cabeça pendura no pescoço; é ele que roda.
    if (rig.neck && (n(K.cabecaX) || n(K.cabecaY))) {
        rig.neck.rotation.set(n(K.cabecaX) ? K.cabecaX : 0,
            n(K.cabecaY) ? K.cabecaY : 0, 0);
    }
}

/*
POSE DO ARREMESSO LATERAL — um keyframe do ThrowInClip escrito no rig.

`giroAlvo` é o ângulo com sinal entre a frente do corpo e a direcção do
lançamento, já limitado ao `giroMax` (ver prepararGiroLateral em player.js).
No editor, onde não há ninguém a quem atirar, vale 0 e o gesto sai de frente.

Só mexe no esqueleto. A altura do corpo, as mãos a fecharem-se na bola e a
bola a seguir as mãos são do jogo, e ficam no player.js: uma pose não tem
bola nenhuma para segurar.
*/
function aplicarPoseLateral(rig, K, giroAlvo) {
    if (!rig) return;
    const L = LateralPose;

    rig.pelvis.position.set(0, 2.6, 0);
    rig.pelvis.rotation.set(K.pelvisX, 0, 0);

    /*
    GIRO DA CINTURA para o lado do arremesso. Vai no `chest` e não na
    pélvis: rodar a bacia levava as pernas atrás dela e os pés ficavam
    torcidos. A cintura é o que roda num lateral — tronco, ombros e braços
    acompanham, os pés ficam plantados.

    O `K.giro` é a fracção do ângulo neste keyframe: negativa na armação, que
    é a cintura a carregar para o lado contrário, e positiva no chicote.
    */
    const giroY = (K.giro || 0) * (giroAlvo || 0);
    rig.chest.rotation.set(K.chest, giroY, 0);

    rig.lArm.rotation.set(K.bracoX, 0, K.bracoZ);
    rig.rArm.rotation.set(K.bracoX, 0, -K.bracoZ);
    rig.lElbow.rotation.set(K.cotovelo, 0, 0);
    rig.rElbow.rotation.set(K.cotovelo, 0, 0);

    const frenteR = (L.peFrente === 'r');
    const pernaF = frenteR ? rig.rLeg : rig.lLeg;
    const joelhoF = frenteR ? rig.rKnee : rig.lKnee;
    const pernaT = frenteR ? rig.lLeg : rig.rLeg;
    const joelhoT = frenteR ? rig.lKnee : rig.rKnee;

    pernaF.rotation.set(K.coxaFrente, 0, 0);
    joelhoF.rotation.set(K.joelhoFrente, 0, 0);
    pernaT.rotation.set(K.coxaTras, 0, 0);
    joelhoT.rotation.set(K.joelhoTras, 0, 0);

    rig.lFoot.rotation.set(0, Math.PI / 16, 0);
    rig.rFoot.rotation.set(0, -Math.PI / 16, 0);

    aplicarPesECabeca(rig, K);
}

/*
POSE DO REMATE — um keyframe do ShotClip escrito no rig.

A perna de apoio e a de remate saem de `ShotClip.pernaChute`, para o clip
servir um canhoto trocando uma letra.

Enquanto isto corre, o `animateBones` do player.js é saltado: o clip manda em
tudo o que toca, e o ciclo de passada reescrevia as pernas no mesmo frame.

Só mexe no esqueleto; a altura do corpo é do jogo e fica no player.js.
*/
function aplicarPoseRemate(rig, K) {
    if (!rig) return;

    const chuteR = (ShotClip.pernaChute === 'r');
    const pernaC = chuteR ? rig.rLeg : rig.lLeg;
    const joelhoC = chuteR ? rig.rKnee : rig.lKnee;
    const pernaA = chuteR ? rig.lLeg : rig.rLeg;
    const joelhoA = chuteR ? rig.lKnee : rig.rKnee;

    // A bacia inclina e RODA: no remate em corrida a força vem da rotação,
    // não da inclinação (essa é do tiro de meta, com o corpo parado).
    rig.pelvis.position.set(0, 2.6, 0);
    rig.pelvis.rotation.set(0, chuteR ? K.pelvisY : -K.pelvisY, K.leanZ);

    rig.chest.rotation.set(K.chest, chuteR ? K.chestY : -K.chestY, 0);

    pernaC.rotation.set(K.coxaChute, 0, 0);
    joelhoC.rotation.set(K.joelhoChute, 0, 0);
    pernaA.rotation.set(K.coxaApoio, 0, 0);
    joelhoA.rotation.set(K.joelhoApoio, 0, 0);

    rig.lArm.rotation.set(K.bracoLx, 0, K.bracoLz);
    rig.rArm.rotation.set(K.bracoRx, 0, K.bracoRz);
    rig.lElbow.rotation.x = K.cotoveloL;
    rig.rElbow.rotation.x = K.cotoveloR;

    rig.lFoot.rotation.set(0, Math.PI / 16, 0);
    rig.rFoot.rotation.set(0, -Math.PI / 16, 0);

    aplicarPesECabeca(rig, K);
}

/*
POSE DO LANÇAMENTO COM AS MÃOS DO GUARDA-REDES — GoalkeeperThrowClip.
*/
function aplicarPoseLancamentoGR(rig, K) {
    if (!rig) return;
    rig.chest.rotation.x = K.chest;
    rig.chest.rotation.z = 0;
    rig.pelvis.rotation.x = 0;
    rig.pelvis.rotation.z = 0;

    rig.lLeg.rotation.x = K.coxaL;
    rig.lKnee.rotation.x = K.joelhoL;
    rig.rLeg.rotation.x = K.coxaR;
    rig.rKnee.rotation.x = K.joelhoR;

    rig.lArm.rotation.x = K.bracoLx;
    rig.lArm.rotation.z = K.bracoLz;
    rig.rArm.rotation.x = K.bracoRx;
    rig.rArm.rotation.z = K.bracoRz;

    rig.lElbow.rotation.x = K.cotoveloL;
    rig.rElbow.rotation.x = K.cotoveloR;

    aplicarPesECabeca(rig, K);
}

/*
POSE DO DOMÍNIO DE BOLA ORIENTADO PELA DIREITA — BallControlRightClip.
Perna esquerda (apoio) ligeiramente atrás e fletida.
Perna direita (controlo) à frente, abrindo para amortecer e orientar o toque de saída.
*/
function aplicarPoseDominioDireito(rig, K) {
    if (!rig) return;
    rig.chest.rotation.x = K.chest || 0;
    rig.chest.rotation.y = K.chestY || 0;
    rig.chest.rotation.z = 0;

    rig.pelvis.rotation.x = 0;
    rig.pelvis.rotation.y = K.pelvisY || 0;
    rig.pelvis.rotation.z = K.leanZ || 0;

    rig.lLeg.rotation.x = K.coxaL || 0;
    rig.lLeg.rotation.y = 0;
    rig.lLeg.rotation.z = 0;
    rig.lKnee.rotation.x = K.joelhoL || 0;

    rig.rLeg.rotation.x = K.coxaR || 0;
    rig.rLeg.rotation.y = 0;
    rig.rLeg.rotation.z = K.coxaRz || 0;
    rig.rKnee.rotation.x = K.joelhoR || 0;

    rig.lArm.rotation.x = K.bracoLx || 0;
    rig.lArm.rotation.z = K.bracoLz || 0;
    rig.rArm.rotation.x = K.bracoRx || 0;
    rig.rArm.rotation.z = K.bracoRz || 0;

    rig.lElbow.rotation.x = K.cotoveloL || 0;
    rig.rElbow.rotation.x = K.cotoveloR || 0;

    aplicarPesECabeca(rig, K);
}

/*
POSE DO CHUTÃO DO GUARDA-REDES — GoalkeeperKickClip.

`norm` é o tempo normalizado 0..1 do clip, e serve só para os braços abrirem
progressivamente: é o único canal do gesto que não vem dos keyframes.
*/
function aplicarPoseChutaoGR(rig, K, norm) {
    if (!rig) return;
    const chuteR = (GoalkeeperKickClip.pernaChute === 'r');
    const pernaC = chuteR ? rig.rLeg : rig.lLeg;
    const joelhoC = chuteR ? rig.rKnee : rig.lKnee;
    const pernaA = chuteR ? rig.lLeg : rig.rLeg;
    const joelhoA = chuteR ? rig.lKnee : rig.rKnee;

    pernaC.rotation.set(K.coxaChute, 0, 0);
    joelhoC.rotation.set(K.joelhoChute, 0, 0);
    pernaA.rotation.set(K.coxaApoio, 0, 0);
    joelhoA.rotation.set(K.joelhoApoio, 0, 0);

    rig.chest.rotation.set(K.chest, 0, 0);
    rig.pelvis.rotation.set(0, 0, 0);

    rig.lArm.rotation.x = K.bracoX;
    rig.rArm.rotation.x = K.bracoX;
    rig.lElbow.rotation.x = K.cotovelo;
    rig.rElbow.rotation.x = K.cotovelo;

    const abreBraco = 0.05 + 0.45 * (norm || 0);
    rig.lArm.rotation.z = abreBraco;
    rig.rArm.rotation.z = -abreBraco;

    aplicarPesECabeca(rig, K);
}

/*
POSE DO TIRO DE META / BOLA PARADA DO CHÃO — GoalkeeperGroundKickClip.

PIVÔ NO PÉ DE APOIO: o pé de apoio está em x = ±0.4 no espaço local da bacia,
e a inclinação lateral (`leanZ`) roda o corpo inteiro em BLOCO à volta dele,
como uma unidade rígida — sem quebrar a cintura nem dobrar a coluna de lado.
É por isso que a bacia se desloca em vez de só rodar.

`opts.poseAnterior` e `opts.peso` são a MISTURA DE ENTRADA (corrida -> chute):
cada canal sai da pose com que a corrida acabou e vai até ao valor do clip.
Sem os passar — como o editor faz — a pose do clip é escrita directamente,
que é o mesmo que uma mistura já terminada.

`corpo` é o Group do jogador, para a altura; pode vir a nulo.
*/
function aplicarPoseChuteChaoGR(rig, K, corpo, opts) {
    if (!rig) return;
    const P0 = (opts && opts.poseAnterior) || null;
    const w = (opts && typeof opts.peso === 'number') ? opts.peso : 1;
    const bl = (de, para) => (P0 ? de + (para - de) * w : para);

    const chuteR = (GoalkeeperGroundKickClip.pernaChute === 'r');
    const pernaC = chuteR ? rig.rLeg : rig.lLeg;
    const joelhoC = chuteR ? rig.rKnee : rig.lKnee;
    const pernaA = chuteR ? rig.lLeg : rig.rLeg;
    const joelhoA = chuteR ? rig.lKnee : rig.rKnee;

    const pivotX = chuteR ? 0.4 : -0.4;
    const leanZ = K.leanZ;
    const cosL = Math.cos(leanZ);
    const sinL = Math.sin(leanZ);

    rig.pelvis.position.x = bl(P0 ? P0.pelvisPx : 0, pivotX * (1 - cosL) - 2.6 * sinL);
    rig.pelvis.position.y = bl(P0 ? P0.pelvisPy : 2.6, 2.6 * cosL - pivotX * sinL);
    rig.pelvis.position.z = 0;

    rig.pelvis.rotation.z = bl(P0 ? P0.pelvisRz : 0, leanZ);
    rig.pelvis.rotation.x = bl(P0 ? P0.pelvisRx : 0, K.pitchX || 0);
    rig.pelvis.rotation.y = 0;

    rig.chest.rotation.x = bl(P0 ? P0.chest : 0, K.chest);
    rig.chest.rotation.y = 0;
    rig.chest.rotation.z = 0;

    pernaA.rotation.x = bl(P0 ? P0.coxaA : 0, K.coxaApoio);
    pernaA.rotation.y = 0;
    pernaA.rotation.z = 0;
    joelhoA.rotation.x = bl(P0 ? P0.joelhoA : 0, K.joelhoApoio);
    joelhoA.rotation.y = 0;
    joelhoA.rotation.z = 0;

    pernaC.rotation.x = bl(P0 ? P0.coxaC : 0, K.coxaChute);
    pernaC.rotation.y = 0;
    pernaC.rotation.z = bl(P0 ? P0.coxaCz : 0, K.coxaChuteZ || 0);
    joelhoC.rotation.x = bl(P0 ? P0.joelhoC : 0, K.joelhoChute);
    joelhoC.rotation.y = 0;
    joelhoC.rotation.z = 0;

    rig.lArm.rotation.x = bl(P0 ? P0.bracoLx : 0, K.bracoLx);
    rig.lArm.rotation.z = bl(P0 ? P0.bracoLz : 0, K.bracoLz);
    rig.rArm.rotation.x = bl(P0 ? P0.bracoRx : 0, K.bracoRx);
    rig.rArm.rotation.z = bl(P0 ? P0.bracoRz : 0, K.bracoRz);

    rig.lElbow.rotation.x = bl(P0 ? P0.cotoveloL : 0, K.cotoveloL);
    rig.rElbow.rotation.x = bl(P0 ? P0.cotoveloR : 0, K.cotoveloR);

    aplicarPesECabeca(rig, K);

    if (corpo) {
        corpo.position.y = bl(P0 ? P0.corpoY : ALTURA_BASE_Y, ALTURA_BASE_Y + K.altura);
    }
}

/*
=============================================================================
AMOSTRAGEM DOS CLIPS
=============================================================================
Cada uma lê um clip do config.js num tempo normalizado 0..1 e devolve um
keyframe interpolado — o que depois se dá às `aplicarPose*` acima.

Vieram do topo do js/player.js. Estão aqui porque amostrar e aplicar são as
duas metades do mesmo gesto, e o editor de animação precisa das duas sem
carregar o jogo inteiro.

A interpolação é LINEAR entre keyframes vizinhos, de propósito: os clips são
escritos à mão frame a frame, e uma curva suave por cima deles mudava poses
que já foram afinadas a olho.
=============================================================================
*/
/*
Amostra o clip do chutão do guarda-redes (GoalkeeperKickClip) num tempo
normalizado 0..1, interpolando linearmente entre os dois keyframes vizinhos.
Devolve um objecto com os mesmos campos de um keyframe.
*/
function amostrarClipChuteGR(norm) {
    const fr = GoalkeeperKickClip.frames;
    const n = fr.length;
    const pos = THREE.MathUtils.clamp(norm, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(pos));
    const u = pos - i;
    const a = fr[i], b = fr[i + 1];
    const mix = (k) => a[k] + (b[k] - a[k]) * u;
    return {
        chest: mix('chest'),
        coxaChute: mix('coxaChute'),
        joelhoChute: mix('joelhoChute'),
        coxaApoio: mix('coxaApoio'),
        joelhoApoio: mix('joelhoApoio'),
        bracoX: mix('bracoX'),
        cotovelo: mix('cotovelo'),
        altura: mix('altura')
    };
}

/*
Amostra o clip do chute de bola parada / tiro de meta (GoalkeeperGroundKickClip),
fiel às fases das Figuras Biomecânicas com pivô no pé de apoio.
*/
function amostrarClipChuteChaoGR(norm) {
    const fr = GoalkeeperGroundKickClip.frames;
    const n = fr.length;
    const pos = THREE.MathUtils.clamp(norm, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(pos));
    const u = pos - i;
    const a = fr[i], b = fr[i + 1];
    const mix = (k) => (a[k] !== undefined && b[k] !== undefined) ? a[k] + (b[k] - a[k]) * u : 0;
    return {
        leanZ: mix('leanZ'),
        pitchX: mix('pitchX'),
        chest: mix('chest'),
        coxaChute: mix('coxaChute'),
        joelhoChute: mix('joelhoChute'),
        coxaChuteZ: mix('coxaChuteZ'),
        coxaApoio: mix('coxaApoio'),
        joelhoApoio: mix('joelhoApoio'),
        bracoLx: mix('bracoLx'),
        bracoLz: mix('bracoLz'),
        bracoRx: mix('bracoRx'),
        bracoRz: mix('bracoRz'),
        cotoveloL: mix('cotoveloL'),
        cotoveloR: mix('cotoveloR'),
        altura: mix('altura')
    };
}

/*
Amostra o clip do remate (ShotClip) num tempo normalizado 0..1.
*/
function amostrarClipRemate(norm) {
    const fr = ShotClip.frames;
    const n = fr.length;
    const pos = THREE.MathUtils.clamp(norm, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(pos));
    const u = pos - i;
    const a = fr[i], b = fr[i + 1];
    const mix = (k) => a[k] + (b[k] - a[k]) * u;
    return {
        leanZ: mix('leanZ'), pelvisY: mix('pelvisY'),
        chest: mix('chest'), chestY: mix('chestY'),
        coxaChute: mix('coxaChute'), joelhoChute: mix('joelhoChute'),
        coxaApoio: mix('coxaApoio'), joelhoApoio: mix('joelhoApoio'),
        bracoLx: mix('bracoLx'), bracoLz: mix('bracoLz'),
        bracoRx: mix('bracoRx'), bracoRz: mix('bracoRz'),
        cotoveloL: mix('cotoveloL'), cotoveloR: mix('cotoveloR'),
        altura: mix('altura')
    };
}

/*
Amostra o clip do arremesso lateral (ThrowInClip) num tempo normalizado 0..1.
*/
function amostrarClipLateral(norm) {
    const fr = ThrowInClip.frames;
    const n = fr.length;
    const pos = THREE.MathUtils.clamp(norm, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(pos));
    const u = pos - i;
    const a = fr[i], b = fr[i + 1];
    const mix = (k) => a[k] + (b[k] - a[k]) * u;
    return {
        chest: mix('chest'),
        pelvisX: mix('pelvisX'),
        bracoX: mix('bracoX'),
        bracoZ: mix('bracoZ'),
        cotovelo: mix('cotovelo'),
        // Fracção do giro da cintura neste ponto do gesto (ver
        // prepararGiroLateral): negativa na armação, positiva no chicote.
        giro: mix('giro'),
        coxaFrente: mix('coxaFrente'),
        joelhoFrente: mix('joelhoFrente'),
        coxaTras: mix('coxaTras'),
        joelhoTras: mix('joelhoTras'),
        altura: mix('altura')
    };
}

function amostrarClipLancamentoGR(norm) {
    const fr = GoalkeeperThrowClip.frames;
    const n = fr.length;
    const pos = THREE.MathUtils.clamp(norm, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(pos));
    const u = pos - i;
    const a = fr[i], b = fr[i + 1];
    const mix = (k) => a[k] + (b[k] - a[k]) * u;
    return {
        chest: mix('chest'),
        coxaL: mix('coxaL'),
        joelhoL: mix('joelhoL'),
        coxaR: mix('coxaR'),
        joelhoR: mix('joelhoR'),
        bracoLx: mix('bracoLx'),
        bracoLz: mix('bracoLz'),
        bracoRx: mix('bracoRx'),
        bracoRz: mix('bracoRz'),
        cotoveloL: mix('cotoveloL'),
        cotoveloR: mix('cotoveloR'),
        altura: mix('altura')
    };
}

/*
Amostra o clip do domínio orientado pela direita (BallControlRightClip) num tempo normalizado 0..1.
*/
function amostrarClipDominioDireito(norm) {
    const fr = BallControlRightClip.frames;
    const n = fr.length;
    const pos = THREE.MathUtils.clamp(norm, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(pos));
    const u = pos - i;
    const a = fr[i], b = fr[i + 1];
    const mix = (k) => (a[k] !== undefined && b[k] !== undefined) ? a[k] + (b[k] - a[k]) * u : 0;
    return {
        chest: mix('chest'),
        chestY: mix('chestY'),
        pelvisY: mix('pelvisY'),
        leanZ: mix('leanZ'),
        coxaL: mix('coxaL'),
        joelhoL: mix('joelhoL'),
        coxaR: mix('coxaR'),
        joelhoR: mix('joelhoR'),
        coxaRz: mix('coxaRz'),
        bracoLx: mix('bracoLx'),
        bracoLz: mix('bracoLz'),
        bracoRx: mix('bracoRx'),
        bracoRz: mix('bracoRz'),
        cotoveloL: mix('cotoveloL'),
        cotoveloR: mix('cotoveloR'),
        altura: mix('altura')
    };
}


/*
POSE DA PASSADA — escreve no rig o ciclo de andar/trotar/correr.

O ciclo em si vem do `getGaitPose(t, velocidade)` do js/utils.js, que já era
função pura e lê as amplitudes do `GaitModel` (config.js). Isto aqui é a outra
metade: pôr esses ângulos no esqueleto.

NÃO É UM CLIP. Não há keyframes para editar — há fórmulas com senos, e o que
se afina são as CONSTANTES do GaitModel: a amplitude da coxa, quanto o joelho
oscila, os metros por passada. É por isso que o editor tem para isto um painel
de constantes e não uma linha do tempo.

`opts`:
  `amp`            0..1, encolhe a passada em deslocação lateral
  `lateralidade`   0..1, quanto do movimento é de lado
  `ladoMov`        +1/-1, para que lado do corpo
  `paraTras`       true se anda de costas (o tronco não inclina como a correr)
  `cintura`        ângulo Y do tronco, a acompanhar para onde olha

Chamada sem `opts`, dá a passada frontal — que é o que o editor mostra.
*/
function aplicarPosePassada(rig, P, t, opts) {
    if (!rig || !P) return;
    const o = opts || {};
    const amp = (typeof o.amp === 'number') ? o.amp : 1;
    const lateralidade = o.lateralidade || 0;
    const ladoMov = o.ladoMov || 0;
    const movingBackwards = !!o.paraTras;
    const cintura = o.cintura || 0;

    /*
    SUAVIZAÇÃO: a passada é escrita com `set` directo, e é isso que se quer a
    correr — a pose é a verdade e não há nada para misturar. A velocidades
    baixas não: o `animateBones` troca de ramo aos 0.1 m/s, e um jogador que
    pára com a perna a meio da passada vê o ramo neutro a desfazê-la devagar
    (lerp de 0.25) e este a refazê-la de repente no frame em que o limiar é
    atravessado outra vez. Medido: saltos de 30 graus num frame com o jogador
    parado — a vibração no lugar.

    Com `suavizacao` < 1 a pose entra por lerp, e os dois ramos deixam de
    puxar a perna em sentidos contrários. Quem chama passa a velocidade
    normalizada; sem opção nenhuma, comporta-se como sempre.
    */
    const sv = (typeof o.suavizacao === 'number') ? Math.max(0, Math.min(1, o.suavizacao)) : 1;
    const por = (v, alvo) => (sv >= 1) ? alvo : lerpTo(v, alvo, 0.18 + 0.82 * sv);

    rig.lLeg.rotation.x = por(rig.lLeg.rotation.x, P.lHip * amp);
    rig.lKnee.rotation.x = por(rig.lKnee.rotation.x, P.lKnee * amp);
    rig.lFoot.rotation.x = por(rig.lFoot.rotation.x, P.lFoot * amp);
    rig.rLeg.rotation.x = por(rig.rLeg.rotation.x, P.rHip * amp);
    rig.rKnee.rotation.x = por(rig.rKnee.rotation.x, P.rKnee * amp);
    rig.rFoot.rotation.x = por(rig.rFoot.rotation.x, P.rFoot * amp);
    rig.lArm.rotation.x = por(rig.lArm.rotation.x, P.lArm * amp);
    rig.rArm.rotation.x = por(rig.rArm.rotation.x, P.rArm * amp);

    // O cotovelo abre a andar e fecha a correr — era fixo em -1.2, que
    // é postura de sprint aplicada também a quem está a passear.
    rig.lElbow.rotation.x = P.cotovelo; rig.rElbow.rotation.x = P.cotovelo;

    /*
    Abdução das ancas no passo lateral: as pernas abrem e fecham em
    oposição de fase, e o par inteiro pende para o lado do movimento.
    Dentro do limite anatómico da anca (JointLimits.hip.z, +45°/-30°) —
    `LateralGait.abertura` é 0.30 rad (~17°), com folga de sobra.
    */
    if (lateralidade > 0.001) {
        const A = LateralGait.abertura * lateralidade;
        const osc = Math.sin(t * Math.PI * 2) * A;
        rig.lLeg.rotation.z = lerpTo(rig.lLeg.rotation.z, ladoMov * A * 0.5 + osc, 0.35);
        rig.rLeg.rotation.z = lerpTo(rig.rLeg.rotation.z, ladoMov * A * 0.5 - osc, 0.35);
    } else {
        rig.lLeg.rotation.z = lerpTo(rig.lLeg.rotation.z, 0); rig.rLeg.rotation.z = lerpTo(rig.rLeg.rotation.z, 0);
    }
    rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, Math.PI / 16); rig.rArm.rotation.z = lerpTo(rig.rArm.rotation.z, -Math.PI / 16);

    // Tronco: a prumo a andar, inclinado a correr. Era 0.3 rad sempre.
    // De lado o tronco também não vai inclinado como numa corrida.
    const inclinacao = (movingBackwards ? P.tronco * 0.4 : P.tronco) * amp;
    rig.chest.rotation.x = inclinacao + Math.sin(t * Math.PI * 2) * 0.04;
    // Mesma cintura a acompanhar a cabeça também a correr/andar — sem
    // isto ficava só parado a olhar de lado com o tronco reto.
    rig.chest.rotation.y = lerpTo(rig.chest.rotation.y, cintura);
}
