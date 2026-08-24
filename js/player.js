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

class FootballPlayer {
    constructor(id, color1, color2, team) {
        this.id = id; this.team = team; this.role = 'def';
        this.hasBall = false;
        this.corCamisa = color1;
        this.num = 1;
        this.pos = 'GK';

        this.dirZ = (this.team === 'TeamA') ? 1 : -1;
        this.targetGoalZ = (CAMPO_COMP / 2) * this.dirZ;
        this.ownGoalZ = -(CAMPO_COMP / 2) * this.dirZ;

        /*
        Aparência (cabelo, pele, chuteiras). Determinística, para o mesmo jogador
        sair sempre igual entre recargas — ver escolherAparencia em config.js.
        Cada equipa recebe o seu próprio baralho de onze aparências, com as
        proporções pedidas garantidas.
        */
        this.aparencia = escolherAparencia(this.id, 11, team === 'TeamA' ? 0 : 1);

        const gerado = this.buildBody(color1, color2);
        this.model = gerado.corpo; this.rig = gerado.rig;

        this.baseTarget = new THREE.Vector3();
        this.dynamicTarget = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.speedMult = 3.5;

        this.fsm = new PlayerFSM(this);
        this.animTimer = 0;
        this.animPhase = 0;
        this.touchWaitTimer = 0;

        this.passTarget = null;
        this.dribbleTargetX = 0;
        /*
        Conduzir PARA TRÁS. Levantada pelo actPass quando não há bom recetor nem
        ninguém perto para atrasar: volta com a bola e espera que apareça linha,
        em vez de a atirar para a lateral. Ver o case CARRY em fsm.js.
        */
        this.carryRecuo = false;
        this.dribbleOpponent = null;
        this.dribbleCooldownTimer = 0;
        this.isCross = false;
        this.isThroughBall = false;
        this.throughBallTarget = null;
        // Ponto do leque que este passe mira (ver PassTypes). null = aos pés.
        this.passAimPoint = null;
        this.passTipo = 'direct';
        this.overlapTimer = 0;
        this.passInertiaTimer = 0;
        this.passInertiaZDir = null;
        // Saída de bola sorteada para esta posse (ver decidirSaidaGK).
        this.gkSaida = null;
        // Está a fazer FWR/AFT_SUPPORT neste momento (ver temVagaDeApoio).
        this.apoioAtivo = false;
        this.peitoTimer = 0;   // gesto de domínio no peito (ver CHEST_CONTROL)
        this.peitoCola = 0;    // segundos que faltam com a bola colada ao peito
        this.peitoIntens = 0;  // intensidade da pose (ver aplicarCamadaPeito)
        this.peitoBom = false; // ganhou o sorteio do amortecimento?
        this.peitoHopTimer = 0; // pequeno salto opcional (ver controlarNoPeito)
        this.jumpApex = 0;     // subida deste salto (ver SaltoCabeceio)
        this.headLeanTimer = 0; // cabeceio de pé, sem saltar (ver animateBones)
        this.cinturaAlvoY = 0;  // cintura acompanha o giro da cabeça p/ a bola

        this.decisionTimer = 0;
        this.carryTouchGrace = 0;
        this.actionState = null;

        // Perception System (ver js/perception.js) — camada só de leitura para
        // o BT: percebe, não decide. Fase 1: só bola/interceptação/claim.
        // Estrutura completa (secção 13 do spec) já declarada para as fases
        // seguintes não precisarem de mexer aqui outra vez.
        this.blackboard = {
            ball: {
                visible: false, distance: Infinity, direction: { x: 0, z: 0 },
                velocity: { x: 0, z: 0 }, speed: 0, approaching: false, movingAway: false,
                controllable: false, interceptable: false, interceptionPoint: null,
                timeToIntercept: Infinity, confidence: 0,
                teammatePossession: false, opponentPossession: false
            },
            teammates: [], opponents: [],
            space: { spaceAhead: 0, spaceBehindDefense: 0, spaceLeft: 0, spaceRight: 0 },
            pressure: { level: 0, nearestOpponent: null },
            tactical: { attackingSpaceAvailable: false, passingLaneAvailable: false, supportAvailable: false },
            events: [], currentIntent: null
        };
        // Desfasa os jogadores para não recalcularem percepção todos no
        // mesmo frame (ver Perception.tick, ~15Hz por jogador).
        this.perceptionTimer = Math.random() * 0.07;
        // Segundos em que este jogador não pode tocar na bola (ver BallControl).
        this.touchLock = 0;

        // Corrida ao espaço (ver RunIntoSpaceModel/actRunIntoSpace): destino,
        // prazo, quem tinha a bola ao arrancar e o arrefecimento entre
        // corridas.
        this.runTarget = null;
        this.runTimer = 0;
        this.runCarrier = null;
        this.runCooldown = 0;

        // `marcRef` é a escolha do nível de equipa (atribuirMarcacoesDaEquipa,
        // team_bt.js): quem este jogador acompanha, com histerese.
        // `markingTarget` é a EXECUÇÃO dessa escolha no frame corrente — a
        // folha Marcar do BT escreve-o e entra no estado MARKING da FSM; o
        // PlayerAI.tick limpa-o no início de cada tick. A marcação posicional
        // (aplicarMarcacaoPosicional) continua a inclinar o slot por cima.
        this.markingTarget = null;
        this.marcRef = null;      // adversário que está a acompanhar, ou null
        this.marcTimer = 0;       // segundos desde a última mudança de decisão

        // Micro-movimento no alvo (ver aplicarInquietacao em team_bt.js).
        this.inqAngulo = 0;
        this.inqRaio = 0;
        this.inqTimer = 0;
        this.inqIntervalo = 0;
        this.isCovering = false;
        this.markCount = 0;

        // Estado interno do guarda-redes — por instância, não global.
        // Antes eram window.goleiroEstado etc., partilhados pelos dois GKs,
        // o que fazia um interferir com o estado do outro.
        this.gkEstado = 'idle';
        this.gkStyle = 'defensive';     // estado actual (dinâmico) — ver updateGkStyle em team_bt.js
        this.gkStyleBase = 'defensive'; // traço fixo do jogador, atribuído em match.js
        this.fbStyle = 'defensive';     // espelho do playing style, lido por attackFullBack

        // Playing style (ver PlayingStyles em config.js e playing_styles.js).
        // `playingStyleFixo` é a escolha explícita e sobrevive a mudanças de
        // formação; `playingStyle` é a chave em vigor depois da validação.
        this.playingStyle = null;
        this.playingStyleFixo = null;
        this.styleFlags = {};
        this.gkTempoMergulho = 0;
        this.gkDirMergulho = 0;
        this.gkTipoMergulho = 'baixo';
        this.gkAlvoX = 0;      // x previsto da bola, usado pelo estado 'maos'
        this.gkAlvoY = 1.0;    // altura prevista da bola, usada pelo mergulho
        this.dive = null;      // estado do mergulho em curso (ver js/gk_dive.js)
        this.gkKickAction = null;  // ActionState do chutão (estado 'chutando')
        this.gkKickNorm = 0;
        this.gkKickTipo = null;    // 'chao' no tiro de meta; null = das mãos
        this.gkKickBlend = null;   // mistura corrida->chute do chão (ver iniciarBlendChuteChao)
        this.gkTiroFase = 0;       // 0 caminhar até à linha, 1 corrida
        this.gkTiroAlvo = null;    // ponto de arranque do tiro de meta
        this.gkReagiu = false;
        this.gkDelayReacao = 0;

        // Sprite para mostrar o PlayerNumber, PlayerBT e PlayerPOS acima da cabeça
        this.labelCanvas = document.createElement('canvas');
        this.labelCanvas.width = 1024;
        this.labelCanvas.height = 128;
        this.labelCtx = this.labelCanvas.getContext('2d');
        this.labelTex = new THREE.CanvasTexture(this.labelCanvas);
        this.labelMat = new THREE.SpriteMaterial({ map: this.labelTex, transparent: true, depthWrite: false });
        this.labelSprite = new THREE.Sprite(this.labelMat);
        // Parent is scaled down, we scale up sprite. Canvas is 1024x128 (8:1).
        this.labelSprite.scale.set(20, 2.5, 1);
        this.labelSprite.position.set(0, 8.5, 0); // Acima da cabeça (unscaled space)
        this.model.add(this.labelSprite);
        this.lastLabelText = '';
        this.labelSprite.visible = false;

        // Action Banner
        this.actionCanvas = document.createElement('canvas');
        this.actionCanvas.width = 512;
        this.actionCanvas.height = 128;
        this.actionCtx = this.actionCanvas.getContext('2d');
        this.actionTex = new THREE.CanvasTexture(this.actionCanvas);
        this.actionTex.generateMipmaps = false;
        this.actionTex.minFilter = THREE.LinearFilter;
        this.actionMat = new THREE.SpriteMaterial({ map: this.actionTex, transparent: true, depthWrite: false });
        this.actionSprite = new THREE.Sprite(this.actionMat);
        this.actionSprite.scale.set(12, 3, 1);
        this.actionSprite.position.set(0, 11.5, 0); 
        this.model.add(this.actionSprite);
        this.actionSprite.visible = false;
        this.actionBannerTimer = 0;
    }

    /*
    Genérico (médias do painel esquerdo, por função) — só serve de FALLBACK
    quando o jogador não tem `skills` individuais (ex.: antes do
    data/player_skills.js carregar) e como referência pra gerar um time novo
    no .json (ver tools/gen_player_skills.js). Decisões em jogo usam
    skillFor(campo), que lê o skill individual real dele.
    */
    getSkill() {
        if (this.role === 'def') return TeamSkills[this.team].def;
        if (this.role === 'mid') return TeamSkills[this.team].mid;
        if (this.role === 'atk') return TeamSkills[this.team].ata;
        return TeamSkills[this.team].gk;
    }

    /*
    Skill individual (data/player_skills.js) por campo — gk/tec/marking/
    speed/strength/pass/intercept. Sem skills carregados, cai no genérico.
    As chaves em p.skills são MINÚSCULAS (gerado por tools/gen_player_skills.js)
    — normaliza aqui pra chamar com 'TEC', 'tec' ou qualquer caixa e não
    depender de quem chama acertar a grafia exacta.
    */
    skillFor(campo) {
        if (this.skills) {
            const v = this.skills[String(campo).toLowerCase()];
            if (typeof v === 'number') return v;
        }
        return this.getSkill();
    }

    /*
    Captura a pose e a pose de corpo com que a corrida de aproximação termina,
    para o clip de chute do chão entrar por mistura em vez de corte seco.

    Guarda-se: a pose das articulações que o clip escreve, a posição/rotação da
    bacia (o clip translada-a para pivotar no pé de apoio), a posição planar do
    corpo (que tem de deslizar até plantX/plantZ, não teleportar) e o
    quaternião (a corrida olha para a bola, o chute olha campo adentro).
    */
    iniciarBlendChuteChao(gkCorpo, gkRig, plantX, plantZ) {
        const chuteR = (GoalkeeperGroundKickClip.pernaChute === 'r');
        const pernaC = chuteR ? gkRig.rLeg : gkRig.lLeg;
        const joelhoC = chuteR ? gkRig.rKnee : gkRig.lKnee;
        const pernaA = chuteR ? gkRig.lLeg : gkRig.rLeg;
        const joelhoA = chuteR ? gkRig.lKnee : gkRig.rKnee;

        this.gkKickBlend = {
            t: 0,
            w: 0,
            dur: (typeof GK_GROUND_KICK_BLEND === 'number') ? GK_GROUND_KICK_BLEND : 0.14,
            plantX, plantZ,
            origemX: gkCorpo.position.x,
            origemZ: gkCorpo.position.z,
            quatOrigem: gkCorpo.quaternion.clone(),
            quatAlvo: null,
            pose: {
                pelvisPx: gkRig.pelvis.position.x,
                pelvisPy: gkRig.pelvis.position.y,
                pelvisRx: gkRig.pelvis.rotation.x,
                pelvisRz: gkRig.pelvis.rotation.z,
                chest: gkRig.chest.rotation.x,
                coxaC: pernaC.rotation.x,
                coxaCz: pernaC.rotation.z,
                joelhoC: joelhoC.rotation.x,
                coxaA: pernaA.rotation.x,
                joelhoA: joelhoA.rotation.x,
                bracoLx: gkRig.lArm.rotation.x,
                bracoLz: gkRig.lArm.rotation.z,
                bracoRx: gkRig.rArm.rotation.x,
                bracoRz: gkRig.rArm.rotation.z,
                cotoveloL: gkRig.lElbow.rotation.x,
                cotoveloR: gkRig.rElbow.rotation.x,
                corpoY: gkCorpo.position.y
            }
        };
    }

    /*
    Pose do LATERAL: bola nas duas mãos, por cima e por trás da cabeça.

    Escrita directa (`=`, não lerp), como as outras poses de bola parada: é uma
    posição de espera, não um gesto — quem a quiser suavizar à entrada faz o
    mesmo que o chute do chão do GR (ver iniciarBlendChuteChao).

    `segurarBola` põe a bola nas mãos; passa-se false para posar o jogador sem
    lhe dar a bola (por exemplo, para afinar a pose no ecrã).
    */
    aplicarPoseLateral(segurarBola = true) {
        const rig = this.rig;
        if (!rig || typeof LateralPose === 'undefined') return;
        const L = LateralPose;

        rig.pelvis.position.set(0, 2.6, 0);
        rig.pelvis.rotation.set(L.pelvisX, 0, 0);
        rig.chest.rotation.set(L.chest, 0, 0);

        rig.lArm.rotation.set(L.bracoX, 0, L.bracoZ);
        rig.rArm.rotation.set(L.bracoX, 0, -L.bracoZ);
        rig.lElbow.rotation.set(L.cotovelo, 0, 0);
        rig.rElbow.rotation.set(L.cotovelo, 0, 0);

        const frenteR = (L.peFrente === 'r');
        const pernaF = frenteR ? rig.rLeg : rig.lLeg;
        const joelhoF = frenteR ? rig.rKnee : rig.lKnee;
        const pernaT = frenteR ? rig.lLeg : rig.rLeg;
        const joelhoT = frenteR ? rig.lKnee : rig.rKnee;

        pernaF.rotation.set(L.coxaFrente, 0, 0);
        joelhoF.rotation.set(L.joelhoFrente, 0, 0);
        pernaT.rotation.set(L.coxaTras, 0, 0);
        joelhoT.rotation.set(L.joelhoTras, 0, 0);

        rig.lFoot.rotation.set(0, Math.PI / 16, 0);
        rig.rFoot.rotation.set(0, -Math.PI / 16, 0);

        this.model.position.y = ALTURA_BASE_Y;

        if (segurarBola && typeof Match !== 'undefined' && Match.ball) {
            // Atrás da cabeça = contra a frente do corpo, por isso -Z local.
            _v1.set(0, 0, -L.bolaRecuo).applyQuaternion(this.model.quaternion);
            Match.ball.position.set(
                this.model.position.x + _v1.x,
                this.model.position.y + L.bolaAltura,
                this.model.position.z + _v1.z);
            Match.ballVel.set(0, 0, 0);
        }
    }

    /*
    Escreve no rig um frame do arremesso lateral. `K` vem do amostrarClipLateral;
    a pose de espera é o frame 0 do mesmo clip, por isso não há salto entre
    esperar e lançar.

    `segurarBola` cola a bola às mãos — verdade até ela ser largada
    (ThrowInClip.contactFrame, disparado pelo ActionState).
    */
    aplicarFrameLateral(K, segurarBola) {
        const rig = this.rig;
        if (!rig) return;
        const L = LateralPose;

        rig.pelvis.position.set(0, 2.6, 0);
        rig.pelvis.rotation.set(K.pelvisX, 0, 0);
        rig.chest.rotation.set(K.chest, 0, 0);

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

        this.model.position.y = ALTURA_BASE_Y + (K.altura || 0);

        if (segurarBola && typeof Match !== 'undefined' && Match.ball) {
            /*
            A bola segue as MÃOS, e as mãos seguem o clip: em vez de a colar a
            uma altura fixa, lê-se a posição do punho no mundo. Sem isto ela
            ficava suspensa atrás da cabeça enquanto os braços já iam à frente.
            */
            const mao = rig.lHand || rig.rHand;
            if (mao) {
                mao.updateWorldMatrix(true, false);
                _v1.setFromMatrixPosition(mao.matrixWorld);
                // Entre as duas mãos, e um pouco à frente delas.
                if (rig.lHand && rig.rHand) {
                    rig.rHand.updateWorldMatrix(true, false);
                    _v2.setFromMatrixPosition(rig.rHand.matrixWorld);
                    _v1.lerp(_v2, 0.5);
                }
                Match.ball.position.copy(_v1);
            }
            Match.ballVel.set(0, 0, 0);
        }
    }

    /*
    A bola sai das mãos. Mira um companheiro se houver linha; senão, campo
    adentro. A potência sai da balística, como no chutão do GR.
    */
    lancarLateral() {
        const T = ThrowInModel;
        const gGrav = BallPhysics.gravidade;

        const alvo = this.findPassTarget() || this.findPassTargetRelaxed('frente');
        const paraDentro = -Math.sign(this.model.position.x) || 1;

        let dx, dz;
        if (alvo && alvo.model) {
            dx = alvo.model.position.x - Match.ball.position.x;
            dz = alvo.model.position.z - Match.ball.position.z;
        } else {
            // Sem ninguém: campo adentro e um pouco para a frente.
            dx = paraDentro * 12.0;
            dz = this.dirZ * 6.0;
        }
        let dist = Math.hypot(dx, dz) || 1;

        /*
        ERRO DE EXECUÇÃO por TEC. Não havia nenhum: a direcção saía exacta para
        o alvo e a única variação era o sorteio da elevação, que muda a
        trajectória e não a pontaria.

        Dois desvios independentes — a direcção (a bola sai torta) e o peso (cai
        curta ou passa o receptor). Ver sigmaDeLateral em utils.js.
        */
        const sigma = sigmaDeLateral(this.skillFor('TEC'));
        const desvio = amostraGaussiana(Math.random) * sigma;
        const rodado = rodarNoPlano(dx, dz, desvio);
        dx = rodado.x; dz = rodado.z;

        const sigmaPeso = T.sigmaPeso * (sigma / T.sigmaMax);
        const errePeso = THREE.MathUtils.clamp(
            1 + amostraGaussiana(Math.random) * sigmaPeso, T.pesoMin, T.pesoMax);

        const forca = 1 + ((this.skillFor('STRENGTH') - 50) / 50) * T.forcaBraco;
        const alcance = THREE.MathUtils.clamp(dist * errePeso,
            T.alcanceMin, T.alcanceMax * forca);
        const elev = T.elevMin + Math.random() * (T.elevMax - T.elevMin);

        /*
        ALVO EM ALTURA: os PÉS do receptor se o lateral for curto, o PEITO dele
        se for mais longo.

        A bola sai das mãos, a uns 2 m do chão, e a fórmula de alcance
        (`v = sqrt(alcance * g / sin(2 * elev))`) só vale com a altura de
        chegada igual à de saída — tratava o ponto de saída como se fosse o
        chão, e por isso o lateral nunca mirou altura nenhuma: chegava ao
        receptor à altura que calhasse.

        `alturaSaida` é a da bola AGORA, que está nas mãos. Sem solução para o
        ângulo sorteado, cai-se na fórmula de sempre.
        */
        const alvoNoPeito = alcance > T.distanciaAosPes;
        const alturaAlvo = alvoNoPeito ? BallControl.peitoAltura : BallPhysics.raio;
        const alturaSaida = Match.ball.position.y;

        const bal = velocidadeDeLancamento(
            alcance, alturaSaida, alturaAlvo, elev, gGrav, T.elevMax * 2);

        const v = bal ? bal.v : Math.sqrt((alcance * gGrav) / Math.sin(2 * elev));
        const angulo = bal ? bal.elev : elev;
        const horiz = v * Math.cos(angulo);

        /*
        A bola SAI DE DENTRO da linha, não das mãos.

        O batedor está fora do campo (ThrowInModel.recuoDaLinha) e a bola está
        nas mãos dele, logo também está fora. Largá-la ali punha-a com
        |x| > CAMPO_LARG/2 no frame em que o estado volta a PLAY — e o
        updateBall assinalava logo OUTRO lateral, agora para a equipa
        contrária. Era isso que se via: o gesto completo, a bola a não sair, e
        o batedor a mudar de equipa.

        Repõe-se sobre a linha, meio metro para dentro, à altura das mãos.
        */
        const dentroX = -Math.sign(this.model.position.x) || 1;
        Match.ball.position.set(
            (CAMPO_LARG / 2 - 0.5) * -dentroX,
            Match.ball.position.y,
            Match.ball.position.z);

        dist = Math.hypot(dx, dz) || 1;
        Match.ballVel.set((dx / dist) * horiz, v * Math.sin(angulo), (dz / dist) * horiz);

        this.hasBall = false;
        this.touchLock = BallControl.touchLock;
        Match.ballCarrier = null;
        Match.intendedReceiver = (alvo && alvo.model) ? alvo : null;
        Match.lastTouchedTeam = this.team;
        Match.lastTouchedPlayer = this;
        Match.state = 'PLAY';
        if (typeof MatchStats !== 'undefined') MatchStats.registarPasseIniciado(this.team, 'passe');
        if (typeof EventBus !== 'undefined') EventBus.emit('THROW_IN_TAKEN', { team: this.team, p: this });
    }

    /*
    Escreve no rig um frame do remate. Mesma ideia do aplicarFrameLateral: o
    clip manda em tudo o que toca, e por isso o animateBones é saltado enquanto
    isto corre (ver update()) — senão o ciclo de passada reescrevia as pernas
    no mesmo frame.

    A perna de apoio e a de remate saem de ShotClip.pernaChute, para o clip
    servir um canhoto trocando uma letra.
    */
    aplicarFrameRemate(K) {
        const rig = this.rig;
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

        this.model.position.y = ALTURA_BASE_Y + (K.altura || 0);
    }

    /*
    COBRAR A FALTA. Dentro do alcance de remate, remata — e usa o mesmo gesto e
    o mesmo ShotClip de qualquer outro remate. Fora dele, joga em passe.

    Não há aqui balística própria: o `initiateShoot` já resolve mira, potência
    e o aviso ao guarda-redes, e o `initiatePass` já resolve o passe. Duplicar
    isso era garantir que divergiam.
    */
    baterFalta() {
        Match.state = 'PLAY';

        if (typeof emZonaDeFinalizacao === 'function' && emZonaDeFinalizacao(this)) {
            this.hasBall = true;          // o remate exige posse (ver executeShotGameplay)
            Match.ballCarrier = this;
            this.initiateShoot();
            return;
        }

        const alvo = this.findPassTarget('frente') || this.findPassTarget() ||
            this.findPassTargetRelaxed('frente');
        if (alvo) {
            this.hasBall = true;
            Match.ballCarrier = this;
            this.initiatePass(alvo);
            return;
        }

        // Sem ninguém: bola para a frente, para não ficar o jogo parado.
        const g = BallPhysics.gravidade;
        const elev = 25 * Math.PI / 180;
        const v = Math.sqrt((25.0 * g) / Math.sin(2 * elev));
        Match.ballVel.set(0, v * Math.sin(elev), this.dirZ * v * Math.cos(elev));
        Match.lastTouchedTeam = this.team;
        Match.lastTouchedPlayer = this;
    }

    /*
    COBRAR O PENÁLTI.

    Resolução própria, e de propósito: os pesos do remate em jogo corrido
    (bloqueadores a 2.2 m, penalização por distância, ângulo) não descrevem uma
    bola parada a 11 m sem oposição. Aqui é `chanceGolo` contra a colocação, e
    o duelo com o guarda-redes resolve-se pelo mergulho normal — ele reage com
    `gkDelayReacao = 0`, posto no setupSetPiece.
    */
    baterPenalti() {
        const PM = PenaltyModel;
        Match.state = 'PLAY';

        const maxC = (LARGURA_BALIZA / 2) - PM.margemPoste;
        const lado = Math.random() > 0.5 ? 1 : -1;

        // A técnica do batedor decide se a bola vai colocada ou se sai.
        const tec = this.skillFor('TEC');
        const chance = PM.chanceGolo * (0.75 + (tec / 100) * 0.35);
        const enquadrado = Math.random() < chance;

        let alvoX, alvoY;
        if (enquadrado) {
            alvoX = lado * maxC * (0.55 + Math.random() * 0.45);
            alvoY = Math.random() > 0.5 ? (0.3 + Math.random() * 0.5)
                                        : (1.1 + Math.random() * (PM.alturaMax - 1.1));
        } else {
            // Falhado: por fora do poste ou por cima.
            alvoX = lado * (LARGURA_BALIZA / 2 + 0.3 + Math.random() * 0.8);
            alvoY = (Math.random() > 0.5) ? ALTURA_BALIZA + 0.4 : 1.0;
        }

        const golZ = this.targetGoalZ;
        const dx = alvoX - Match.ball.position.x;
        const dz = golZ - Match.ball.position.z;
        const distH = Math.hypot(dx, dz) || 1;

        const pow = PM.potencia;
        const elev = (typeof elevacaoParaAlvo === 'function')
            ? elevacaoParaAlvo(distH, alvoY - BallPhysics.raio, pow)
            : Math.atan2(alvoY, distH);
        const vh = pow * Math.cos(elev);

        Match.ballVel.set((dx / distH) * vh, pow * Math.sin(elev), (dz / distH) * vh);

        this.hasBall = false;
        this.touchLock = BallControl.touchLock;
        Match.ballCarrier = null;
        Match.intendedReceiver = null;
        Match.lastTouchedTeam = this.team;
        Match.lastTouchedPlayer = this;
        window.bolaChutada = true;
        if (typeof MatchStats !== 'undefined') MatchStats[this.team].remates.tentados++;
        if (typeof EventBus !== 'undefined') EventBus.emit('PENALTY_TAKEN', { team: this.team, p: this });
    }

    resetBonesToDefault() {
        let rig = this.rig;
        if (!rig) return;
        rig.pelvis.position.set(0, 2.6, 0);
        rig.pelvis.rotation.set(0, 0, 0);
        rig.chest.rotation.set(0, 0, 0);
        
        rig.lArm.rotation.set(0, 0, Math.PI / 16);
        rig.rArm.rotation.set(0, 0, -Math.PI / 16);
        
        rig.lElbow.rotation.set(0, 0, 0);
        rig.rElbow.rotation.set(0, 0, 0);
        
        rig.lLeg.rotation.set(0, 0, Math.PI / 32);
        rig.rLeg.rotation.set(0, 0, -Math.PI / 32);
        
        rig.lKnee.rotation.set(0, 0, 0);
        rig.rKnee.rotation.set(0, 0, 0);
        
        rig.lFoot.rotation.set(0, Math.PI / 16, 0);
        rig.rFoot.rotation.set(0, -Math.PI / 16, 0);
        
        this.model.position.y = ALTURA_BASE_Y;
    }

    findPassTargetRelaxed(filterOrDir) {
        let teammates = (this.team === 'TeamA') ? Match.players : Match.opponents;
        let ownZ = this.model.position.z;
        let ownX = this.model.position.x;
        let dirZ = this.dirZ;

        // Mira o alvo do PositionBT, não a posição actual — ver alvoDePasse().
        let options = teammates.filter(p => {
            if (p.id === this.id) return false;
            let optPos = alvoDePasse(p);
            let relZ = (optPos.z - ownZ) * dirZ;
            let relX = Math.abs(optPos.x - ownX);

            if (filterOrDir === 'frente' || filterOrDir === 'forward') {
                if (relZ <= 1.0) return false;
            } else if (filterOrDir === 'lado' || filterOrDir === 'side') {
                if (Math.abs(relZ) > 4.5 || relX < 3.5) return false;
            } else if (filterOrDir === 'tras' || filterOrDir === 'back') {
                if (relZ >= -1.0) return false;
            } else if (filterOrDir === 'def' || filterOrDir === 'mid' || filterOrDir === 'atk') {
                if (p.role !== filterOrDir) return false;
            }

            return (optPos.z * dirZ > ownZ * dirZ - 15.0);
        });

        if (options.length === 0) return null;

        let safetyLimit = 1.0;
        let opponents = (this.team === 'TeamA') ? Match.opponents : Match.players;
        let ratedCandidates = [];

        for (let opt of options) {
            let optPos = alvoDePasse(opt);
            let dist = this.model.position.distanceTo(optPos);

            if (dist < 3.0 || dist > 50.0) continue;

            _line1.set(this.model.position, optPos);
            _v2.subVectors(optPos, this.model.position).normalize(); // Pass direction

            let minOppDist = 999;
            let distMarcador = 999;
            for (let i = 0; i < opponents.length; i++) {
                let opp = opponents[i];
                if (opp.role === 'gk') continue;
                
                // Ignora se o adversário estiver na direção oposta ao passe (ex: bloqueando as costas)
                _v3.subVectors(opp.model.position, this.model.position);
                if (_v3.dot(_v2) < -0.1) continue;

                _line1.closestPointToPoint(opp.model.position, true, _v1);
                let d = _v1.distanceTo(opp.model.position);
                if (d < minOppDist) {
                    minOppDist = d;
                }
                let dMarc = optPos.distanceTo(opp.model.position);
                if (dMarc < distMarcador) {
                    distMarcador = dMarc;
                }
            }

            if (minOppDist < safetyLimit) continue;

            let score = 100;
            score += minOppDist * 10; 
            
            let inDefensiveZone = (ownZ * dirZ < -10) || (optPos.z * dirZ < -10); 
            let isDefender = (this.role === 'def' || this.role === 'gk' || opt.role === 'def');
            
            if (distMarcador >= 5.0) {
                // Muito espaço, bónus esmagador (+200 pts) para garantir passe em jogadores livres
                score += 500;
            } else if (distMarcador >= 3.5) {
                // Espaço livre (+200 pts)
                score += 300;
            } else if (distMarcador >= 2.5) {
                score += 200;
            } else {
                if (inDefensiveZone || isDefender) {
                    score -= 550;
                } else {
                    score -= 165;
                }
            }

            let progression = (optPos.z - ownZ) * dirZ;
            let relX = Math.abs(optPos.x - ownX);

            if (progression > 0) {
                score += 20;
            }

            // Defensores tocando para o lado (circulação na linha defensiva)
            if (isDefender && relX >= 4.0) {
                score += 200;
            }

            ratedCandidates.push({ player: opt, score: score });
        }

        if (ratedCandidates.length > 0) {
            ratedCandidates.sort((a, b) => b.score - a.score);
            return ratedCandidates[0].player;
        }

        return null;
    }

    /*
    Passe de pânico: findPassTarget/findPassTargetRelaxed exigem a LINHA
    inteira até ao colega livre de adversários (minOppDist >= safetyLimit).
    Se houver um adversário deitado nessa linha — típico de pressão vinda de
    trás, o marcador fica exactamente entre o portador e o apoio atrás — todo
    e qualquer candidato falha ali, mesmo com o colega completamente livre no
    destino. Sem alternativa o jogador cai no fallback (`actCarry`), tenta
    driblar, é cortado, recupera, tenta outra vez — o ciclo "corta, retoma"
    reportado. Este ignora a linha por completo e olha só se o PRÓPRIO
    colega está livre no ponto de chegada — arrisca mais, mas tira a bola de
    perto em vez de ficar preso.
    */
    findPassTargetDesperate() {
        let teammates = (this.team === 'TeamA') ? Match.players : Match.opponents;
        let opponents = (this.team === 'TeamA') ? Match.opponents : Match.players;
        let ownZ = this.model.position.z;
        let dirZ = this.dirZ;

        let melhor = null, melhorNota = -Infinity;
        for (const opt of teammates) {
            if (opt.id === this.id || opt.role === 'gk') continue;
            const optPos = alvoDePasse(opt);
            const dist = this.model.position.distanceTo(optPos);
            // Ver o findPassTarget: o piso mede o colega, nao o ponto de lead.
            const distReal = this.model.position.distanceTo(opt.model.position);
            if (dist < 3.0 || dist > 35.0 || distReal < 3.0) continue;

            let distMarcador = 999;
            for (const opp of opponents) {
                if (opp.role === 'gk') continue;
                const d = optPos.distanceTo(opp.model.position);
                if (d < distMarcador) distMarcador = d;
            }
            if (distMarcador < 3.5) continue; // colega também marcado de perto: não vale a pena

            _line1.set(this.model.position, optPos);
            let bloqueadoDeSaida = false;
            _v2.subVectors(optPos, this.model.position).normalize(); // Direção do passe
            for (const opp of opponents) {
                if (opp.role === 'gk') continue;
                
                // Vetor do portador para o adversário
                _v1.subVectors(opp.model.position, this.model.position);
                
                // Se o adversário estiver na direção oposta ao passe, ignorar
                if (_v1.dot(_v2) < -0.1) continue;

                _line1.closestPointToPoint(opp.model.position, true, _v1);
                let distLinha = _v1.distanceTo(opp.model.position);
                let distPortador = this.model.position.distanceTo(opp.model.position);
                
                // Se um adversário estiver bloqueando a linha e muito perto do portador
                if (distLinha < 0.9 && distPortador < 4.5) {
                    bloqueadoDeSaida = true;
                    break;
                }
            }
            if (bloqueadoDeSaida) continue;

            // O `- dist * 0.5` que aqui estava premiava o passe mais curto de
            // todos. A forma da curva e a mesma do findPassTarget, com peso
            // menor: aqui manda quem esta desmarcado, que e o ponto do relaxed.
            let nota = distMarcador * 5 + notaDistanciaPasse(dist, 1.0, 1.0) * 0.15;
            const progression = (optPos.z - ownZ) * dirZ;
            if (progression > 0) nota += 10;

            if (nota > melhorNota) { melhorNota = nota; melhor = opt; }
        }
        return melhor;
    }

    /*
    Procura opção de passe no cone frontal (padrão: 120° de amplitude total = ±60° = Math.PI / 3).
    Garante que o jogador só gira com a bola mais de 120° se NÃO tiver opção viável à sua frente.
    */
    findPassTargetInCone(maxAngleRad = Math.PI / 3) {
        let teammates = (this.team === 'TeamA') ? Match.players : Match.opponents;
        let opponents = (this.team === 'TeamA') ? Match.opponents : Match.players;
        let skillVal = this.skillFor('PASS');
        let safetyLimit = 1.7 + (1.0 - (skillVal / 100)) * 1.5;
        let isOrchestrator = (this.playingStyle === 'orchestrator' && this.styleAtivo);
        let fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.model.quaternion).normalize();

        let ratedCandidates = [];

        for (let opt of teammates) {
            if (opt.id === this.id) continue;
            let optPos = alvoDePasse(opt);
            let dist = this.model.position.distanceTo(optPos);
            // Ver o findPassTarget: o piso mede o colega, nao o ponto de lead.
            const distReal = this.model.position.distanceTo(opt.model.position);
            let maxDist = Math.max(10, skillVal * 0.6);
            if (dist > maxDist || dist < 2.0 || distReal < 3.0) continue;

            let toTarget = new THREE.Vector3().subVectors(optPos, this.model.position);
            toTarget.y = 0;
            if (toTarget.lengthSq() < 0.01) continue;
            toTarget.normalize();

            let angle = fwd.angleTo(toTarget);
            if (angle > maxAngleRad) continue; // Fora do cone frontal de 120° (±60°)

            _line1.set(this.model.position, optPos);
            let minOppDist = 999, oppMaisPerto = null;
            let distMarcador = 999;
            for (let i = 0; i < opponents.length; i++) {
                let opp = opponents[i];
                if (opp.role === 'gk') continue;
                
                let dMarc = optPos.distanceTo(opp.model.position);
                if (dMarc < distMarcador) distMarcador = dMarc;

                _v3.subVectors(opp.model.position, this.model.position);
                if (_v3.dot(toTarget) < -0.1) continue;

                _line1.closestPointToPoint(opp.model.position, true, _v1);
                let d = _v1.distanceTo(opp.model.position);
                if (d < minOppDist) {
                    minOppDist = d;
                    oppMaisPerto = opp;
                }
            }

            let safetyEff = safetyLimit;
            if (oppMaisPerto) {
                const fatorIntercept = THREE.MathUtils.clamp(
                    1 + (oppMaisPerto.skillFor('INTERCEPT') - skillVal) / 150, 0.6, 1.6);
                safetyEff = safetyLimit * fatorIntercept;
            }
            if (isOrchestrator) safetyEff *= 0.3;
            if (minOppDist < safetyEff) continue;

            let score = notaDistanciaPasse(dist, 1.0, 1.0) * 0.6
                - (angle / maxAngleRad) * 30
                + Math.min(30, minOppDist * 4);

            if (distMarcador >= 5.0) score += 500;
            else if (distMarcador >= 3.5) score += 300;
            else if (distMarcador >= 2.5) score += 200;

            let isDefender = (this.role === 'def' || this.role === 'gk' || opt.role === 'def');
            let relX = Math.abs(optPos.x - this.model.position.x);
            if (isDefender && relX >= 4.0) score += 200;

            ratedCandidates.push({ player: opt, score: score });
        }

        if (ratedCandidates.length > 0) {
            ratedCandidates.sort((a, b) => b.score - a.score);
            return ratedCandidates[0].player;
        }
        return null;
    }

    /*
    Domínio no peito. Chamado por resolveBallContact quando a bola chega
    entre `peitoYMin` e `peitoYMax` — não se domina uma bola à altura do
    peito com o pé.

    O sorteio (TÉCNICA) decide a QUALIDADE do amortecimento, não a posse:
    ganhando, a bola morre-lhe meio metro à frente; perdendo, repica 1.5 m e
    fica disputável. Nos dois casos ele sai a jogar a seguir — quem lá chegar
    primeiro fica com ela, como em qualquer bola solta.

    A bola não salta já para essa distância: fica COLADA ao peito durante
    `peitoCola` segundos e só depois é largada (ver largarDoPeito e o estado
    CHEST_CONTROL em fsm.js).

    `altura` é o ponto de contacto medido por distanciaAoCorpo (match.js) —
    decide o pequeno salto opcional (ver peitoPuloLimiar/peitoPuloMax).
    */
    controlarNoPeito(altura) {
        const B = BallControl;
        const bom = venceuDuelo(this.skillFor('TEC'), 50, B.peitoBase);

        // De FRENTE para a bola, não de lado — sem isto ficava com a
        // orientação de quem quer que fosse a última corrida, muitas vezes
        // atravessado em relação à bola que vinha a chegar.
        lookAtBola(this.model, Match.ball.position);

        this.peitoBom = bom;
        this.peitoCola = B.peitoCola;
        this.peitoHopTimer = (altura > B.peitoPuloLimiar) ? B.peitoDur : 0;
        this.colarBolaAoPeito();

        Match.ballCarrier = null;
        this.hasBall = false;
        Match.intendedReceiver = null;
        Match.passTargetPos = null;
        Match.lastTouchedTeam = this.team;
        Match.lastTouchedPlayer = this;
        Match.possessionTeam = this.team;
        window.bolaChutada = false;

        // Não pode voltar a tocar já no frame seguinte; o repique tem de ter
        // tempo de acontecer. A duração é a mesma do gesto, para não dominar
        // com o pé enquanto ainda está dobrado para trás.
        this.touchLock = B.peitoDur;
        this.peitoTimer = 0;
        this.fsm.changeState('CHEST_CONTROL');

        if (typeof MatchStats !== 'undefined') MatchStats.registarRecepcao(this, bom);
        if (typeof EventBus !== 'undefined') EventBus.emit('CHEST_CONTROL', { p: this, bom: bom });
    }

    /*
    Encosta a bola ao peito, à frente do tronco e à altura do contacto.
    Chamado todos os frames enquanto ela está colada, para acompanhar o corpo
    caso ele ainda esteja a andar ou a rodar.
    */
    colarBolaAoPeito() {
        const B = BallControl;
        _v1.set(0, 0, B.peitoDistCorpo).applyQuaternion(this.model.quaternion);
        Match.ball.position.set(
            this.model.position.x + _v1.x,
            this.model.position.y + B.peitoAltura,
            this.model.position.z + _v1.z);
        Match.ballVel.set(0, 0, 0);
    }

    /*
    Larga a bola do peito. Em vez de a teleportar, dá-se-lhe a velocidade que
    a faz cair à distância pedida: resolve-se o tempo de queda da altura do
    peito com a velocidade vertical de saída e daí sai a componente horizontal.

    A distância vem da TÉCNICA, contínua (ver quedaNoPeito em utils.js), e não
    de um binário bom/mau com duas constantes fixas. A velocidade vertical
    acompanha a mesma fracção: quem amortece bem mata a bola para baixo, quem
    amortece mal cospe-a para cima — antes eram duas coisas descorrelacionadas,
    e via-se a bola morrer no pé mas a repicar.
    */
    largarDoPeito() {
        const B = BallControl;
        const g = BallPhysics.gravidade;
        const tec = this.skillFor('TEC');
        const dist = quedaNoPeito(tec, amostraGaussiana(Math.random));

        const frac = THREE.MathUtils.clamp(tec / 100, 0, 1);
        const vy = B.peitoVelYMa + (B.peitoVelYBoa - B.peitoVelYMa) * frac;

        const queda = Math.max(0.1, B.peitoAltura - BallPhysics.raio);
        const t = (vy + Math.sqrt(vy * vy + 2 * g * queda)) / g;
        const vh = dist / Math.max(0.1, t);

        _v1.set(0, 0, 1).applyQuaternion(this.model.quaternion);
        Match.ballVel.set(_v1.x * vh, vy, _v1.z * vh);
        this.peitoCola = 0;
    }

    /*
    Nível 3: o cérebro individual. A árvore vive em js/bt/player_bt.js — aqui
    fica só a porta de entrada, para o resto do código continuar a chamar
    player.runBehaviorTree() como sempre.
    */
    runBehaviorTree(dt = 1 / 60) {
        PlayerAI.tick(this, dt);
    }

    findPassTarget(filterOrDir) {
        let teammates = (this.team === 'TeamA') ? Match.players : Match.opponents;
        let ownZ = this.model.position.z;
        let ownX = this.model.position.x;
        let dirZ = this.dirZ;

        // Mira o alvo do PositionBT, não a posição actual — ver alvoDePasse().
        let options = teammates.filter(p => {
            if (p.id === this.id) return false;
            let optPos = alvoDePasse(p);
            let relZ = (optPos.z - ownZ) * dirZ;
            let relX = Math.abs(optPos.x - ownX);

            if (filterOrDir === 'frente' || filterOrDir === 'forward') {
                if (relZ <= 1.0) return false;
            } else if (filterOrDir === 'lado' || filterOrDir === 'side') {
                if (Math.abs(relZ) > 4.5 || relX < 3.5) return false;
            } else if (filterOrDir === 'tras' || filterOrDir === 'back') {
                if (relZ >= -1.0) return false;
            } else if (filterOrDir === 'def' || filterOrDir === 'mid' || filterOrDir === 'atk') {
                if (p.role !== filterOrDir) return false;
            }

            return (optPos.z * dirZ > ownZ * dirZ - 35.0);
        });

        if (options.length === 0) {
            this.ultimoAlvoPasse = null;
            return null;
        }

        /*
        Sector no REFERENCIAL DE ATAQUE (x * dirZ), como o
        Tatics.getWeightedSectorX já fazia (`-19 * teamDir` para 'esq').

        Antes classificava-se o x do MUNDO cru: para a equipa que ataca no
        sentido oposto, 'esq' do painel virava o flanco contrário. Resultado:
        a condução (carryTargetX, mirrored) puxava para um lado e o bónus de
        passe premiava o outro — as duas metades do sistema a anular-se, e
        nenhuma das equipas jogava consistentemente pelas pontas.
        */
        // Era uma cópia à mão da mesma regra dos 10 m que a condução usa. Uma
        // só, agora, em Tatics.sectorDeX — se as duas divergissem, o passe
        // premiava um flanco e a condução puxava para o outro.
        const getSectorOfX = (x) => Tatics.sectorDeX(x, dirZ);

        let skillVal = this.skillFor('PASS');
        // O antigo `safetyLimit` (1.0 a 1.6 m) saiu daqui: era o corredor do
        // filtro binário, hoje substituído pela qualidade de linha
        // (PassLineModel). O que resta do corte duro está no ciclo, abaixo.

        let opponents = (this.team === 'TeamA') ? Match.opponents : Match.players;
        let ratedCandidates = [];

        /*
        Camada tática coletiva (docs/tacticSystem.md) — Mentalidade já entrava via
        Playing Style/Decision Grid; isto é NOVO: TeamPlayStyle + Momentum +
        Congestão, por cima do resto, sem mexer no que já existia acima.
        Playing Styles continuam a decidir tudo o que já decidiam (ver
        isOrchestrator abaixo, intocado).
        */
        const teamBB = (typeof TeamAI !== 'undefined') ? TeamAI.get(this.team) : null;
        const teamStyle = (typeof TeamPlayStyles !== 'undefined')
            ? (TeamPlayStyles[Tatics.teamPlayStyle] || TeamPlayStyles.positional)
            : null;
        const secToCongestionKey = { esq: 'esq', dir: 'dir', cen: 'centro' };
        const ladoBola = getSectorOfX(ownX);
        const congestaoMeuLado = (teamBB) ? (teamBB.congestion[secToCongestionKey[ladoBola]] || 0) : 0;

        for (let opt of options) {
            let optPos = alvoDePasse(opt);
            let dist = this.model.position.distanceTo(optPos);

            /*
            O piso de distancia mede o COLEGA e nao so o ponto de lead. O
            alvoDePasse devolve para onde ele vai estar; com ele a correr na
            direccao do portador, o ponto ficava a 6 m e o homem a 1 m — e
            saia um passe de um metro, visto no jogo (CM->CM(1)).
            */
            const distReal = this.model.position.distanceTo(opt.model.position);

            // Distância máxima baseada no skill de passe (skill * 0.6)
            let maxDist = Math.max(10, skillVal * 0.6);
            if (dist > maxDist || dist < 2.0 || distReal < 3.0) continue;

            // Evitar passes para fora do campo com margem de segurança de linhas
            const margemLinha = (typeof PassModel !== 'undefined' && PassModel.margemSegurancaLinha) ? PassModel.margemSegurancaLinha : 2.5;
            const distBordaX = (CAMPO_LARG / 2) - Math.abs(optPos.x);
            const distBordaZ = (CAMPO_COMP / 2) - Math.abs(optPos.z);
            if (distBordaX < 0.5 || distBordaZ < 0.5) continue; // Ponto fora ou praticamente em cima da linha

            _line1.set(this.model.position, optPos);
            _v2.subVectors(optPos, this.model.position).normalize();
            let minOppDist = 999, oppMaisPerto = null;
            let distMarcador = 999;

            /*
            O corredor de ameaça cresce com a distância do passe: um defesa a
            3 m da recta não chega a uma bola de 8 m, mas chega de sobra a uma
            de 35 m. Ver PassLineModel.
            */
            const PL = PassLineModel;
            const corredor = Math.min(PL.corredorMax,
                PL.corredorBase + dist * PL.corredorPorMetro);
            let corposNoCorredor = 0;

            for (let i = 0; i < opponents.length; i++) {
                let opp = opponents[i];
                if (opp.role === 'gk') continue;
                
                _v3.subVectors(opp.model.position, this.model.position);
                if (_v3.dot(_v2) < -0.1) continue;

                _line1.closestPointToPoint(opp.model.position, true, _v1);
                let d = _v1.distanceTo(opp.model.position);
                if (d < minOppDist) {
                    minOppDist = d;
                    oppMaisPerto = opp;
                }
                // Quantos ameaçam, não só o mais perto.
                if (d < corredor) corposNoCorredor++;

                let dMarc = optPos.distanceTo(opp.model.position);
                if (dMarc < distMarcador) {
                    distMarcador = dMarc;
                }
            }

            /*
            Passe x Interceptação: o adversário mais perto da linha ameaça
            mais ou menos consoante o INTERCEPT dele contra o PASS de quem
            está a passar — bom interceptador precisa de menos proximidade
            pra ser perigo, bom passador arrisca-se mais perto dele.
            */
            let isOrchestrator = (this.playingStyle === 'orchestrator' && this.styleAtivo);

            /*
            Só sobra um corte DURO: alguém literalmente em cima da recta, onde
            a bola não passa. Tudo o resto passou a ser peso, mais abaixo.

            O `fatorIntercept` continua a valer — um bom interceptador tapa
            mais campo do que um mau — mas agora sobre uma largura de
            centímetros, não sobre o julgamento inteiro do passe.
            */
            let fatorIntercept = 1.0;
            if (oppMaisPerto) {
                fatorIntercept = THREE.MathUtils.clamp(
                    1 + (oppMaisPerto.skillFor('INTERCEPT') - skillVal) / 150, 0.6, 1.6);
            }
            let bloqueio = PL.bloqueioDuro * fatorIntercept;
            if (isOrchestrator) bloqueio *= PL.factorOrquestrador;
            if (minOppDist < bloqueio) continue;

            let circulacao = teamStyle ? teamStyle.circulacao : 1.0;
            let verticalidade = teamStyle ? teamStyle.verticalidade : 1.0;

            /*
            A nota de distancia vive em notaDistanciaPasse (utils.js), com o
            estilo la dentro. Aqui estava um ramo PLANO de 2 a 20 m: um passe
            de 2.5 m valia o mesmo que um de 19 m, e quem desempatava era o
            bonus de "livre de marcacao" logo abaixo — que o toquinho ao lado
            ganha sempre. Media: 32.1% dos passes abaixo de 5 m.
            */
            let score = notaDistanciaPasse(dist, circulacao, verticalidade);

            /*
            QUALIDADE DA LINHA, na mesma escala do bónus de receptor livre.
            0 = a bola raspa por alguém, 1 = corredor limpo. Antes isto valia
            no máximo +50 contra os +500 do receptor livre, e era por isso que
            um passe para dentro de tráfego ganhava a um colega desmarcado.
            */
            const qualidadeLinha = THREE.MathUtils.clamp(
                (minOppDist - bloqueio) / Math.max(0.001, corredor - bloqueio), 0, 1);
            let penalLinha = PL.pesoLinha * (1 - qualidadeLinha)
                + PL.pesoCorpo * corposNoCorredor * fatorIntercept;
            if (isOrchestrator) penalLinha *= PL.factorOrquestrador;
            // Passe PARA o último terço: o risco vale a pena (ver PassLineModel).
            if (optPos.z * dirZ > PL.ultimoTercoZ) penalLinha *= PL.factorUltimoTerco;
            score -= penalLinha;

            // Bónus/Penalidade ABSOLUTA pela marcação do RECEBEDOR
            // Um jogador livre tem que SEMPRE ganhar de um marcado
            let inDefensiveZone = (ownZ * dirZ < -10) || (optPos.z * dirZ < -10); 
            let isDefender = (this.role === 'def' || this.role === 'gk' || opt.role === 'def');
            
            if (distMarcador >= 5.0) {
                // Muito espaço, bónus esmagador (+200 pts) para garantir que a bola vá para ele
                score += 500;
            } else if (distMarcador >= 3.5) {
                // Espaço livre (+200 pts)
                score += 300;
            } else if (distMarcador >= 2.5) {
                // Jogador desmarcado (+200 pts)
                score += 200;
            } else {
                // Marcado de perto (distMarcador < 2.5). Penalização severa.
                if (this.role === 'gk') {
                    score -= 605; // Erro fatal do goleiro (aumentada em mais 10%)
                } else if (inDefensiveZone || isDefender) {
                    score -= 550; // Erro fatal na defesa (aumentada em 10%)
                } else {
                    score -= 165; // Aumentada em 10%
                }
            }

            // Bónus de prioridade de passes (Triangulações)
            let priorityBonus = 0;
            const pRole = this.pos;
            const oRole = opt.pos;
            const pSideAtk = ownX * dirZ;
            const oSideAtk = optPos.x * dirZ;
            const isSameSide = Math.sign(pSideAtk) === Math.sign(oSideAtk) || Math.abs(pSideAtk) < 5 || Math.abs(oSideAtk) < 5;

            if (pRole === 'GK') {
                if (['CB', 'LB', 'RB', 'CM', 'RM', 'LM'].includes(oRole)) priorityBonus = 80;
            } else if (pRole === 'CB') {
                if (['CB', 'DM', 'CM'].includes(oRole)) priorityBonus = 80;
                if (['LB', 'RB', 'LM', 'RM'].includes(oRole) && isSameSide) priorityBonus = 120;
            } else if (pRole === 'LB' || pRole === 'RB') {
                if (['CB', 'CM', 'LM', 'RM'].includes(oRole) && isSameSide) priorityBonus = 120;
            } else if (pRole === 'CM') {
                if (['AM', 'CF'].includes(oRole)) priorityBonus = 40;
                if (['LM', 'RM'].includes(oRole) && isSameSide) priorityBonus = 40;
            } else if (pRole === 'AM') {
                if (['CM', 'CF', 'LW', 'RW'].includes(oRole)) priorityBonus = 40;
                if (['LM', 'RM'].includes(oRole) && isSameSide) priorityBonus = 40;
            } else if (pRole === 'CF') {
                if (['AM', 'LW', 'RW', 'ST'].includes(oRole)) priorityBonus = 40;
                if (['LM', 'RM'].includes(oRole) && isSameSide) priorityBonus = 40;
            } else if (pRole === 'RW') {
                if (['RM', 'CM', 'AM', 'CF', 'ST'].includes(oRole)) priorityBonus = 40;
            } else if (pRole === 'LW') {
                if (['LM', 'CM', 'AM', 'CF', 'ST'].includes(oRole)) priorityBonus = 40;
            }
            score += priorityBonus;

            // Grid espacial (camada PASSE)
            if (typeof SpatialGrid !== 'undefined' && SpatialGrid.cells) {
                score += SpatialGrid.layerValueAt('pass', optPos.x, optPos.z, this.team) * 0.4;
            }

            // Setores
            let optSec = getSectorOfX(optPos.x);
            let secPriority = typeof Tatics.prioridadeSector === 'function' ? Tatics.prioridadeSector(optSec) : 0;
            score += (secPriority * 100) * (teamStyle ? teamStyle.corredores : 1.0);

            // Progressão
            let progression = (optPos.z - ownZ) * dirZ;
            let relX = Math.abs(optPos.x - ownX);
            
            if (progression > 0) {
                let progBonus = Math.min(25, progression * 0.9) * verticalidade;
                if (minOppDist > 8.0) {
                    const aggr = teamBB ? teamBB.aggression : 0.5;
                    progBonus += 60 * (0.6 + aggr * 0.8) * formaDistanciaPasse(dist);
                }
                score += progBonus;
            } else {
                if (isOrchestrator) {
                    score += Math.abs(progression) * 0.8;
                } else if (!isDefender && !inDefensiveZone) {
                    score -= Math.abs(progression) * 1.5 / circulacao;
                }
            }

            // Bônus explícito para defensores tocando para o lado (+200 pts)
            if (isDefender && relX >= 4.0) {
                score += 200;
            }

            // Bônus explícito para passes laterais e para trás
            const livreAFrente = (typeof semMarcacaoAFrente === 'function') ? semMarcacaoAFrente(this, opponents, 10.0, 20.0) : false;
            if (progression <= 2.0 && relX > 5.0) {
                score *= 1.25; // Lado
            } else if (progression < -2.0) {
                if (!livreAFrente) {
                    score *= 1.20; // Trás sob pressão / caminho fechado
                } else {
                    score -= 150; // Penaliza recuo se tem 10m livres à frente para conduzir
                }
            }

            // Virada
            if (isOrchestrator) {
                if (Math.sign(optPos.x) !== Math.sign(ownX) && Math.abs(optPos.x - ownX) > 20) {
                    score += 80;
                }
            } else if (teamBB && teamStyle && congestaoMeuLado > 55) {
                const congestaoAlvo = teamBB.congestion[secToCongestionKey[optSec]] || 0;
                if (congestaoAlvo < congestaoMeuLado - 20) {
                    score += 50 * teamStyle.viradas * (1 - teamBB.aggression);
                }
                // Penaliza insistir pelo sector congestionado (>= 3 adversários)
                if (congestaoAlvo >= 75) {
                    score -= 100;
                }
            }

            // Multiplicador do Playing Style DO ALVO
            // Aplicado no final para agir sobre a nota total balanceada
            if (Config.usePlayingStyles && typeof estiloAtivoDe === 'function') {
                score *= estiloAtivoDe(opt).passe;
            }

            // Percepção de Risco de Limites do Campo (Linhas Laterais / Fundo):
            // Quanto mais próximo da borda estiver o ponto do passe, maior o risco de sair.
            // Passadores experientes evitam bolas espirradas na linha, preferindo passes mais centrados ou no pé.
            const margemIdeal = (typeof PassModel !== 'undefined' && PassModel.margemSegurancaLinha) ? PassModel.margemSegurancaLinha : 3.2;
            const distBordaMin = Math.min(distBordaX, distBordaZ);
            if (distBordaMin < margemIdeal) {
                const fatorRisco = (margemIdeal - distBordaMin) / margemIdeal; // 0 (longe) a 1 (na linha)
                const penalMax = (typeof PassModel !== 'undefined' && PassModel.penalidadeBordaMax) ? PassModel.penalidadeBordaMax : 120;
                // Jogadores com alta TEC/PASS têm melhor critério para ponderar o perigo
                const precisaoPassador = THREE.MathUtils.clamp(skillVal / 100, 0.4, 1.0);
                score -= penalMax * fatorRisco * precisaoPassador;
            }

            if (window.showPlayerPoints) { opt.debugPoints = opt.debugPoints || {}; opt.debugPoints['Pass'] = Math.round(score); }
            ratedCandidates.push({ player: opt, score: score });
        }

        if (ratedCandidates.length > 0) {
            ratedCandidates.sort((a, b) => b.score - a.score);
            return ratedCandidates[0].player;
        }

        this.ultimoAlvoPasse = null;
        return null;
    }

    /*
    Alcance de remate: cresce sempre com a skill do atacante e encolhe com o
    ângulo. Em frente à baliza vale o alcance todo; junto à linha lateral sobra
    a fracção `angleFloor`.
    */
    shootingRange() {
        const skill = TeamSkills[this.team].ata;
        const base = ShootingModel.baseRange + (skill / 100) * ShootingModel.skillRange;
        const centralidade = 1 - Math.min(1, Math.abs(this.model.position.x) / ShootingModel.maxOffsetX);
        const porFuncao = (this.role === 'def') ? ShootingModel.defenderFactor : 1.0;
        // Peso `remate` do playing style: um Fox in the Box remata de onde um
        // Cross Specialist ainda estaria a procurar quem cruzar.
        const porEstilo = (Config.usePlayingStyles && typeof estiloAtivoDe === 'function') ? estiloAtivoDe(this).remate : 1.0;
        return base * porFuncao * porEstilo * (ShootingModel.angleFloor + (1 - ShootingModel.angleFloor) * centralidade);
    }

    initiatePass(targetPlayer) {
        if (this.isCross) {
            this.showActionBanner('CROSS');
        } else if (this.isThroughBall) {
            this.showActionBanner('THROUGH');
        } else if (targetPlayer && this.model.position.distanceTo(targetPlayer.model.position) > 30) {
            this.showActionBanner('L.PASS');
        } else {
            this.showActionBanner('PASS');
        }
        this.passTarget = targetPlayer;
        
        let _v1 = new THREE.Vector3();
        if (this.isThroughBall && this.throughBallTarget) {
            _v1.set(this.throughBallTarget.x, 0, this.throughBallTarget.z);
        } else if (this.passAimPoint) {
            /*
            Passe para o espaço / leading: o alvo é um PONTO do leque do
            PlayerPassTarget, não o companheiro. Já vem filtrado (sem
            adversário a 2m, linha de passe livre), por isso não leva lead
            nenhum por cima — o ponto JÁ é à frente dele.
            */
            _v1.set(this.passAimPoint.x, 0, this.passAimPoint.z);
        } else {
            /*
            Ponto de partida: alvo do PositionBT (alvoDePasse) misturado com a
            posição actual do colega — mantém o "para onde a equipa QUER que
            ele esteja" como direcção geral, sem mirar um fantasma muito à
            frente.

            LEAD por tempo de voo (pedido explícito): sem isto, mesmo um
            passe curto/médio chegava a "onde ele estava ao passe sair" —
            como ele continua a correr, quase sempre tinha de travar/recuar
            um instante para a alcançar, cortando o fluir do movimento. Antes
            só se aplicava lead em passes >22m; agora aplica-se sempre,
            proporcional ao tempo estimado de voo.

            `pesoVel` é a velocidade MÉDIA aproximada da bola ao longo do
            voo — não a de saída (essa é mais alta, ~17-18 m/s, mas o arrasto
            e o atrito de rolamento travam-na muito ao longo do percurso; a
            física exacta só se resolve depois, em executePassGameplay, e
            dependeria do alvo que ainda estamos a calcular).

            Auditoria dos passes (pedido explícito, "estão crutos, não
            chegam direito"): media com jogo real mostrou o tempo de voo
            verdadeiro 1.5x-2x mais longo do que `distancia/17` estimava
            nos 10-30m (a faixa mais comum) — sobrava pouco lead, a bola
            chegava atrás de quem corria a recebê-la. Piorou depois de
            aumentar o campo: distâncias de passe maiores dão mais tempo
            para o arrasto travar a bola, e o erro do "17 fixo" cresce com
            a distância. 11 m/s aproxima melhor a média medida; o tecto do
            clamp subiu de 3.0 para 4.5s para não cortar o lead nos passes
            mais longos que o campo maior agora produz com mais frequência.
            Amortecido a 0.75: é só uma estimativa, ele pode travar ou
            mudar de direcção durante o voo.
            */
            const alvo = alvoDePasse(this.passTarget);
            _v1.set(alvo.x, 0, alvo.z);
        }

        let meiaLarg = CAMPO_LARG / 2;
        let meioComp = CAMPO_COMP / 2;
        _v1.x = Math.max(-meiaLarg + 3.0, Math.min(meiaLarg - 3.0, _v1.x));
        _v1.z = Math.max(-meioComp + 3.0, Math.min(meioComp - 3.0, _v1.z));
        
        this.passTargetPos = _v1.clone();

        /*
        Angulo do corpo NO INSTANTE DA DECISAO, nao no do contacto: o case
        'PASS' (fsm.js) roda o jogador para o alvo a 25*dt por frame assim
        que o passe arranca, por isso ao chegar ao contacto ele ja esta
        quase sempre virado para o alvo e a leitura la seria ~1 sempre — a
        penalizacao de "passar de costas" (sigmaDePasse/costasMult) nunca
        dispararia num jogo real. Guarda-se aqui a frente ACTUAL do jogador,
        antes do slerp comecar a corrigi-la.
        */
        {
            const dx = this.passTargetPos.x - this.model.position.x;
            const dz = this.passTargetPos.z - this.model.position.z;
            const normDir = Math.hypot(dx, dz) || 1;
            // _v1 esta a guardar o alvo do passe para o codigo dos visuais
            // logo abaixo — NAO reutilizar aqui. Usa-se _vFrenteCorpo
            // (config.js) para a frente do jogador.
            _vFrenteCorpo.set(0, 0, 1).applyQuaternion(this.model.quaternion);
            this.cosCorpoNoPasse = (_vFrenteCorpo.x * dx + _vFrenteCorpo.z * dz) / normDir;
            
            // Determinar se o passe excede 90 graus da direcção de corrida
            const speed = this.velocity.length();
            if (speed > 0.1) {
                const dotCorrida = (this.velocity.x * dx + this.velocity.z * dz) / (speed * normDir);
                // dot < 0 significa mais de 90 graus
                this.turnForPass = (dotCorrida < 0);
            } else {
                // Se estiver quase parado, usa a frente do corpo
                this.turnForPass = (this.cosCorpoNoPasse < 0);
            }
        }

        if (typeof Match !== 'undefined') {
            if (Match.passTargetVisual) {
                Match.passTargetVisual.position.set(_v1.x, 0.05, _v1.z);
                Match.passTargetVisual.visible = (window.teamBTPosState !== 'OFF' || window.playingStyleBTToggleState !== 'OFF');
            }
            if (Match.passLineVisual) {
                const posAttr = Match.passLineVisual.geometry.attributes.position;
                posAttr.setXYZ(0, this.model.position.x, 0.05, this.model.position.z);
                posAttr.setXYZ(1, _v1.x, 0.05, _v1.z);
                posAttr.needsUpdate = true;
                Match.passLineVisual.visible = (window.teamBTPosState !== 'OFF' || window.playingStyleBTToggleState !== 'OFF');
            }
        }

        // Não executa o passe aqui — só prepara. O efeito real (bola sai do
        // pé) dispara dentro do ActionState, sincronizado com a pose do
        // chute (ver ActionAnimClips.pass e executePassGameplay em fsm.js).
        this.actionState = new ActionState('pass', {
            onContact: () => { if (this.hasBall && this.passTarget) executePassGameplay(this); }
        });
        // Consumido: o próximo passe volta a decidir o seu próprio ponto.
        this.passAimPoint = null;

        // Ativar Inércia pós-passe de 4.0s: o jogador não recua para o posto base atrás da cota da jogada
        if (this.role !== 'gk') {
            this.passInertiaTimer = 4.0;
            this.passInertiaZDir = this.model.position.z * this.dirZ;
        }

        // Disparadas / Overlap pós-passe desativadas
        this.overlapTimer = 0;

        this.fsm.changeState('PASS');
    }
    /*
    Relançamento do GR: chutão para a frente, com os ângulos sorteados a cada
    execução (pedido do utilizador).

        elevação   25° a 50° acima da horizontal
        direcção   até 20° para cada lado do "a direito para a frente"

    A potência sai da balística e não de um número à mão: escolhida a
    distância de queda, `v = sqrt(R*g / sin(2θ))` dá a velocidade que põe a
    bola lá com a elevação sorteada. `g` é 15 aqui (ver updateBall).
    */
    puntBall() {
        const gGrav = BallPhysics.gravidade;
        const elev = THREE.MathUtils.degToRad(25 + Math.random() * 25);
        const desvio = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * 20);

        // Alcance pretendido: chutão de meio-campo, com alguma variação. Aumentado em 20%.
        const alcance = (38 + Math.random() * 16) * 1.20;
        /*
        GoalkeeperKickPower é força — velocidade de SAÍDA —, não alcance. Como
        o alcance vai com o quadrado da velocidade (R = v² sin2θ / g), estes
        +15% de força valem cerca de +32% de distância.
        */
        const v = Math.min(50,
            Math.sqrt((alcance * gGrav) / Math.sin(2 * elev)) * GoalkeeperKickPower);

        // Frente da equipa (dirZ), rodada pelo desvio lateral sorteado.
        const horiz = v * Math.cos(elev);
        _v2.set(0, 0, this.dirZ).applyAxisAngle(_vUp, desvio);
        Match.ballVel.set(_v2.x * horiz, v * Math.sin(elev), _v2.z * horiz);

        this.hasBall = false;
        this.touchLock = BallControl.touchLock;
        Match.ballCarrier = null;
        if (typeof EventBus !== 'undefined') EventBus.emit('GK_RELEASE_BALL', { team: this.team, gk: this });
        // Ninguém é destinatário nomeado de um chutão — a bola vai para o
        // espaço, quem lá chegar disputa (ver resolveBallContact).
        Match.intendedReceiver = null;
        Match.passTargetPos = null;
        // Sem isto o próprio GK falhava o filtro anti-falso-positivo de
        // isCross (lastTouchedPlayer !== this) e saltava logo a seguir ao
        // seu próprio relançamento, achando que era um cruzamento a chegar.
        Match.lastTouchedTeam = this.team;
        Match.lastTouchedPlayer = this;
        if (typeof MatchStats !== 'undefined') MatchStats.registarPasseIniciado(this.team, 'lancamento');
    }

    initiateShoot() {
        this.showActionBanner('SHOT');
        if (typeof MatchStats !== 'undefined') MatchStats[this.team].remates.tentados++;
        /*
        O gesto tem duração própria (ShotClip) e a bola só sai no contactTime —
        tal como no passe. Antes o remate era resolvido no frame seguinte ao da
        decisão e o estado durava 0.2 s no total.
        */
        this.actionState = new ActionState('shot', {
            onContact: () => { if (this.hasBall) executeShotGameplay(this); }
        });
        this.fsm.changeState('SHOOT');
    }

    showActionBanner(text) {
        this.actionBannerTimer = 1.2; 
        this.actionSprite.visible = true;
        
        this.actionCtx.clearRect(0, 0, 512, 128);
        this.actionCtx.font = 'bold 38px "Segoe UI", Arial, sans-serif';
        this.actionCtx.textAlign = 'center';
        this.actionCtx.textBaseline = 'middle';
        
        let metrics = this.actionCtx.measureText(text);
        let textWidth = metrics.width;
        let fontHeight = 38; // Base fallback height
        if (metrics.actualBoundingBoxAscent) {
            fontHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
        }
        
        let paddingX = 30; 
        let paddingY = 16;
        
        let bgWidth = textWidth + paddingX;
        let bgHeight = fontHeight + paddingY;
        let startX = 256 - (bgWidth / 2);
        let startY = 64 - (bgHeight / 2);
        
        this.actionCtx.fillStyle = '#FFD700'; 
        this.actionCtx.beginPath();
        if (this.actionCtx.roundRect) {
            this.actionCtx.roundRect(startX, startY, bgWidth, bgHeight, 10);
        } else {
            this.actionCtx.rect(startX, startY, bgWidth, bgHeight);
        }
        this.actionCtx.fill();
        
        this.actionCtx.lineWidth = 3;
        this.actionCtx.strokeStyle = '#000000';
        this.actionCtx.stroke();
        
        this.actionCtx.fillStyle = '#000000';
        // Placed dead center + 1px for optical alignment with all-caps text
        this.actionCtx.fillText(text, 256, 64 + 1); 
        
        this.actionTex.needsUpdate = true;
    }

    executeHeader() {
        this.showActionBanner('HEADER');

        /*
        Anti ping-pong: TODOS os cabeceios contam, não só os de fora da zona de
        remate. O contador vivia dentro do ramo `else` lá em baixo, portanto
        uma disputa perto da área — que é justamente onde a bola fica a saltar
        de cabeça em cabeça — nunca chegava ao limite de
        HeaderModel.maxHeadersSeguidos e o travão nunca entrava.

        O contador zera sozinho passado HeaderModel.cooldownDisputa sem novo
        cabeceio (ver Match.update), e também quando alguém domina no peito ou
        a bola assenta.
        */
        if (typeof Match !== 'undefined') {
            Match.aerialHeaderCount = (Match.aerialHeaderCount || 0) + 1;
            Match.aerialHeaderTimer = (typeof HeaderModel !== 'undefined' && HeaderModel.cooldownDisputa)
                ? HeaderModel.cooldownDisputa : 2.2;
        }
        // De frente para a bola, mesma correcção do controlarNoPeito — sem
        // isto o corpo ficava com a orientação da última corrida, muitas
        // vezes atravessado em relação à bola que chega para a cabeçada.
        lookAtBola(this.model, Match.ball.position);

        // Cola a bola à testa antes de a mandar embora — sem isto o
        // contacto era aceite até `BallControl.reach` (0.9 m) de distância
        // real, e a bola aparecia a bater quase 1 m acima da cabeça no
        // frame da cabeçada.
        _v1.set(0, 0, 0.22).applyQuaternion(this.model.quaternion);
        Match.ball.position.set(
            this.model.position.x + _v1.x,
            this.model.position.y + ALTURA_TESTA,
            this.model.position.z + _v1.z);

        let distToGoal = Math.abs(this.targetGoalZ - this.model.position.z);
        let inShootingRange = (distToGoal < 24 && Math.abs(this.model.position.x) < 16);

        if (inShootingRange) {
            if (typeof MatchStats !== 'undefined') MatchStats[this.team].remates.tentados++;

            // Conectar bem a cabeçada é Técnica x Marcação (marcador mais
            // perto dele) — base 0.55, favorece quem salta pra bola.
            const opponentsHead = (this.team === 'TeamA') ? Match.opponents : Match.players;
            let marcador = null, distMarc = 999;
            for (const opp of opponentsHead) {
                if (opp.role === 'gk') continue;
                const d = opp.model.position.distanceTo(this.model.position);
                if (d < 2.0 && d < distMarc) { distMarc = d; marcador = opp; }
            }
            // 1. Calcular AerialScore do atacante
            const aerialAtacante = this.skillFor('TEC') * 0.70 + this.skillFor('STRENGTH') * 0.30;
            
            // 2 & 3. Disputa Aérea
            let cabeceadaLimpa = true;
            if (marcador) {
                const aerialDefensor = marcador.skillFor('TEC') * 0.70 + marcador.skillFor('STRENGTH') * 0.30;
                const attackerChance = aerialAtacante / (aerialAtacante + aerialDefensor);
                cabeceadaLimpa = Math.random() < attackerChance;
            }

            const maxC = (LARGURA_BALIZA / 2) - 0.5;
            let alvoX, alvoY, pow;
            let forcedGKDelay = null;

            if (!cabeceadaLimpa) {
                // 4. DEFESA_TIRA
                alvoX = this.model.position.x + (Math.random() - 0.5) * 5.0;
                alvoY = 0.3;
                pow = (5.0 + Math.random() * 3.0) / 3.0;
            } else {
                // 5 & 6. Disputa Atacante x Goleiro
                const gkAdversario0 = (this.team === 'TeamA') ? Match.opponents[0] : Match.players[0];
                let gkScore = 50; 
                if (gkAdversario0) {
                    gkScore = gkAdversario0.skillFor('TEC') * 0.30 + gkAdversario0.skillFor('GK') * 0.70;
                }
                
                // 7. Comparar probabilisticamente
                const attackRatio = aerialAtacante / (aerialAtacante + gkScore);
                
                // Distribuição de pesos conforme as regras
                const weights = [
                    { outcome: 'GOL', weight: Math.pow(attackRatio, 2) * 100 },
                    { outcome: 'TRAVE_CAMPO', weight: attackRatio * 15 },
                    { outcome: 'TRAVE_FORA', weight: attackRatio * 15 },
                    { outcome: 'TRAVESSAO_CAMPO', weight: attackRatio * 15 },
                    { outcome: 'TRAVESSAO_FORA', weight: attackRatio * 15 },
                    { outcome: 'GOLEIRO_DEFENDE', weight: Math.pow(1 - attackRatio, 2) * 100 },
                    { outcome: 'GOLEIRO_FORA', weight: (1 - attackRatio) * 50 }
                ];
                
                let totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
                let roll = Math.random() * totalWeight;
                let selectedOutcome = 'GOLEIRO_DEFENDE';
                for (let w of weights) {
                    if (roll < w.weight) {
                        selectedOutcome = w.outcome;
                        break;
                    }
                    roll -= w.weight;
                }
                
                // 8. Aplicar o resultado fisicamente
                let sinal = Math.random() > 0.5 ? 1 : -1;
                
                switch (selectedOutcome) {
                    case 'GOL':
                        alvoX = sinal * maxC * 0.88;
                        alvoY = Math.random() * 1.5 + 0.3;
                        pow = 8.0;
                        forcedGKDelay = 1.0; // GK não chega
                        break;
                    case 'TRAVE_CAMPO':
                        alvoX = sinal * (LARGURA_BALIZA / 2 - 0.08); // Bate na parte de dentro do poste
                        alvoY = 0.5;
                        pow = 6.5;
                        forcedGKDelay = 1.0;
                        break;
                    case 'TRAVE_FORA':
                        alvoX = sinal * (LARGURA_BALIZA / 2 + 0.08); // Bate na parte de fora do poste
                        alvoY = 0.5;
                        pow = 6.5;
                        forcedGKDelay = 1.0;
                        break;
                    case 'TRAVESSAO_CAMPO':
                        alvoX = (Math.random() - 0.5) * maxC;
                        alvoY = ALTURA_BALIZA - 0.08; // Bate na parte de baixo do travessão
                        pow = 7.0;
                        forcedGKDelay = 1.0;
                        break;
                    case 'TRAVESSAO_FORA':
                        alvoX = (Math.random() - 0.5) * maxC;
                        alvoY = ALTURA_BALIZA + 0.08; // Bate na parte de cima do travessão
                        pow = 7.0;
                        forcedGKDelay = 1.0;
                        break;
                    case 'GOLEIRO_DEFENDE':
                        alvoX = (Math.random() - 0.5) * 1.5; // Vai perto do meio
                        alvoY = 1.0;
                        pow = 4.5; // Fraco, fácil de encaixar
                        forcedGKDelay = 0; // GK reage instantaneamente
                        break;
                    case 'GOLEIRO_FORA':
                        alvoX = sinal * maxC * 1.05; // Vai rente ao poste por fora
                        alvoY = 1.0;
                        pow = 6.5; // GK estica-se e toca nela
                        forcedGKDelay = 0;
                        break;
                }
            }

            /*
            Mesma correcção do remate: mira pela elevação resolvida, e não
            apontando a direcção 3D ao alvo. Apontar direito ao ponto ignora
            a queda durante o voo — a bola passava sempre por baixo dele.
            */
            const alvoZc = cabeceadaLimpa ? this.targetGoalZ : Match.ball.position.z + this.dirZ * 3;
            const dxC = alvoX - Match.ball.position.x;
            const dzC = alvoZc - Match.ball.position.z;
            const distHC = Math.hypot(dxC, dzC);
            const elevC = elevacaoParaAlvo(distHC, alvoY, pow);
            const eC = (elevC === null) ? Math.PI / 5 : elevC;
            const vhC = pow * Math.cos(eC);
            Match.ballVel.set(
                (distHC > 0.001 ? dxC / distHC : 0) * vhC,
                pow * Math.sin(eC),
                (distHC > 0.001 ? dzC / distHC : this.dirZ) * vhC
            );
            this.hasBall = false;
            this.touchLock = BallControl.touchLock;
            Match.ballCarrier = null;

            if (cabeceadaLimpa) {
                let defendingTeam = (this.team === 'TeamA') ? 'TeamB' : 'TeamA';
                // Notifica o GK adversário com o seu delay de reacção próprio.
                const gkAdversario = (this.team === 'TeamA') ? Match.opponents[0] : Match.players[0];
                if (gkAdversario) {
                    gkAdversario.gkDelayReacao = (forcedGKDelay !== null) ? forcedGKDelay : (0.45 - ((TeamSkills[defendingTeam].gk - 50) / 50) * 0.35);
                    gkAdversario.gkReagiu = false;
                }
                window.bolaChutada = true;
            }
        } else {
            /*
            Fora da zona de remate (a contagem de cabeceios seguidos é feita
            no topo do executeHeader, para todos os casos):
            1. Se houver colega próximo, faz escora/cabeceio para baixo (downward header)
               para que a bola caia rápida no chão para domínio com os pés.
            2. Se for alívio defensivo (sem companheiro próximo seguro ou sob pressão),
               faz alívio longo para frente e para os lados, evitando subir na vertical.
            */
            const target = this.findPassTarget('mid') || this.findPassTarget('atk') ||
                this.findPassTarget('def');

            let uxP = 0, uzP = this.dirZ, distDesejada = HeaderModel.alcanceMax;
            let eP = HeaderModel.elevacao;

            if (target) {
                const dxP = target.model.position.x - Match.ball.position.x;
                const dzP = target.model.position.z - Match.ball.position.z;
                const d = Math.hypot(dxP, dzP);
                if (d > 0.001) { uxP = dxP / d; uzP = dzP / d; }

                if (d <= (HeaderModel.alcancePasse || 8.5)) {
                    // Escora para baixo para colega próximo: trajetória descendente rápida
                    distDesejada = d;
                    eP = HeaderModel.elevacaoEscora || (8 * Math.PI / 180);
                } else {
                    // Alívio na direção do colega
                    distDesejada = Math.min(d, HeaderModel.alcanceMax);
                    eP = HeaderModel.elevacaoAlivio || (26 * Math.PI / 180);
                }
            } else {
                // Alívio defensivo longo para a frente/diagonal
                distDesejada = HeaderModel.alcanceMax;
                eP = HeaderModel.elevacaoAlivio || (26 * Math.PI / 180);
                // Leve dispersão diagonal para não ficar na mesma linha
                uxP = (Math.random() - 0.5) * 0.4;
                uzP = this.dirZ;
                const len = Math.hypot(uxP, uzP);
                uxP /= len;
                uzP /= len;
            }

            const vP = velocidadeParaAlcance(distDesejada, eP);
            Match.ballVel.set(uxP * vP * Math.cos(eP), vP * Math.sin(eP), uzP * vP * Math.cos(eP));

            this.hasBall = false;
            this.touchLock = BallControl.touchLock;
            Match.ballCarrier = null;
            // Só é "destinatário" se a bola lhe chegar mesmo; a mais de
            // alcanceMax a cabeçada morre pelo caminho e fica disputável.
            Match.intendedReceiver = (target && distDesejada >= (
                Math.hypot(target.model.position.x - Match.ball.position.x,
                           target.model.position.z - Match.ball.position.z) - 0.01))
                ? target : null;
        }
    }

    update(dt) {
        if (this.touchLock > 0) this.touchLock = Math.max(0, this.touchLock - dt);
        if (this.overlapTimer > 0) this.overlapTimer = Math.max(0, this.overlapTimer - dt);
        if (this.passInertiaTimer > 0) this.passInertiaTimer = Math.max(0, this.passInertiaTimer - dt);
        // Arrefecimento da corrida ao espaco (ver RunIntoSpaceModel). Corre
        // aqui e nao na FSM: a FSM so mexe no estado corrente, e o
        // arrefecimento tem de correr JUSTAMENTE quando ele ja nao esta a
        // correr.
        if (this.runCooldown > 0) this.runCooldown = Math.max(0, this.runCooldown - dt);

        /*
        Freeze do kickoff: runBehaviorTree/fsm ficavam a correr por jogador
        mesmo com o Match.runTeamAI() travado (Match.update trava só o nível
        de equipa), e o PlayerBT sozinho já reposicionava toda a gente —
        incluindo o taker/apoio, que se afastavam da bola antes do toque
        inicial. Aqui pára tudo: sem decisão, sem movimento, só idle.
        */
        if (Match.kickoffActive) {
            this.velocity.set(0, 0, 0);
            // Bola fica presa no centro (não gruda no pé do taker) — ele fica
            // só encostado. O lerp para o pé (usado no jogo normal) ia
            // arrastando a bola do centro pra fora durante os 4s de espera.
            // GK usa pose própria (updateGK), não o animateBones de jogador
            // de campo — chamá-lo aqui deixava o guarda-redes preso na pose
            // de mergulho/salto anterior (ajoelhado, de costas).
            if (this.role === 'gk') this.resetBonesToDefault();
            else this.animateBones(dt);
            return;
        }

        /*
        decisionTimer só reinicia numa posse NOVA (bola perdida para o
        adversário, ou primeira vez que a apanha) — não a cada toque de
        condução do CARRY. O toque solta hasBall por um instante
        (touchLock) e o próprio jogador recupera-a a seguir; sem esta
        graça, cada recuperação zerava o timer e reactivava o "Dominar"
        (~3s) no meio da corrida — domina/adianta, domina/adianta.
        */
        const graceActiva = this.carryTouchGrace > 0;
        const outroTemBola = !!(Match.ballCarrier && Match.ballCarrier !== this);
        this.carryTouchGrace = graceDeConducao(this.hasBall, this.carryTouchGrace, outroTemBola, dt);

        if (this.hasBall || (graceActiva && !outroTemBola)) this.decisionTimer += dt;
        else this.decisionTimer = 0;

        if (this.role === 'gk' && Match.state !== 'CORNER_KICK') {
            // Corre também durante GOAL_KICK: é o updateGK que conduz o gesto
            // do tiro de meta (estados 'tiro_meta' -> 'chutando').
            this.updateGK(dt);
        } else {
            this.runBehaviorTree(dt);
            this.fsm.update(dt);
            this.model.position.addScaledVector(this.velocity, dt);
        }

        if (this.hasBall) {
            if (this.role === 'gk') {
                // GR segura a bola nas mãos, junto ao PEITO (não à cintura) —
                // não ao nível do pé como no dribble de um jogador de campo
                // (senão fica só pousada no chão à frente dele).
                let maoY = this.model.position.y + (this.gkEstado === 'apanhar' ? 0.55 : 1.15);
                let avancoBola = 0.3;
                /*
                Durante o gesto do chutão a bola tem de descer das mãos até ao
                pé, senão o pé bate no vazio e ela sai da altura do peito. Cai
                entre a máxima preparação (largaBolaEm) e o contacto.
                */
                if (this.gkEstado === 'chutando') {
                    const K = GoalkeeperKickClip;
                    const cont = ActionAnimClips.gkPunt.contactTime;
                    const u = THREE.MathUtils.clamp(
                        ((this.gkKickNorm || 0) - K.largaBolaEm) / (cont - K.largaBolaEm), 0, 1);
                    maoY = this.model.position.y + K.alturaMao + (K.alturaPe - K.alturaMao) * u;
                    avancoBola = 0.3 + 0.35 * u;
                } else if (this.gkEstado === 'lancando') {
                    // Animação manual para a bola acompanhar a mão durante o lançamento
                    const u = this.gkKickNorm || 0;
                    if (u < 0.6) {
                        maoY = this.model.position.y + 1.15 + (1.6 - 1.15) * (u / 0.6);
                        avancoBola = 0.3 - 0.5 * (u / 0.6);
                    } else {
                        const rel = (u - 0.6) / 0.4;
                        maoY = this.model.position.y + 1.6 - (1.6 - 1.4) * rel;
                        avancoBola = -0.2 + 0.8 * rel;
                    }
                }
                let maoOffset = new THREE.Vector3(0, 0, avancoBola).applyQuaternion(this.model.quaternion);
                Match.ball.position.lerp(this.model.position.clone().add(maoOffset).setY(maoY), 0.5);
                Match.ballVel.set(0, 0, 0);
            } else {
                // -0.6m: Aumentado um pouco para a bola não ficar tão "escondida" debaixo do jogador
                // durante a corrida e para dar mais espaço natural ao passe/remate.
                let footOffset = new THREE.Vector3(0, 0, 0.6).applyQuaternion(this.model.quaternion);
                Match.ball.position.lerp(this.model.position.clone().add(footOffset), 0.5);
                Match.ball.position.y = BallPhysics.raio; Match.ballVel.set(0, 0, 0);
            }
        }
        /*
        Jogadores sempre desenhados e sempre animados (pedido).

        Havia aqui frustum culling: quem saísse do enquadramento da câmara
        ficava `visible = false` E parava de animar. O segundo efeito é o que
        estragava — ao voltar ao ecrã, o jogador reaparecia com a pose
        congelada do instante em que saiu e só recuperava o ciclo de corrida
        nos frames seguintes. Com câmaras que giram (ou em replays), dava
        jogadores a aparecer a deslizar sem mexer as pernas.

        `inViewport` fica em true para quem ainda o leia (rótulos, debug).
        */
        this.inViewport = true;

        /*
        Boneco ou disco, conforme a câmara — ver o disco em updateShirt. Tem
        de ficar DEPOIS do `visible = true` de cima, senão essa linha desfaz
        a troca no frame seguinte.
        */
        const vistaTatica = (window.cameraMode === 'topdown');
        this.model.visible = !vistaTatica;
        if (this.discoTatico) {
            this.discoTatico.visible = vistaTatica;
            this.discoTatico.position.set(this.model.position.x, 0.04, this.model.position.z);
        }

        /*
        LATERAL e REMATE escrevem a pose inteira a partir de um clip — o
        animateBones por cima devolvia braços e pernas ao ciclo de passada no
        mesmo frame. O ramo `speed >= 0.1` do animateBones faz `set` directo
        nas pernas, portanto não bastava excluí-los do bloco neutro.
        */
        if ((this.role === 'gk' && Match.state !== 'CORNER_KICK') ||
            this.fsm.currentState === 'LATERAL' ||
            (this.fsm.currentState === 'SHOOT' && this.actionState)) {
        } else {
            this.animateBones(dt);
            // Camada da matada no peito: só a cintura para trás e os braços
            // a abrir, por cima da pose normal de pé. Tem de vir depois do
            // animateBones, senão ele reescreve o tronco no mesmo frame.
            this.aplicarCamadaPeito();
            this.aplicarCamadaCabeceioDePe(dt);
        }

        // Update Action Banner
        if (this.actionBannerTimer > 0) {
            this.actionBannerTimer -= dt;
            if (this.actionBannerTimer <= 0) {
                this.actionSprite.visible = false;
            }
        }

        // Atualização da UI flutuante (PlayerNumber, PlayerBT, PlayerPOS e PlayerPlayingStyle)
        if (this.inViewport && (window.showPlayerNumber || window.showPlayerBT || window.showPlayerPOS || window.showPlayerPlayingStyle || window.showPlayerPoints || window.speedMultiplier === "frame")) {
            this.labelSprite.visible = true;
            let parts = [];
            if (window.showPlayerNumber) parts.push(this.num);
            if (window.showPlayerPOS) parts.push(this.pos);
            if (window.showPlayerBT) parts.push(this.fsm.currentState);
            if (window.showPlayerPlayingStyle && this.playingStyle && !this.playingStyleDesligado) parts.push(this.playingStyle);
            if (window.showPlayerPoints && this.debugPoints) {
                let pts = Object.entries(this.debugPoints).map(([k,v]) => `${k}:${v}`).join(" | ");
                if (pts) parts.push(pts);
            }
            if (window.speedMultiplier === "frame") {
                let fr = "";
                if (this.actionState) {
                    fr = `A${Math.floor(this.actionState.t * 60)}`;
                } else if (this.gkKickAction) {
                    fr = `G${Math.floor(this.gkKickAction.t * 60)}`;
                } else {
                    let t = ((this.animTimer % 1.0) + 1.0) % 1.0;
                    fr = `R${Math.floor(t * 60)}`;
                }
                parts.push(fr);
            }
            let text = parts.join(" | ");
            if (text !== this.lastLabelText || window.speedMultiplier === "frame") {
                this.lastLabelText = text;
                this.labelCtx.clearRect(0, 0, 1024, 128);
                
                // Configura a fonte primeiro para medir corretamente
                this.labelCtx.font = 'bold 36px "Segoe UI"';
                this.labelCtx.textAlign = 'center';
                this.labelCtx.textBaseline = 'middle';
                
                let textWidth = this.labelCtx.measureText(text).width;
                let bgWidth = textWidth + 30; // 15px de padding para cada lado
                let bgHeight = 46; 
                let startX = 512 - (bgWidth / 2);
                let startY = 64 - (bgHeight / 2);

                // Caixa de fundo mais apertada
                this.labelCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                this.labelCtx.beginPath();
                this.labelCtx.roundRect ? this.labelCtx.roundRect(startX, startY, bgWidth, bgHeight, 10) : this.labelCtx.rect(startX, startY, bgWidth, bgHeight);
                this.labelCtx.fill();
                
                // Texto
                this.labelCtx.fillStyle = '#ffffff';
                this.labelCtx.fillText(text, 512, 64);
                this.labelTex.needsUpdate = true;
            }
        } else {
            this.labelSprite.visible = false;
            this.lastLabelText = '';
        }

        /*
        Três anéis, um por etapa do posicionamento, do maior ao menor:

        - Team BT POS (grande)   `slotTarget`     slot puro do bloco
        - Position BT (médio)    `dynamicTarget`  alvo final, o que o
                                                  steerArrive persegue
        - PlayingStyleBT (menor) `styleTarget`    slot + estilo, antes da
                                                  marcação

        A linha liga o anel grande ao menor: é o desvio que o estilo mete, e
        só ele. O que vai do menor ao médio é marcação + inquietação + tecto
        + alisamento.

        Mostrava o `tacticalTarget`, que é o alvo do nível 2 ANTES da camada
        posicional do playing style, e antes das passagens que correm depois
        dos ticks individuais (a triangulação de Delaunay, o afastamento do
        próprio guarda-redes). Ou seja: nenhum dos três anéis marcava o sítio
        para onde o jogador estava mesmo a ir, e por isso não havia maneira
        de ver se ele obedecia ou não. Agora o anel pequeno é a verdade.

        A linha entre os dois só faz sentido com os dois ligados ao mesmo tempo.
        */
        /*
        Os anéis só valem enquanto o nível 2 estiver a escrevê-los. Fora disso
        (GOAL, OUT, cantos, livres) `slotTarget` e `styleTarget` guardam o
        último valor de jogo corrido, e mostrá-los é pior do que não mostrar
        nada: depois de um golo apareciam junto à baliza, enquanto o rectângulo
        do bloco — esse recalculado a cada frame — já estava no meio-campo.
        */
        const nivel2 = (typeof Match !== 'undefined' && Match.nivel2Activo)
            ? Match.nivel2Activo() : true;
        const showForTeam = nivel2 &&
            (window.teamBTPosState === this.team || window.teamBTPosState === 'Both');
        const showForStyle = nivel2 &&
            (window.playingStyleBTToggleState === this.team || window.playingStyleBTToggleState === 'Both');
        const showForPosition = nivel2 &&
            (window.positionBTToggleState === this.team || window.positionBTToggleState === 'Both');
        const teamTarget = this.slotTarget || this.tacticalTarget || this.dynamicTarget;
        const styleTarget = this.styleTarget || this.dynamicTarget;

        if (this.btTargetGroup) {
            if (showForTeam && teamTarget) {
                this.btTargetGroup.visible = true;
                this.btTargetGroup.position.set(teamTarget.x, 0.05, teamTarget.z);
            } else {
                this.btTargetGroup.visible = false;
            }
        }

        /*
        Linha da cadeia de montagem: slot -> slot+estilo -> alvo final, pela
        ordem por que o posicionamento os calcula. Desenha o troço entre os
        anéis LIGADOS, sejam dois ou três — antes exigia TeamBT E
        PlayingStyleBT ao mesmo tempo, e com qualquer outra combinação de
        botões não aparecia linha nenhuma.

        Cada troço tem um significado: slot -> estilo é o desvio do playing
        style; estilo -> final é marcação + inquietação + tecto + alisamento.
        */
        if (this.btLine) {
            const pontos = [];
            if (showForTeam && teamTarget) pontos.push(teamTarget);
            if (showForStyle && styleTarget) pontos.push(styleTarget);
            if (showForPosition && this.dynamicTarget) pontos.push(this.dynamicTarget);

            if (pontos.length >= 2) {
                const arr = this.btLineGeo.attributes.position.array;
                for (let i = 0; i < 3; i++) {
                    // Com só dois anéis ligados, o terceiro vértice repete o
                    // último: o segmento degenerado não se vê.
                    const pt = pontos[Math.min(i, pontos.length - 1)];
                    arr[i * 3] = pt.x;
                    arr[i * 3 + 1] = 0.055;
                    arr[i * 3 + 2] = pt.z;
                }
                this.btLineGeo.attributes.position.needsUpdate = true;
                this.btLine.visible = true;
            } else {
                this.btLine.visible = false;
            }
        }

        if (this.positionTargetGroup) {
            if (showForPosition && this.dynamicTarget) {
                this.positionTargetGroup.visible = true;
                this.positionTargetGroup.position.set(this.dynamicTarget.x, 0.06, this.dynamicTarget.z);
            } else {
                this.positionTargetGroup.visible = false;
            }
        }

        if (this.styleTargetGroup) {
            if (showForStyle && styleTarget) {
                this.styleTargetGroup.visible = true;
                this.styleTargetGroup.position.set(styleTarget.x, 0.065, styleTarget.z);
            } else {
                this.styleTargetGroup.visible = false;
            }
        }


        if (typeof MatchStats !== 'undefined') {
            MatchStats[this.team].distanciaPercorrida += this.velocity.length() * dt;
        }
    }

    steerArrive(target, maxSpeed, brakingDist = 2.0) {
        let desired = new THREE.Vector3().subVectors(target, this.model.position);
        desired.y = 0; let d = desired.length();
        if (d < 0.2) return desired.set(0, 0, 0);

        desired.normalize();
        if (brakingDist > 0 && d < brakingDist) desired.multiplyScalar(maxSpeed * (d / brakingDist));
        else desired.multiplyScalar(maxSpeed);



        /*
        Corpo vira para a direcção do movimento (ou para a bola ao defender/
        apoiar).

        A excepção da excepção: ninguém se desloca DEPRESSA de lado. Acima de
        LateralGait.velViragem, se o movimento se afastar mais de `anguloMin`
        da direcção da bola, o corpo roda para onde ele vai — senão ficava a
        correr de frente e a deslizar de lado. Abaixo dessa velocidade
        mantém-se virado para a bola e o animateBones desenha passo lateral.
        */
        let lookTarget = target;
        if (this.fsm && Match.ball) {
            const s = this.fsm.currentState;
            if (s === 'MARKING' || s === 'BLOCKING' || s === 'SUPPORT_PASS') {
                lookTarget = Match.ball.position;

                if (typeof LateralGait !== 'undefined' && d > 0.0001) {
                    const velAlvo = maxSpeed;
                    if (velAlvo > LateralGait.velViragem) {
                        // desired já está normalizado e depois escalado; usa-se
                        // a direcção para o alvo, que é a mesma coisa.
                        _v2.subVectors(Match.ball.position, this.model.position);
                        _v2.y = 0;
                        if (_v2.lengthSq() > 0.01) {
                            _v2.normalize();
                            const dirMov = _v1.copy(desired).normalize();
                            const cosDesvio = dirMov.x * _v2.x + dirMov.z * _v2.z;
                            if (cosDesvio < Math.cos(LateralGait.anguloMin)) lookTarget = target;
                        }
                    }
                }
            }
        }
        _v1.set(this.model.position.x * 2 - lookTarget.x, this.model.position.y, this.model.position.z * 2 - lookTarget.z);
        _m1.lookAt(this.model.position, _v1, this.model.up);
        _q1.setFromRotationMatrix(_m1);
        /*
        Giro: 5.5/s dava ~0.18 s de constante de tempo, quase um segundo para
        completar uma inversão de 180°. Agora sai do TurnModel — com bola é mais
        lento, que é o que separa mudar de direcção a conduzir de virar sem ela.
        */
        const giro = (typeof TurnModel !== 'undefined')
            ? (this.hasBall ? TurnModel.comBola : TurnModel.base)
            : 5.5;
        this.model.quaternion.slerp(_q1, Math.min(1.0, giro * Match.delta));
        // Inércia ajustada para fator 5.0 (curvas bastante responsivas e quase sem derrapagem)
        this.velocity.lerp(desired, Math.min(1.0, 5.0 * Match.delta));
        return this.velocity;
    }

    /*
    A perna de balanço passa à frente do corpo (posição de toque/chute) perto
    de t=0.25 e t=0.75 do ciclo da passada (getGaitPose: lHip/rHip = sin(c)).
    Toques na bola disparados fora desta janela caem com a perna atrás ou a
    meio da passada — parece que o jogador "puxa" a bola de volta.
    */
    emJanelaDeToque(tol = 0.13) {
        const t = this.animPhase; // 0..1
        // R20 (0.333) para uma perna, R40 (0.666) para a outra
        const d1 = Math.abs(t - 0.333);
        const d2 = Math.abs(t - 0.666);
        return Math.min(d1, d2) < tol;
    }

    /*
    Verifica se a animação está fora do frame ideal (R20/R40) para bater na bola.
    Usado no Behavior Tree para adiar passes, remates e cruzamentos por uns frames
    até a perna estar na posição certa (ou abortar a espera se demorar demais).
    */
    aguardarPassada() {
        if (this.velocity.lengthSq() > 2.0 && !this.emJanelaDeToque()) {
            const dt = (typeof Match !== 'undefined') ? Match.delta : 0.016;
            this.touchWaitTimer = (this.touchWaitTimer || 0) + dt;
            const maxWait = (typeof CarryModel !== 'undefined') ? CarryModel.touchMaxWait : 0.3;
            if (this.touchWaitTimer < maxWait) {
                return true; // Continuar à espera
            }
        }
        this.touchWaitTimer = 0;
        return false; // Pode agir
    }

    /*
    Camada da matada no peito. Tem de correr DEPOIS do animateBones: esse
    reescreve `chest.rotation.x` e o `rotation.z` dos braços em todos os
    frames, nos dois ramos (parado e em andamento).

    Era por isso que a inclinação saía do corpo todo em vez da cintura: o
    gesto escrevia peito+braços dentro do fsm, o animateBones apagava-os logo
    a seguir, e só sobrevivia a `pelvis.rotation.x` (que estava protegida) —
    e rodar a pelvis deita o jogador inteiro para trás, pernas incluídas.

    Aqui a pelvis não se toca: o jogador fica de pé e a prumo, só o tronco
    acima da cintura vai para trás e os braços abrem um pouco.
    */
    /*
    Camada da matada no peito: só a parte superior do tronco (chest) recua
    suavemente e os braços abrem para amortecer. As pernas (lLeg/rLeg),
    joelhos (lKnee/rKnee) e pés (lFoot/rFoot) permanecem perfeitamente
    plantados e alinhados no chão, evitando qualquer sensação de tombo para trás.
    */
    aplicarCamadaPeito() {
        if (this.fsm.currentState !== 'CHEST_CONTROL') return;
        const rig = this.rig;
        if (!rig) return;

        const B = BallControl;
        const intens = this.peitoIntens || 0;

        // Só o tórax recua suavemente para amortecer a bola
        rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, B.peitoInclinacao * intens, 0.4);
        
        // Braços abrem lateralmente de forma equilibrada
        rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, B.peitoBracos * intens, 0.4);
        rig.rArm.rotation.z = lerpTo(rig.rArm.rotation.z, -B.peitoBracos * intens, 0.4);

        // Braços recuam levemente e cotovelos flexionam
        rig.lArm.rotation.x = lerpTo(rig.lArm.rotation.x, -0.15 * intens, 0.4);
        rig.rArm.rotation.x = lerpTo(rig.rArm.rotation.x, -0.15 * intens, 0.4);
        rig.lElbow.rotation.x = lerpTo(rig.lElbow.rotation.x, -0.3 * intens, 0.4);
        rig.rElbow.rotation.x = lerpTo(rig.rElbow.rotation.x, -0.3 * intens, 0.4);

        // Pernas, joelhos, tornozelos e pelve permanecem estáveis e a prumo no solo
        rig.pelvis.rotation.x = lerpTo(rig.pelvis.rotation.x, 0, 0.4);
        rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, 0, 0.4);
        rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, 0, 0.4);
        rig.lKnee.rotation.x = lerpTo(rig.lKnee.rotation.x, 0, 0.4);
        rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, 0, 0.4);
        rig.lFoot.rotation.x = lerpTo(rig.lFoot.rotation.x, 0, 0.4);
        rig.rFoot.rotation.x = lerpTo(rig.rFoot.rotation.x, 0, 0.4);
    }

    /*
    Cabeceio de pé — bola alcançável só com o corpo, sem saltar (ver o
    gatilho headLeanTimer em animateBones). Inclina o tronco para trás e o
    pescoço para cima e para trás durante um instante curto; nunca sai do
    chão. Mesmo padrão de camada aditiva das outras duas (corte, peito).
    */
    aplicarCamadaCabeceioDePe(dt) {
        if (this.headLeanTimer <= 0) return;
        this.headLeanTimer -= dt;
        const rig = this.rig;
        if (!rig) return;

        // Sobe e desfaz com a mesma forma em sino das outras camadas: pico a
        // meio da janela, não no início nem no fim.
        const k = Math.max(0, Math.min(1, this.headLeanTimer / 0.30));
        const intens = Math.sin(k * Math.PI);

        rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, -0.20 * intens, 0.5);
        if (rig.neck) rig.neck.rotation.x = lerpTo(rig.neck.rotation.x, 0.35 * intens, 0.5);
        rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, 0.15 * intens, 0.5);
        rig.rArm.rotation.z = lerpTo(rig.rArm.rotation.z, -0.15 * intens, 0.5);

        // Mantém pelve, pernas e pés perfeitamente plantados
        rig.pelvis.rotation.x = lerpTo(rig.pelvis.rotation.x, 0, 0.5);
        rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, 0, 0.5);
        rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, 0, 0.5);
        rig.lKnee.rotation.x = lerpTo(rig.lKnee.rotation.x, 0, 0.5);
        rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, 0, 0.5);
        rig.lFoot.rotation.x = lerpTo(rig.lFoot.rotation.x, 0, 0.5);
        rig.rFoot.rotation.x = lerpTo(rig.rFoot.rotation.x, 0, 0.5);
    }

    animateBones(dt) {
        let speed = this.velocity.length(); let rig = this.rig;

        // CHEST_CONTROL NÃO entra na lista: a matada no peito não mexe na
        // pelvis (ver aplicarCamadaPeito), o jogador continua de pé e a
        // prumo — as pernas e a anca devem voltar ao normal como sempre.
        const s = this.fsm.currentState;
        if (s !== 'TACKLE' && s !== 'SLIDE_TACKLE' && s !== 'SHOOT' && this.jumpTimer <= 0 && (this.role !== 'gk' || (this.gkEstado !== 'mergulho' && this.gkEstado !== 'salto_alto'))) {
            rig.pelvis.rotation.x = lerpTo(rig.pelvis.rotation.x, 0, 0.25);
            rig.pelvis.rotation.y = lerpTo(rig.pelvis.rotation.y, 0, 0.25);
            rig.pelvis.rotation.z = lerpTo(rig.pelvis.rotation.z, 0, 0.25);
            
            rig.chest.rotation.y = lerpTo(rig.chest.rotation.y, 0, 0.25);
            rig.chest.rotation.z = lerpTo(rig.chest.rotation.z, 0, 0.25);
            
            rig.lLeg.rotation.y = lerpTo(rig.lLeg.rotation.y, 0, 0.25);
            rig.rLeg.rotation.y = lerpTo(rig.rLeg.rotation.y, 0, 0.25);
            
            rig.lKnee.rotation.y = lerpTo(rig.lKnee.rotation.y, 0, 0.25);
            rig.lKnee.rotation.z = lerpTo(rig.lKnee.rotation.z, 0, 0.25);
            rig.rKnee.rotation.y = lerpTo(rig.rKnee.rotation.y, 0, 0.25);
            rig.rKnee.rotation.z = lerpTo(rig.rKnee.rotation.z, 0, 0.25);
            
            rig.lFoot.rotation.y = lerpTo(rig.lFoot.rotation.y, Math.PI / 16, 0.25);
            rig.lFoot.rotation.z = lerpTo(rig.lFoot.rotation.z, 0, 0.25);
            rig.rFoot.rotation.y = lerpTo(rig.rFoot.rotation.y, -Math.PI / 16, 0.25);
            rig.rFoot.rotation.z = lerpTo(rig.rFoot.rotation.z, 0, 0.25);
            
            rig.lArm.rotation.y = lerpTo(rig.lArm.rotation.y, 0, 0.25);
            rig.rArm.rotation.y = lerpTo(rig.rArm.rotation.y, 0, 0.25);
            
            rig.lElbow.rotation.y = lerpTo(rig.lElbow.rotation.y, 0, 0.25);
            rig.lElbow.rotation.z = lerpTo(rig.lElbow.rotation.z, 0, 0.25);
            rig.rElbow.rotation.y = lerpTo(rig.rElbow.rotation.y, 0, 0.25);
            rig.rElbow.rotation.z = lerpTo(rig.rElbow.rotation.z, 0, 0.25);
            
            if (speed < 0.1) {
                rig.lElbow.rotation.x = lerpTo(rig.lElbow.rotation.x, 0, 0.25);
                rig.rElbow.rotation.x = lerpTo(rig.rElbow.rotation.x, 0, 0.25);
            }
        }

        if (this.jumpCooldown > 0) this.jumpCooldown -= dt;

        /*
        Salto de cabeceio com pontaria NO TEMPO — ver SaltoCabeceio em
        config.js. Olha-se para onde a bola vai estar no instante do pico
        (metade da duração do salto) e salta-se só se ela lá estiver ao
        alcance e acima da cabeça; a subida é a que falta para lhe chegar.

        Antes: gatilho por altura instantânea (1.2-4.5 m) e pico fixo de
        1.8 m. Saltava para bolas quase no chão e no topo já não lhes tocava.
        */
        if (!this.hasBall && this.role !== 'gk' &&
            this.fsm.currentState !== 'CHEST_CONTROL' &&
            (!this.jumpTimer || this.jumpTimer <= 0) &&
            (!this.jumpCooldown || this.jumpCooldown <= 0)) {
            const maxHeaders = (typeof HeaderModel !== 'undefined' && HeaderModel.maxHeadersSeguidos) ? HeaderModel.maxHeadersSeguidos : 2;
            const atingiuLimiteCabeca = (typeof Match !== 'undefined' && Match.aerialHeaderCount >= maxHeaders);

            if (!atingiuLimiteCabeca) {
                const S = SaltoCabeceio;
                const prev = preverBolaEm(S.duracao * 0.5);
                /*
                Medido da TESTA, não do topo da cabeça: é a testa que bate na
                bola. Com ALTURA_CABECA o salto levava o TOPO do crânio à bola e
                ela passava por cima sem contacto.
                */
                const subida = prev.y - (ALTURA_BASE_Y + ALTURA_TESTA);
                const dXZ = Math.hypot(this.model.position.x - prev.x, this.model.position.z - prev.z);
                if (dXZ < S.alcanceXZ && subida > S.alturaSemPulo && subida < S.alturaMax) {
                    this.jumpTimer = S.duracao;
                    this.jumpApex = subida;
                    this.jumpCooldown = S.cooldown;

                    // Vira de frente para onde a bola vai estar no pico do salto
                    // ANTES de saltar — sem isto o corpo ficava com a orientação
                    // da corrida até esse instante (o pescoço só cobre +-80°, e
                    // o lookAtBola do contacto em executeHeader só corrige tarde
                    // de mais, já no ar/depois do salto visualmente feito).
                    //
                    // Só no plano horizontal (y do próprio jogador, não o da
                    // bola): perto do pico a bola pode estar quase 0.8 m em cima
                    // da cabeça a menos de 1.4 m de distância — ângulo de
                    // elevação quase vertical. lookAt a apontar quase para o eixo
                    // "up" é degenerado e distorcia o rig todo (cabeça sumia).
                    lookAtBola(this.model, _v1.set(prev.x, this.model.position.y, prev.z));
                } else if (dXZ < S.alcanceXZ && subida > S.subidaMin && subida <= S.alturaSemPulo) {
                    /*
                    Bola mesmo em cima da cabeça — chega-se só inclinando o
                    tronco para trás e o pescoço para cima, sem saltar (ver
                    aplicarCamadaCabeceioDePe). É a opção preferida sempre que
                    dá: um salto inteiro para uma bola que já está ao alcance é
                    que ficava estranho.
                    */
                    this.headLeanTimer = 0.30;
                    this.jumpCooldown = 0.4;
                    lookAtBola(this.model, _v1.set(prev.x, this.model.position.y, prev.z));
                }
            }
        }

        let jumpHeight = 0;
        if (this.jumpTimer > 0) {
            this.jumpTimer -= dt;
            let jt = this.jumpTimer / SaltoCabeceio.duracao;
            jumpHeight = Math.sin(jt * Math.PI) * (this.jumpApex || SaltoCabeceio.alturaMax);
            this.model.position.y = ALTURA_BASE_Y + jumpHeight;

            /*
            Cabeceio em fases (pedido explícito, referência de 12 frames):
            SUBIDA (tronco/pescoço recuam progressivamente, braços abrem) ->
            CONTACTO (chicote explosivo para a frente — tronco, pescoço e
            pernas invertem de repente) -> DESCIDA (volta ao neutro, pernas
            esticam à procura do chão).

            `p` é o progresso 0..1 do salto (`jt` conta ao contrário). O
            contacto cai perto de p=0.5 porque o salto é apontado para a
            bola estar à altura da cabeça exactamente a meio (ver o gatilho
            de SaltoCabeceio acima) — não é escolhido à parte, seguido daí.

            Alvos dentro de JointLimits.chest.x (-25°..60°) e .neck.x
            (-60°..50°) — o -0.55 antigo já tinha side-effects deste tipo
            (ver o bug do lookAt vertical na cabeçada, corrigido antes).
            */
            const p = 1 - jt;
            let chestX, neckX, armZ;
            if (p < 0.45) {
                const k = THREE.MathUtils.clamp(p / 0.45, 0, 1);
                chestX = -0.42 * k;
                neckX = -0.5 * k;
                armZ = 2.0 * k;
            } else if (p < 0.58) {
                const k = THREE.MathUtils.clamp((p - 0.45) / 0.13, 0, 1);
                chestX = -0.42 + 0.92 * k;   // -0.42 -> 0.50
                neckX = -0.5 + 1.10 * k;     // -0.5 -> 0.60
                armZ = 2.0 - 1.2 * k;        // braços fecham um pouco no impacto
            } else {
                const k = THREE.MathUtils.clamp((p - 0.58) / 0.42, 0, 1);
                chestX = 0.50 * (1 - k);
                neckX = 0.60 * (1 - k);
                armZ = 0.8 * (1 - k);
            }

            rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, chestX, 0.5);
            if (rig.neck) rig.neck.rotation.x = lerpTo(rig.neck.rotation.x, neckX, 0.5);
            rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, armZ, 0.5);
            rig.rArm.rotation.z = lerpTo(rig.rArm.rotation.z, -armZ, 0.5);

            /*
            Pedido explícito: quem dobra é a parte de BAIXO da perna (joelho,
            rig.lKnee/rKnee), não a coxa inteira (rig.lLeg/rLeg, ficava um
            "prancha" rígido girando no quadril — era o que estava errado).
            Curva PRÓPRIA, independente das 3 fases do tronco: dobra rápido
            na primeira metade da subida e já volta a esticar bem ANTES do
            contacto (pico ~p=0.28, zero a partir de p≈0.58) — "a parte de
            baixo da perna vai retornando à posição reta" ENQUANTO a cabeça
            ainda está a chicotear para a bola, não depois.
            */
            let kneeX;
            if (p < 0.28) {
                kneeX = Math.sin(THREE.MathUtils.clamp(p / 0.28, 0, 1) * Math.PI / 2) * 1.0;
            } else {
                kneeX = 1.0 * (1 - THREE.MathUtils.clamp((p - 0.28) / 0.30, 0, 1));
            }
            rig.lKnee.rotation.x = lerpTo(rig.lKnee.rotation.x, kneeX, 0.5);
            rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, kneeX, 0.5);
            // Coxa só um leve avanço de apoio — o movimento é do joelho.
            rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, 0.10 * Math.sin(p * Math.PI), 0.5);
            rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, 0.10 * Math.sin(p * Math.PI), 0.5);
        }

        /*
        Cabeça acompanha a bola, dentro de +-80 graus do corpo — dá pra
        correr para um lado olhando para a bola/lateral, em vez de ficar
        sempre a olhar em frente. Antes só o corpo inteiro virava (via
        model.lookAt), sem pescoço independente.
        */
        if (rig.neck && Match.ball && this.fsm.currentState !== 'TACKLE' && this.fsm.currentState !== 'SLIDE_TACKLE') {
            _v1.subVectors(Match.ball.position, this.model.position);
            _v1.y = 0;
            if (_v1.lengthSq() > 0.01) {
                _v1.normalize();
                _v2.set(0, 0, 1).applyQuaternion(this.model.quaternion);
                // Sinal estava trocado (testado: bola à direita dava ângulo
                // negativo = cabeça virava pra esquerda). atan2(cross,dot)
                // com cross = fwd.z*toBall.x - fwd.x*toBall.z acerta o lado.
                const cross = _v2.z * _v1.x - _v2.x * _v1.z;
                const dot = _v2.dot(_v1);
                let angle = Math.atan2(cross, dot);
                const maxHeadAngle = (80 * Math.PI) / 180;
                angle = THREE.MathUtils.clamp(angle, -maxHeadAngle, maxHeadAngle);
                // A cintura acompanha uma fracção do giro da cabeça — olhar
                // de lado para a bola não fica só no pescoço, o tronco gira
                // um pouco também. Guardado para os ramos parado/a mover-se
                // aplicarem (ver abaixo); dentro do limite anatómico do
                // tronco (JointLimits.chest.y, ±45°).
                this.cinturaAlvoY = angle * 0.35;
                rig.neck.rotation.y = lerpTo(rig.neck.rotation.y, angle, 0.25);
            }
        }

        if (this.fsm.currentState === 'TACKLE' || this.fsm.currentState === 'SLIDE_TACKLE') {
            return;
        }

        if (this.jumpTimer > 0) {
            return; 
        }

        /*
        CHEST_CONTROL força este ramo mesmo com `speed >= 0.1`: a velocidade só
        decai (*0.75/frame, ver fsm.js) em vez de zerar na entrada, e por uns
        ~13 frames (~0.2s) ficava >= 0.1 — tempo que chegava para o ramo da
        passada de corrida (`speed >= 0.1` mais abaixo) escrever a perna
        INTEIRA em pose de sprint por cima de tudo (esse ramo faz set directo,
        sem lerp). aplicarCamadaPeito() só mexe no joelho, nunca em
        lLeg/rLeg.rotation.x — a perna ficava esticada em passada, lendo como
        o jogador deitado no chão. Aqui entra sempre em modo neutro (lerp),
        e a camada do peito continua a desenhar por cima como já fazia.
        */
        if ((speed < 0.1 || this.fsm.currentState === 'CHEST_CONTROL') && this.fsm.currentState !== 'PASS' && this.fsm.currentState !== 'SHOOT') {
            // O salto leve da matada no peito escreve position.y no próprio
            // fsm.js (case CHEST_CONTROL), que corre antes disto — não pisar.
            if (!(this.fsm.currentState === 'CHEST_CONTROL' && this.peitoHopTimer > 0)) {
                this.model.position.y = lerpTo(this.model.position.y, ALTURA_BASE_Y);
            }
            rig.chest.rotation.y = lerpTo(rig.chest.rotation.y, this.cinturaAlvoY || 0); rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, 0);
            rig.pelvis.rotation.y = lerpTo(rig.pelvis.rotation.y, 0); rig.pelvis.rotation.z = lerpTo(rig.pelvis.rotation.z, 0);
            rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, 0); rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, 0);
            rig.lKnee.rotation.x = lerpTo(rig.lKnee.rotation.x, 0); rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, 0);
            rig.lFoot.rotation.x = lerpTo(rig.lFoot.rotation.x, 0); rig.rFoot.rotation.x = lerpTo(rig.rFoot.rotation.x, 0);
            rig.lArm.rotation.x = lerpTo(rig.lArm.rotation.x, 0); rig.rArm.rotation.x = lerpTo(rig.rArm.rotation.x, 0);
            rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, Math.PI / 12); rig.rArm.rotation.z = lerpTo(rig.rArm.rotation.z, -Math.PI / 12);
            rig.lLeg.rotation.z = lerpTo(rig.lLeg.rotation.z, Math.PI / 32); rig.rLeg.rotation.z = lerpTo(rig.rLeg.rotation.z, -Math.PI / 32);
            return;
        }
        if (speed >= 0.1) {
            let movingBackwards = false;
            let fwd = _v2.set(0, 0, 1).applyQuaternion(this.model.quaternion).normalize();
            let velDir = _v1.copy(this.velocity).normalize();
            if (fwd.dot(velDir) < -0.3) {
                movingBackwards = true;
            }

            /*
            A cadência sai da PASSADA do andamento, não de um divisor fixo.

            Era `animTimer += speed*dt/3.0`, ou seja 3 m por ciclo a qualquer
            velocidade — o mesmo tamanho de passo a andar e a sprintar. Agora
            cada andamento tem a sua passada (1.55 m a andar, 4.40 m a correr) e
            a cadência é velocidade/passada.
            */
            const pose = getGaitPose(0, speed);          // só para ler a passada
            const avanco = (speed * dt) / pose.passada;
            this.animTimer += movingBackwards ? -avanco : avanco;

            const t = ((this.animTimer % 1.0) + 1.0) % 1.0;
            this.animPhase = t;
            const P = getGaitPose(t, speed);

            /*
            PASSO LATERAL. `alinhamento` é o coseno entre a frente do corpo e a
            direcção do movimento: 1 a direito, 0 de lado, -1 de costas.
            `lateralidade` (0..1) é quanto disto é deslocação de lado.

            Quem se desloca de lado não dá passadas inteiras — encolhe-se a
            amplitude e abrem-se/fecham-se as ancas ao ritmo do ciclo, que é o
            passo do defesa. Sem isto o ciclo frontal tocava por cima de uma
            deslocação lateral e o boneco patinava.
            */
            let lateralidade = 0;
            let ladoMov = 0;
            if (typeof LateralGait !== 'undefined') {
                const alinhamento = fwd.dot(velDir);
                const desvio = Math.acos(THREE.MathUtils.clamp(Math.abs(alinhamento), -1, 1));
                if (desvio > LateralGait.anguloMin) {
                    lateralidade = Math.min(1, (desvio - LateralGait.anguloMin) /
                        (Math.PI / 2 - LateralGait.anguloMin));
                    // >0 = movimento para a direita do corpo.
                    ladoMov = Math.sign(fwd.z * velDir.x - fwd.x * velDir.z) || 1;
                }
            }
            const amp = 1 - lateralidade *
                ((typeof LateralGait !== 'undefined') ? LateralGait.reducaoPassada : 0);

            rig.lLeg.rotation.x = P.lHip * amp; rig.lKnee.rotation.x = P.lKnee * amp; rig.lFoot.rotation.x = P.lFoot * amp;
            rig.rLeg.rotation.x = P.rHip * amp; rig.rKnee.rotation.x = P.rKnee * amp; rig.rFoot.rotation.x = P.rFoot * amp;
            rig.lArm.rotation.x = P.lArm * amp; rig.rArm.rotation.x = P.rArm * amp;

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
            rig.chest.rotation.y = lerpTo(rig.chest.rotation.y, this.cinturaAlvoY || 0);

            this.model.position.y = ALTURA_BASE_Y + P.ressalto;
        }
    }

    buildBody(corCamisa, corCalcao) {
        // Pele e juntas seguem o tom do jogador; as juntas ficam um pouco mais
        // escuras que a pele, para o contorno das articulações não desaparecer.
        const ap = this.aparencia || escolherAparencia(0, 11, 0);
        const corPele = ap.pele;
        const corJunta = new THREE.Color(corPele).multiplyScalar(0.72).getHex();
        const blockMat = new THREE.MeshStandardMaterial({ color: corPele, roughness: 0.8 }); const jointMat = new THREE.MeshStandardMaterial({ color: corJunta, roughness: 0.6 });
        const shirtMat = new THREE.MeshStandardMaterial({ color: corCamisa, roughness: 0.9 }); const shortMat = new THREE.MeshStandardMaterial({ color: corCalcao, roughness: 0.9 });
        const bootMat = new THREE.MeshStandardMaterial({ color: ap.corChuteira, roughness: 0.5 }); const studMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
        const hairMat = new THREE.MeshStandardMaterial({ color: ap.cabelo, roughness: 0.9 });
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x2f3640, linewidth: 2 }); const lineMat = new THREE.LineBasicMaterial({ color: 0x2f3640 });

        const cvsV = document.createElement('canvas'); cvsV.width = 512; cvsV.height = 512; const ctxV = cvsV.getContext('2d');
        ctxV.fillStyle = corCamisa; ctxV.fillRect(0, 0, 512, 512); ctxV.fillStyle = '#dcdde1'; ctxV.beginPath(); ctxV.moveTo(136, 0); ctxV.lineTo(376, 0); ctxV.lineTo(256, 280); ctxV.fill(); ctxV.strokeStyle = '#2f3640'; ctxV.lineWidth = 12; ctxV.stroke();

        this.backMat = new THREE.MeshStandardMaterial({ color: corCamisa, roughness: 0.9 });
        const chestMats = [shirtMat, shirtMat, shirtMat, shirtMat, new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cvsV) }), this.backMat];

        const cvsS = document.createElement('canvas'); cvsS.width = 256; cvsS.height = 256; const ctxS = cvsS.getContext('2d');
        ctxS.fillStyle = corCamisa; ctxS.fillRect(0, 0, 256, 256); ctxS.fillStyle = '#ffffff'; ctxS.fillRect(0, 20, 256, 30); ctxS.fillRect(0, 70, 256, 15); ctxS.strokeStyle = '#2f3640'; ctxS.lineWidth = 4; ctxS.strokeRect(0, 0, 256, 256);
        const sockTex = new THREE.CanvasTexture(cvsS);
        const sockMats = [new THREE.MeshStandardMaterial({ map: sockTex }), new THREE.MeshStandardMaterial({ map: sockTex }), new THREE.MeshStandardMaterial({ color: corCamisa }), new THREE.MeshStandardMaterial({ color: corCamisa }), new THREE.MeshStandardMaterial({ map: sockTex }), new THREE.MeshStandardMaterial({ map: sockTex })];

        const u = 1.0; const corpo = new THREE.Group();
        const rig = { pelvis: null, chest: null, neck: null, lArm: null, rArm: null, lElbow: null, rElbow: null, lHand: null, rHand: null, lLeg: null, rLeg: null, lKnee: null, rKnee: null, lFoot: null, rFoot: null, olhoEsq: null, olhoDir: null };

        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 850);
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
        const head = criarPeca(new THREE.BoxGeometry(u * 0.8, u * 1.0, u * 0.85), blockMat); head.position.y = 0.575;

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
            const up = criarPeca(new THREE.BoxGeometry(u * 0.35, u * 1.0, u * 0.35), blockMat); up.position.y = -0.5;
            const manga = criarPeca(new THREE.BoxGeometry(u * 0.4, u * 0.5, u * 0.4), shirtMat); manga.position.y = 0.25; up.add(manga); grp.add(up);
            const elb = new THREE.Group(); elb.position.y = -1.0; grp.add(elb); elb.add(criarPeca(smallJointGeo, jointMat));
            const low = criarPeca(new THREE.BoxGeometry(u * 0.3, u * 0.8, u * 0.3), blockMat); low.position.y = -0.4; elb.add(low);
            const handG = new THREE.Group(); handG.position.y = -0.8; elb.add(handG);
            const mao = criarPeca(new THREE.BoxGeometry(u * 0.35, u * 0.4, u * 0.2), blockMat); mao.position.y = -0.2; mao.rotation.y = Math.PI / 2; handG.add(mao);
            grp.rotation.z = x < 0 ? -Math.PI / 16 : Math.PI / 16; chest.add(grp); return { raiz: grp, cotovelo: elb, mao: handG };
        }

        function criarPerna(x) {
            const grp = new THREE.Group(); grp.position.set(x, -0.3, 0); grp.add(criarPeca(jointGeo, jointMat));
            const coxa = criarPeca(new THREE.BoxGeometry(u * 0.45, u * 1.0, u * 0.45), blockMat); coxa.position.y = -0.5;
            const shortL = criarPeca(new THREE.BoxGeometry(u * 0.5, u * 0.5, u * 0.5), shortMat); shortL.position.y = 0.25; coxa.add(shortL); grp.add(coxa);
            const joelho = new THREE.Group(); joelho.position.y = -1.0; grp.add(joelho); joelho.add(criarPeca(smallJointGeo, jointMat));
            const canela = criarPeca(new THREE.BoxGeometry(u * 0.35, u * 0.9, u * 0.35), blockMat); canela.position.y = -0.45;
            const meiao = criarPeca(new THREE.BoxGeometry(u * 0.4, u * 0.85, u * 0.4), sockMats); meiao.position.y = 0.0; canela.add(meiao); joelho.add(canela);
            const peG = new THREE.Group(); peG.position.y = -0.9; joelho.add(peG);

            const footGeo = new THREE.BoxGeometry(u * 0.45, u * 0.4, u * 1.0); const p = footGeo.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getZ(i) > 0 && p.getY(i) > 0) p.setY(i, p.getY(i) - u * 0.25); } footGeo.computeVertexNormals();
            const chuteira = criarPeca(footGeo, bootMat); chuteira.position.set(0, -0.2, u * 0.25); peG.add(chuteira);

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

        corpo.scale.set((1.8 / 5.5) * 0.9, (1.8 / 5.5) * 0.9, (1.8 / 5.5) * 0.9); return { corpo, rig };
    }

    updateShirt(num, pos) {
        /*
        VISTA TÁCTICA: na câmara de cima o jogador é um disco da cor da
        equipa, em vez do boneco. De 40 m de altura o boneco lê-se mal e as
        pernas a mexer só fazem ruído — o que se quer ver dali é para onde a
        forma da equipa se desloca.

        Vive na cena e não dentro do `model`: assim não sobe com o jogador
        no salto nem roda com ele. Fica sempre pousado no relvado.
        */
        if (!this.discoTatico) {
            this.discoTatico = new THREE.Mesh(
                new THREE.CircleGeometry(0.85, 24),
                new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
            );
            this.discoTatico.rotation.x = -Math.PI / 2;
            this.discoTatico.visible = false;
            Match.scene.add(this.discoTatico);
        }

        if (this.discoTaticoTexNum !== num || this.discoTaticoTexTeam !== this.team) {
            let dtCanvas = document.createElement('canvas');
            dtCanvas.width = 128; dtCanvas.height = 128;
            let dtCtx = dtCanvas.getContext('2d');
            
            let isTeamA = (this.team === 'TeamA');
            let borderColor = isTeamA ? '#000000' : '#ffffff';
            let textColor = isTeamA ? '#000000' : '#ffffff';
            
            dtCtx.fillStyle = this.corCamisa;
            dtCtx.beginPath();
            dtCtx.arc(64, 64, 58, 0, Math.PI * 2);
            dtCtx.fill();
            
            dtCtx.lineWidth = 8;
            dtCtx.strokeStyle = borderColor;
            dtCtx.stroke();
            
            dtCtx.fillStyle = textColor;
            dtCtx.font = 'bold 54px sans-serif';
            dtCtx.textAlign = 'center';
            dtCtx.textBaseline = 'middle';
            dtCtx.save();
            dtCtx.translate(64, 64);
            dtCtx.rotate(-Math.PI / 2);
            dtCtx.fillText(num, 0, 0);
            dtCtx.restore();
            
            let dtTex = new THREE.CanvasTexture(dtCanvas);
            this.discoTatico.material.map = dtTex;
            this.discoTatico.material.needsUpdate = true;
            this.discoTaticoTexNum = num;
            this.discoTaticoTexTeam = this.team;
        }

        if (!this.btTargetGroup) {
            this.btTargetGroup = new THREE.Group();
            this.btTargetGroup.visible = false;
            let ringColorNum = this.team === 'TeamA' ? 0x3498db : 0xe74c3c;

            let ring = new THREE.Mesh(
                new THREE.RingGeometry(0.8, 1.0, 32), 
                new THREE.MeshBasicMaterial({ color: ringColorNum, side: THREE.DoubleSide })
            );
            ring.rotation.x = -Math.PI / 2;
            this.btTargetGroup.add(ring);

            let btCanvas = document.createElement('canvas');
            btCanvas.width = 128; btCanvas.height = 64;
            let btCtx = btCanvas.getContext('2d');
            btCtx.fillStyle = 'rgba(0,0,0,0)'; btCtx.fillRect(0,0,128,64);
            btCtx.fillStyle = '#ffffff';
            btCtx.font = 'bold 36px sans-serif';
            btCtx.textAlign = 'center';
            btCtx.textBaseline = 'middle';
            btCtx.fillText(pos, 64, 32);
            
            let btTex = new THREE.CanvasTexture(btCanvas);
            let btMat = new THREE.MeshBasicMaterial({ map: btTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
            let btPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), btMat);
            btPlane.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
            btPlane.position.set(0, 0.001, 0); 
            this.btTargetGroup.add(btPlane);

            if (typeof Match !== 'undefined' && Match.scene) {
                Match.scene.add(this.btTargetGroup);
            }

            /*
            Linha da cadeia de posicionamento: liga os anéis LIGADOS pela
            ordem em que são calculados — slot do TeamBT, slot+estilo, alvo
            final. O troço slot -> estilo é literalmente o desvio que o
            Playing Style introduz.
            */
            this.btLineGeo = new THREE.BufferGeometry();
            // Três vértices: slot -> slot+estilo -> alvo final (ver o desenho
            // por frame, mais acima). Eram dois, e só davam para um troço.
            this.btLineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
            this.btLine = new THREE.Line(this.btLineGeo, new THREE.LineBasicMaterial({ color: ringColorNum }));
            this.btLine.visible = false;
            if (typeof Match !== 'undefined' && Match.scene) {
                Match.scene.add(this.btLine);
            }

            /*
            Anel do "PositionBT" (médio): o alvo A SÉRIO — `dynamicTarget`, o
            ponto que o steerArrive persegue, já com marcação, inquietação,
            tecto e alisamento. É o fim da linha de montagem; os outros dois
            anéis são etapas dela.
            */
            this.positionTargetGroup = new THREE.Group();
            this.positionTargetGroup.visible = false;
            let posRing = new THREE.Mesh(
                new THREE.RingGeometry(0.5, 0.62, 24),
                new THREE.MeshBasicMaterial({ color: ringColorNum, side: THREE.DoubleSide })
            );
            posRing.rotation.x = -Math.PI / 2;
            this.positionTargetGroup.add(posRing);
            if (typeof Match !== 'undefined' && Match.scene) {
                Match.scene.add(this.positionTargetGroup);
            }

            /*
            Anel do "PlayingStyle" (menor): o posto depois do desvio pessoal do
            estilo e ANTES da marcação (p.postoBase).
            */
            this.styleTargetGroup = new THREE.Group();
            this.styleTargetGroup.visible = false;
            let styleRing = new THREE.Mesh(
                new THREE.RingGeometry(0.267, 0.333, 20),
                new THREE.MeshBasicMaterial({ color: ringColorNum, side: THREE.DoubleSide })
            );
            styleRing.rotation.x = -Math.PI / 2;
            this.styleTargetGroup.add(styleRing);
            if (typeof Match !== 'undefined' && Match.scene) {
                Match.scene.add(this.styleTargetGroup);
            }

        } else if (this.pos !== pos) {
            let btCtx = this.btTargetGroup.children[1].material.map.image.getContext('2d');
            btCtx.clearRect(0,0,128,64);
            btCtx.fillStyle = '#ffffff';
            btCtx.font = 'bold 36px sans-serif';
            btCtx.textAlign = 'center';
            btCtx.textBaseline = 'middle';
            btCtx.fillText(pos, 64, 32);
            this.btTargetGroup.children[1].material.map.needsUpdate = true;
        }

        if (this.num === num && this.pos === pos && this.backMat.map) return;
        this.num = num;
        this.pos = pos;
        const cvsBack = document.createElement('canvas'); cvsBack.width = 512; cvsBack.height = 512; const ctxBack = cvsBack.getContext('2d');
        ctxBack.fillStyle = this.corCamisa; ctxBack.fillRect(0, 0, 512, 512);

        if (this.team === 'TeamA') {
            ctxBack.fillStyle = '#000000'; 
        } else {
            ctxBack.fillStyle = '#ffffff'; 
        }

        ctxBack.font = 'bold 260px "Segoe UI"'; ctxBack.textAlign = 'center'; ctxBack.textBaseline = 'middle';
        ctxBack.fillText(this.num.toString(), 256, 280);

        ctxBack.font = 'bold 80px "Segoe UI"';
        ctxBack.fillText(this.pos, 256, 100);

        if (this.backMat.map) this.backMat.map.dispose();
        this.backMat.map = new THREE.CanvasTexture(cvsBack);
        // Cor base tingia o mapa (branco em vermelho ficava avermelhado, ilegível). Canvas já tem as cores certas.
        this.backMat.color.set(0xffffff);
        this.backMat.needsUpdate = true;
    }

    updateGK(dt) {
        let gkCorpo = this.model; let gkRig = this.rig;
        let limitGKX = (LARGURA_BALIZA / 2) - 0.5;

        let prevX = gkCorpo.position.x;
        let prevZ = gkCorpo.position.z;

        gkCorpo.position.x = Math.max(-20.16, Math.min(20.16, gkCorpo.position.x));
        let meioComp = CAMPO_COMP / 2;
        let areaMinZ = (this.team === 'TeamA') ? -meioComp : meioComp - 16.5;
        let areaMaxZ = (this.team === 'TeamA') ? -meioComp + 16.5 : meioComp;
        gkCorpo.position.z = Math.max(areaMinZ, Math.min(areaMaxZ, gkCorpo.position.z));

        if (window.bolaChutada && !this.gkReagiu) {
            this.gkDelayReacao -= dt;
            if (this.gkDelayReacao <= 0) {
                this.gkReagiu = true;
            }
        }

        if (this.gkEstado === 'idle') {
            let alvoGkX = (typeof Match !== 'undefined' && (Match.state === 'GOAL' || Match.state === 'OUT')) ? 0 : gkCorpo.position.x;

            /*
            Posição de repouso: sai toda de gkAnchor() (config.js), a mesma
            função que os ramos defensivos usam mais abaixo. Antes eram quatro
            fórmulas diferentes, com coeficientes que SUBIAM (0.15, 0.35, 0.55)
            à medida que o atacante se aproximava — quanto maior o perigo, mais
            ele saía da baliza — e uma base de repouso já 5 m fora da linha.
            */
            const gkStyleAtual = GoalkeeperStyle[this.gkStyle] || GoalkeeperStyle.defensive;
            const ancora = gkAnchor(Match.ball.position.x, Match.ball.position.z,
                this.ownGoalZ, this.dirZ, gkStyleAtual);

            let alvoGkZ = (typeof Match !== 'undefined' && Match.state === 'GOAL')
                ? (-48 * this.dirZ)
                : ancora.z;

            let speedLerp = (typeof Match !== 'undefined' && Match.state === 'GOAL') ? 4.0 : 2.0;

            let gkSkill = this.skillFor('GK');

            let bolaVindoPraMim = (this.team === 'TeamA') ? (Match.ballVel.z < -5) : (Match.ballVel.z > 5);

            if (bolaVindoPraMim && this.gkReagiu) {
                let tempoAteGolo = Math.abs(gkCorpo.position.z - Match.ball.position.z) / Math.abs(Match.ballVel.z);
                if (tempoAteGolo > 0 && tempoAteGolo < 1.5) {
                    let interX = Match.ball.position.x + (Match.ballVel.x * tempoAteGolo);
                    let interY = Match.ball.position.y + Match.ballVel.y * tempoAteGolo - 0.5 * BallPhysics.gravidade * tempoAteGolo * tempoAteGolo;
                    interX = Math.max(-limitGKX, Math.min(limitGKX, interX)); interY = Math.max(0, Math.min(2.44, interY));

                    /*
                    Bola perto do corpo não é mergulho: fica de pé e leva as
                    mãos até ela (ver estado 'maos'). Só se atira ao chão se
                    ela passar a mais de GoalkeeperPose.mergulhoLateralMin do
                    lado dele.
                    */
                    const lateral = interX - gkCorpo.position.x;
                    this.gkTempoMergulho = 0;
                    this.gkAlvoX = interX;
                    if (Math.abs(lateral) < GoalkeeperPose.mergulhoLateralMin) {
                        this.gkEstado = 'maos';
                    } else {
                        this.gkEstado = 'mergulho';
                        this.dive = null;   // arranca um mergulho novo (GkDive)
                        this.gkDirMergulho = Math.sign(lateral);
                        this.gkAlvoY = interY;
                        if (interY > 1.6) this.gkTipoMergulho = 'alto'; else if (interY > 0.8) this.gkTipoMergulho = 'meio'; else this.gkTipoMergulho = 'baixo';
                    }
                }
                speedLerp = 3.0 + ((gkSkill - 50) / 50) * 6.0;
            } else if (Match.state === 'PLAY') {
                let isAttacking = (Match.possessionTeam === this.team);
                let bolaNaArea = (Math.abs(Match.ball.position.x) < 20.16 && Match.ball.position.z * this.dirZ < -36.5);
                
                // Exclui a bola que ele mesmo acabou de chutar (relançamento/
                // reposição) — sem isto, um pontapé de baliza contava como
                // cruzamento a entrar na própria área e o GK saltava/mergulhava
                // logo a seguir ao próprio chute.
                let isCross = (Match.ballVel.y > 2.0 && Match.ball.position.y > 1.2 && Math.abs(Match.ball.position.z) > 24 && !Match.ballCarrier && Match.lastTouchedPlayer !== this);

                /*
                Bola solta, lenta, perto dele — passe atrás do próprio time
                ou bola perdida do adversário, tanto faz: ele SEMPRE apanha
                com as mãos, nunca controla com o pé. Antes isto só existia
                dentro do ramo "!isAttacking && bolaNaArea" — um passe atrás
                enquanto o próprio time tinha posse nunca disparava o
                'apanhar', e a bola acabava só grudada ao pé dele (resolvida
                por resolveBallContact() como qualquer jogador de linha).
                */
                const semDono = !Match.ballCarrier;
                const mansinha = Match.ballVel.length() < BallControl.easySpeed;
                const distBolaAgora = gkCorpo.position.distanceTo(Match.ball.position);

                if (semDono && mansinha && distBolaAgora < 10.0) {
                    alvoGkX = Match.ball.position.x;
                    alvoGkZ = Match.ball.position.z;
                    speedLerp = 5.5;
                    if (distBolaAgora < 1.2) {
                        this.gkEstado = 'apanhar';
                        this.gkTempoMergulho = 0;
                    }
                } else if (isCross) {
                    alvoGkZ = ownGoalZCenter(this.team) + (Match.ball.position.z - ownGoalZCenter(this.team)) * 0.55;
                    alvoGkX = Match.ball.position.x * 0.65;
                    speedLerp = 4.0;

                    let distToBall = gkCorpo.position.distanceTo(Match.ball.position);
                    if (distToBall < 2.5 && Match.ball.position.y > 1.2 && Match.ball.position.y < 3.2) {
                        this.gkEstado = 'salto_alto';
                        this.gkTempoMergulho = 0;
                    }
                } 
                else if (!isAttacking) {
                    if (bolaNaArea) {
                        let distToBall = gkCorpo.position.distanceTo(Match.ball.position);
                        let carrier = Match.ballCarrier;
                        let looseBallInBox = (!carrier && Match.ballVel.lengthSq() < 150);

                        if (looseBallInBox || (distToBall < 3.2 && !carrier)) {
                            alvoGkX = Match.ball.position.x;
                            alvoGkZ = Match.ball.position.z;
                            speedLerp = 6.0;

                            // Perto o suficiente: pára de deslizar e agacha para apanhar,
                            // em vez de agarrar instantaneamente a meio da corrida.
                            if (distToBall < 1.2) {
                                this.gkEstado = 'apanhar';
                                this.gkTempoMergulho = 0;
                            }
                        } else {
                            let tempoAteMim = Match.ballVel.lengthSq() > 0 ? (gkCorpo.position.distanceTo(Match.ball.position) / Match.ballVel.length()) : 999;
                            let possoEspalmar = (tempoAteMim < 0.6 && window.bolaChutada);

                            if (possoEspalmar) {
                                // Mesma regra do remate: bola perto do corpo é
                                // defesa de pé com as mãos, não mergulho.
                                const lateralEsp = Match.ball.position.x - gkCorpo.position.x;
                                this.gkTempoMergulho = 0;
                                this.gkAlvoX = Match.ball.position.x;
                                if (Math.abs(lateralEsp) < GoalkeeperPose.mergulhoLateralMin) {
                                    this.gkEstado = 'maos';
                                } else {
                                    this.gkEstado = 'mergulho';
                                    this.dive = null;
                                    this.gkDirMergulho = Math.sign(lateralEsp);
                                    this.gkAlvoY = Match.ball.position.y;
                                    this.gkTipoMergulho = Match.ball.position.y > 1.2 ? 'alto' : 'baixo';
                                }
                            } else {
                                /*
                                Um só alvo, venha o portador de onde vier. Antes
                                havia dois ramos, com coeficientes 0.55 e 0.35: o
                                mais adiantado era o do atacante MAIS perto.

                                Varre só quando updateGkStyle() (team_bt.js) diz
                                que não há defensor entre o portador e a baliza —
                                é isso, e só isso, que o estilo offensive
                                significa. Fora daí, recua como sempre.
                                */
                                const varrer = (this.gkStyle === 'offensive' && carrier &&
                                    carrier.team !== this.team);
                                const alvo = varrer
                                    ? gkSweepTarget(Match.ball.position.x, Match.ball.position.z,
                                        this.ownGoalZ, this.dirZ, gkStyleAtual)
                                    : ancora;
                                alvoGkX = alvo.x;
                                alvoGkZ = alvo.z;
                                speedLerp = varrer ? 5.0 : 3.5;
                            }
                        }
                    } else {
                        alvoGkX = ancora.x;
                        alvoGkZ = ancora.z;
                        speedLerp = 2.2;
                    }
                } 
                else {
                    let carrier = Match.ballCarrier;
                    let souOpcao = false;
                    if (carrier && carrier.model.position.z * this.dirZ < -5.0) {
                        _line1.set(gkCorpo.position, carrier.model.position);
                        let opponents = (this.team === 'TeamA') ? Match.opponents : Match.players;
                        let pathClear = true;
                        for (let i = 0; i < opponents.length; i++) {
                            let opp = opponents[i];
                            if (opp.role === 'gk') continue;
                            _line1.closestPointToPoint(opp.model.position, true, _v1);
                            if (_v1.distanceTo(opp.model.position) < 2.5) {
                                pathClear = false;
                                break;
                            }
                        }
                        if (pathClear) souOpcao = true;
                    }

                    if (souOpcao) {
                        alvoGkZ = ownGoalZCenter(this.team) + 8.5 * this.dirZ;
                        alvoGkX = carrier.model.position.x * 0.5 + (this.id % 2 === 0 ? 3.5 : -3.5);
                    } else {
                        alvoGkZ = ownGoalZCenter(this.team) + 4.0 * this.dirZ;
                        alvoGkX = Match.ball.position.x * 0.25;
                    }
                }
            }

            if (this.dynamicTarget) {
                this.dynamicTarget.set(alvoGkX, ALTURA_BASE_Y, alvoGkZ);
            }
            
            /*
            Passo limitado a speedLerp m/s, não lerp exponencial puro. O lerp
            velho (`lerp(pos, alvo, speedLerp*dt)`) anda uma FRACÇÃO da
            distância restante por frame — se o alvo salta longe de repente
            (bola entra na área rápido), isso cobre 6-7m em poucos frames,
            um "deslize" a dezenas de m/s. Isto trava a velocidade real.
            */
            /*
            Agilidade a sair da baliza: um multiplicador só, aplicado aqui, em
            cima do speedLerp que cada situação escolheu. Escala com o atributo
            GK — ver GoalkeeperPose.agilidade/agilidadeSkill.
            */
            const G_AG = GoalkeeperPose.agilidade || 1.0;
            const G_AGS = (typeof GoalkeeperPose.agilidadeSkill === 'number')
                ? GoalkeeperPose.agilidadeSkill : 0;
            speedLerp *= G_AG * (1 + ((gkSkill - 50) / 50) * G_AGS);

            const dxGk = alvoGkX - gkCorpo.position.x;
            const dzGk = alvoGkZ - gkCorpo.position.z;
            const distGk = Math.hypot(dxGk, dzGk);
            const maxStepGk = speedLerp * dt;
            let stepX, stepZ;
            if (distGk > maxStepGk && distGk > 0.0001) {
                stepX = (dxGk / distGk) * maxStepGk;
                stepZ = (dzGk / distGk) * maxStepGk;
            } else {
                stepX = dxGk; stepZ = dzGk;
            }
            gkCorpo.position.x += stepX;
            gkCorpo.position.z += stepZ;

            // Velocidade planar REAL (pós-limite), não a distância bruta ao
            // alvo — senão a animação tentava acompanhar o salto impossível.
            let velX = dt > 0.0001 ? stepX / dt : 0;
            let velZ = dt > 0.0001 ? stepZ / dt : 0;
            let lookPos = Match.ball.position.clone(); lookPos.y = gkCorpo.position.y; lookAtBola(gkCorpo, lookPos);

            gkRig.pelvis.rotation.x = lerpTo(gkRig.pelvis.rotation.x, 0, 0.25);
            gkRig.pelvis.rotation.y = lerpTo(gkRig.pelvis.rotation.y, 0, 0.25);
            gkRig.pelvis.rotation.z = lerpTo(gkRig.pelvis.rotation.z, 0, 0.25);

            /*
            Postura: anda normalmente quando se desloca, e só se agacha (pouco)
            quando há mesmo um adversário com bola perto da área. Ver
            GoalkeeperPose em config.js para os valores.
            */
            const velPlanar = Math.hypot(velX, velZ);
            const andando = velPlanar > 0.5;
            const portador = Match.ballCarrier;
            const distBolaBaliza = Math.abs(Match.ball.position.z - this.ownGoalZ);
            const emAlerta = (window.bolaChutada && !this.gkReagiu) ||
                (portador && portador.team !== this.team && distBolaBaliza < GoalkeeperPose.alertaDist);

            if (andando) {
                const P = GoalkeeperPose.andar;

                // Mesma convenção de ciclo do jogador de campo, com passada curta.
                this.animTimer += (velPlanar * dt) / 3.0;
                const t = ((this.animTimer % 1.0) + 1.0) % 1.0;
                const pose = getRunPose(t);
                const e = P.passada;

                gkRig.lLeg.rotation.x = lerpTo(gkRig.lLeg.rotation.x, pose.lHip * e, 0.4);
                gkRig.rLeg.rotation.x = lerpTo(gkRig.rLeg.rotation.x, pose.rHip * e, 0.4);
                gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, P.kneeBase + pose.lKnee * P.passadaJoelho, 0.4);
                gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, P.kneeBase + pose.rKnee * P.passadaJoelho, 0.4);
                gkRig.lLeg.rotation.z = lerpTo(gkRig.lLeg.rotation.z, 0, 0.3);
                gkRig.rLeg.rotation.z = lerpTo(gkRig.rLeg.rotation.z, 0, 0.3);

                gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, pose.lArm * 0.5, 0.3);
                gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, pose.rArm * 0.5, 0.3);
                gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, P.bracos, 0.2);
                gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -P.bracos, 0.2);
                gkRig.lElbow.rotation.x = lerpTo(gkRig.lElbow.rotation.x, -0.5, 0.2);
                gkRig.rElbow.rotation.x = lerpTo(gkRig.rElbow.rotation.x, -0.5, 0.2);

                gkRig.chest.rotation.x = lerpTo(gkRig.chest.rotation.x, P.chest, 0.2);
                // Ligeiro balanço vertical da passada.
                const balanco = Math.sin(t * Math.PI * 4) * 0.04;
                gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + P.altura + balanco, 0.2);
            } else {
                const P = emAlerta ? GoalkeeperPose.espera : GoalkeeperPose.repouso;

                gkRig.lLeg.rotation.x = lerpTo(gkRig.lLeg.rotation.x, P.coxa, 0.2);
                gkRig.rLeg.rotation.x = lerpTo(gkRig.rLeg.rotation.x, P.coxa, 0.2);
                gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, P.joelho, 0.2);
                gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, P.joelho, 0.2);
                gkRig.lLeg.rotation.z = lerpTo(gkRig.lLeg.rotation.z, P.abertura, 0.2);
                gkRig.rLeg.rotation.z = lerpTo(gkRig.rLeg.rotation.z, -P.abertura, 0.2);

                gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, P.bracoZ, 0.2);
                gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -P.bracoZ, 0.2);
                gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, P.bracoX, 0.2);
                gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, P.bracoX, 0.2);
                gkRig.lElbow.rotation.x = lerpTo(gkRig.lElbow.rotation.x, P.cotovelo, 0.2);
                gkRig.rElbow.rotation.x = lerpTo(gkRig.rElbow.rotation.x, P.cotovelo, 0.2);

                gkRig.chest.rotation.x = lerpTo(gkRig.chest.rotation.x, P.chest, 0.2);
                gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + P.altura, 0.2);
            }

            if (this.hasBall) {
                this.runBehaviorTree(dt);
                this.fsm.update(dt);
            }
        } else if (this.gkEstado === 'mergulho') {
            /*
            O mergulho inteiro vive em js/gk_dive.js: fases, centro de massa
            balistico, rotacao de eixo unico por quaterniao e bracos por IK.

            O que estava aqui era um deslize lateral (position.x += v*dt) com
            a rotacao composta em Euler na pelvis, e o teste da defesa a
            estimar por trigonometria onde a mao estaria. Ver o cabecalho do
            gk_dive.js para o porque de cada uma das tres substituicoes.
            */
            if (!this.dive) {
                GkDive.iniciar(this, this.gkAlvoX, this.gkAlvoY || 1.0,
                    this.gkTipoMergulho, this.gkDirMergulho);
            }
            GkDive.update(this, dt, gkCorpo, gkRig);
        } else if (this.gkEstado === 'tiro_meta_espera') {
            /*
            Espera parada antes do tiro de meta (ESPERA_APOS_REPOSICAO). Fica
            no ponto de arranque, de pé e virado para a bola.

            O resetBonesToDefault é o essencial aqui: quem provocou o tiro de
            meta foi quase sempre uma defesa, e sem isto o guarda-redes passava
            estes segundos congelado na pose do mergulho.
            */
            this.resetBonesToDefault();
            _v1.set(Match.ball.position.x, gkCorpo.position.y, Match.ball.position.z);
            lookAtBola(gkCorpo, _v1);
        } else if (this.gkEstado === 'tiro_meta') {
            /*
            Tiro de meta em duas fases:
                fase 0  posiciona-se atrás e à esquerda da bola para a corrida
                fase 1  corre para a bola (Figura 1) e planta o pé de apoio (Figura 2)
            */
            this.gkTempoMergulho += dt;
            const tTM = this.gkTempoMergulho;
            const bolaTM = Match.ball.position;
            const G = GoalkeeperPose;

            // Posição exata de apoio do pé esquerdo ao lado da bola:
            // ~0.32m à esquerda do alinhamento da bola e ~0.10m atrás da bola
            const plantX = bolaTM.x + this.dirZ * 0.32;
            const plantZ = bolaTM.z - this.dirZ * 0.10;

            let alvoTMx, alvoTMz, velTM;
            if (this.gkTiroFase === 0) {
                const recuo = G.tiroMetaRecuo || 3.8;
                alvoTMx = this.gkTiroAlvo ? this.gkTiroAlvo.x : (bolaTM.x + this.dirZ * 0.70);
                alvoTMz = this.gkTiroAlvo ? this.gkTiroAlvo.z : (bolaTM.z - this.dirZ * recuo);
                velTM = G.tiroMetaAndar;
            } else {
                // Corre diretamente para a posição de apoio ao lado da bola
                alvoTMx = plantX;
                alvoTMz = plantZ;
                velTM = G.tiroMetaCorrer || 5.2;
            }

            const dxTM = alvoTMx - gkCorpo.position.x;
            const dzTM = alvoTMz - gkCorpo.position.z;
            const distTM = Math.hypot(dxTM, dzTM);
            const passoTM = velTM * dt;
            let sxTM = 0, szTM = 0;
            if (distTM > passoTM && distTM > 0.0001) {
                sxTM = (dxTM / distTM) * passoTM;
                szTM = (dzTM / distTM) * passoTM;
            } else {
                sxTM = dxTM; szTM = dzTM;
            }
            gkCorpo.position.x += sxTM;
            gkCorpo.position.z += szTM;

            // Vira-se para a frente / bola durante a preparação e corrida
            _v1.set(bolaTM.x, gkCorpo.position.y, bolaTM.z);
            lookAtBola(gkCorpo, _v1);

            // Ciclo de passada da corrida de aproximação (Figura 1)
            {
                const P = G.andar;
                const velPlanarTM = dt > 0.0001 ? Math.hypot(sxTM, szTM) / dt : 0;
                const speedScale = (this.gkTiroFase === 0) ? 3.0 : 1.55;
                this.animTimer += (velPlanarTM * dt) / speedScale;
                const tt = ((this.animTimer % 1.0) + 1.0) % 1.0;
                const pose = getRunPose(tt);
                const amp = (this.gkTiroFase === 0) ? P.passada : 1.25;

                gkRig.lLeg.rotation.x = lerpTo(gkRig.lLeg.rotation.x, pose.lHip * amp, 0.45);
                gkRig.rLeg.rotation.x = lerpTo(gkRig.rLeg.rotation.x, pose.rHip * amp, 0.45);
                gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, P.kneeBase + pose.lKnee * amp, 0.45);
                gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, P.kneeBase + pose.rKnee * amp, 0.45);
                gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, pose.lArm * (this.gkTiroFase === 0 ? 0.6 : 1.0), 0.35);
                gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, pose.rArm * (this.gkTiroFase === 0 ? 0.6 : 1.0), 0.35);
                gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, P.bracos, 0.2);
                gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -P.bracos, 0.2);
                gkRig.chest.rotation.x = lerpTo(gkRig.chest.rotation.x, P.chest, 0.2);
                gkRig.chest.rotation.z = lerpTo(gkRig.chest.rotation.z, 0, 0.2);
                gkRig.pelvis.position.set(0, 2.6, 0);
                gkRig.pelvis.rotation.set(0, 0, 0);
                gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y, 0.3);
            }

            if (this.gkTiroFase === 0) {
                // Arranca a corrida após posicionar-se no ponto de recuo
                if (distTM < 0.35 || tTM > 0.6) {
                    this.gkTiroFase = 1;
                    this.gkTempoMergulho = 0;
                }
            } else if (distTM <= Math.max(0.35, passoTM * 1.5) || tTM > G.tiroMetaTimeout) {
                // Chegada ao lado da bola: inicia a animação do chute.
                // O corpo NÃO salta para plantX/plantZ aqui — a fixação do pé
                // de apoio, a pose e a orientação entram por mistura ao longo
                // de GK_GROUND_KICK_BLEND (ver iniciarBlendChuteChao).
                this.iniciarBlendChuteChao(gkCorpo, gkRig, plantX, plantZ);
                this.gkEstado = 'chutando';
                this.gkKickTipo = 'chao';
                this.gkTempoMergulho = 0;
                this.gkKickNorm = 0;
                this.gkKickAction = new ActionState('gkPuntChao', {
                    onContact: () => {
                        this.kickFromGround();
                        if (typeof EventBus !== 'undefined') {
                            EventBus.emit('GOAL_KICK_TAKEN', { team: this.team, gk: this });
                        }
                    }
                });
            }
        } else if (this.gkEstado === 'maos') {
            /*
            Defesa de PÉ: a bola vem a menos de mergulhoLateralMin do corpo, e
            atirar-se ao chão para uma bola que passa ao lado do peito é o que
            deixava o guarda-redes sempre deitado/torcido. Aqui o corpo fica
            direito e só os braços vão à bola, dentro dos limites das juntas
            (JointLimits.clampOmbro).

            Braços simétricos de propósito: `rArm`/`lArm` são o lado ESQUERDO/
            DIREITO do modelo, e o modelo está rodado por lookAt conforme a
            equipa — mapear "braço do lado da bola" a partir do x do mundo dá
            o braço errado para uma das equipas. Abrir os dois na mesma
            amplitude é correcto para ambas, e o ponto de contacto abaixo
            escolhe a mão mais perto da bola.
            */
            this.gkTempoMergulho += dt;
            const tM = this.gkTempoMergulho;
            const gkSkillM = this.skillFor('GK');
            const Pm = GoalkeeperPose.espera;

            // Um passo curto para o lado da bola — não é deslocação, é ajuste.
            if (typeof this.gkAlvoX === 'number') {
                gkCorpo.position.x = lerpTo(gkCorpo.position.x, this.gkAlvoX, 0.12);
            }

            gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + Pm.altura, 0.25);
            gkRig.pelvis.rotation.x = lerpTo(gkRig.pelvis.rotation.x, 0, 0.3);
            gkRig.pelvis.rotation.z = lerpTo(gkRig.pelvis.rotation.z, 0, 0.3);
            gkRig.chest.rotation.x = lerpTo(gkRig.chest.rotation.x, Pm.chest, 0.25);
            gkRig.lLeg.rotation.x = lerpTo(gkRig.lLeg.rotation.x, Pm.coxa, 0.25);
            gkRig.rLeg.rotation.x = lerpTo(gkRig.rLeg.rotation.x, Pm.coxa, 0.25);
            gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, Pm.joelho, 0.25);
            gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, Pm.joelho, 0.25);
            gkRig.lLeg.rotation.z = lerpTo(gkRig.lLeg.rotation.z, Pm.abertura, 0.25);
            gkRig.rLeg.rotation.z = lerpTo(gkRig.rLeg.rotation.z, -Pm.abertura, 0.25);

            const ombroYm = gkCorpo.position.y + 0.35;
            const dyM = Match.ball.position.y - ombroYm;
            const dxM = Match.ball.position.x - gkCorpo.position.x;
            const alcanceM = 0.9;

            // Elevação pela altura da bola, abertura pelo afastamento lateral.
            let elevM = Math.atan2(dyM, 0.8) * 1.2;
            let abreM = 0.20 + Math.min(1.3, Math.abs(dxM) * 0.65);
            const clM = (typeof JointLimits !== 'undefined')
                ? JointLimits.clampOmbro(elevM, 0, abreM)
                : { x: elevM, z: abreM };

            gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, clM.x, 0.4);
            gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, clM.x, 0.4);
            gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, clM.z, 0.4);
            gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -clM.z, 0.4);
            gkRig.lElbow.rotation.x = lerpTo(gkRig.lElbow.rotation.x, -0.25, 0.4);
            gkRig.rElbow.rotation.x = lerpTo(gkRig.rElbow.rotation.x, -0.25, 0.4);

            /*
            Ponto de contacto: as duas mãos, projectadas do ângulo REAL do
            ombro. Vale a que estiver mais perto da bola — assim não é preciso
            saber qual dos braços é o do lado dela.
            */
            const espalhoM = Math.sin(Math.abs(gkRig.lArm.rotation.z)) * alcanceM;
            const maoYm = ombroYm + Math.sin(gkRig.lArm.rotation.x) * alcanceM;
            const dxMaoM = Math.min(
                Math.abs((gkCorpo.position.x + espalhoM) - Match.ball.position.x),
                Math.abs((gkCorpo.position.x - espalhoM) - Match.ball.position.x)
            );
            const distMaoM = Math.hypot(dxMaoM, maoYm - Match.ball.position.y, gkCorpo.position.z - Match.ball.position.z);

            const jaEntrouM = (Match.state !== 'PLAY');
            if (!jaEntrouM && distMaoM < 1.3 && Match.ballVel.lengthSq() > 0) {
                // Bola ao alcance do corpo é defesa mais fácil do que um
                // mergulho esticado: agarra com mais frequência.
                const catchChanceM = 0.55 + (gkSkillM - 50) / 100;
                if (Math.random() < catchChanceM) {
                    this.grabBall();
                } else {
                    Match.ballVel.z *= -0.4; Match.ballVel.x += (Math.random() - 0.5) * 6; Match.ballVel.y += 2;
                }
            }

            if (tM >= GoalkeeperPose.maosDur) {
                this.gkEstado = 'idle';
                this.resetBonesToDefault();
            }
        } else if (this.gkEstado === 'salto_alto') {
            this.gkTempoMergulho += dt; let t = this.gkTempoMergulho;
            let gkSkill = this.skillFor('GK');

            if (t < 0.3) {
                let jumpH = 0.8 + ((gkSkill - 50) / 50) * 0.6;
                gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + jumpH, 0.25);

                /*
                Procedural: braços por cima da cabeça, mas inclinam pro lado
                de onde a bola realmente vem em vez de subir sempre no eixo
                central. Clampado por JointLimits.shoulder.
                */
                const dxBolaSalto = Match.ball.position.x - gkCorpo.position.x;
                const alvoZSalto = JointLimits.clamp('shoulder', 'z', 2.8 + THREE.MathUtils.clamp(dxBolaSalto * 0.05, -0.3, 0.3));
                const alvoXSalto = JointLimits.clamp('shoulder', 'x', -0.5);
                gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, alvoZSalto, 0.3);
                gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -alvoZSalto, 0.3);
                gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, alvoXSalto, 0.3);
                gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, alvoXSalto, 0.3);
                gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, 1.2, 0.3);
                gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, 1.2, 0.3);
            } else if (t < 0.6) {
                gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, 0.6, 0.2);
                gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, 0.6, 0.2);
            } else if (t < 1.2) {
                gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y, 0.2);
                gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, 0.5, 0.15);
                gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -0.5, 0.15);
            } else {
                gkCorpo.position.y = ALTURA_BASE_Y;
                this.gkEstado = 'idle';
                this.resetBonesToDefault();
            }

            // Mesma correcção do mergulho: projecta a mão a partir do ângulo
            // REAL do braço (procedural acima), não um offset fixo.
            const alcanceSalto = 0.95;
            const maoSaltoX = gkCorpo.position.x + Math.sin(gkRig.rArm.rotation.z) * alcanceSalto;
            const maoSaltoY = gkCorpo.position.y + 0.35 + Math.cos(gkRig.rArm.rotation.x) * alcanceSalto;
            const distMaoSalto = Math.hypot(maoSaltoX - Match.ball.position.x, maoSaltoY - Match.ball.position.y, gkCorpo.position.z - Match.ball.position.z);
            const jaEntrouSalto = (Match.state !== 'PLAY');
            if (!jaEntrouSalto && t < 0.7 && distMaoSalto < 1.4 && Match.ballVel.lengthSq() > 0) {
                let catchChance = 0.4 + (gkSkill - 50) / 80;
                if (Math.random() < catchChance) {
                    this.grabBall();
                } else {
                    Match.ballVel.z *= -0.4; Match.ballVel.x += (Math.random() - 0.5) * 8; Match.ballVel.y += 2;
                }
            }
        } else if (this.gkEstado === 'apanhar') {
            // Bola mansa/rolando: pára, agacha e apanha — sem deslizar.
            this.gkTempoMergulho += dt;
            const t = this.gkTempoMergulho;
            const P = GoalkeeperPose.apanhar;
            const k = Math.min(1, t / GoalkeeperPose.apanharDur);

            gkRig.lLeg.rotation.x = lerpTo(gkRig.lLeg.rotation.x, P.coxa, 0.5);
            gkRig.rLeg.rotation.x = lerpTo(gkRig.rLeg.rotation.x, P.coxa, 0.5);
            gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, P.joelho, 0.5);
            gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, P.joelho, 0.5);
            gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, P.bracoX, 0.5);
            gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, P.bracoX, 0.5);
            gkRig.lElbow.rotation.x = lerpTo(gkRig.lElbow.rotation.x, P.cotovelo, 0.5);
            gkRig.rElbow.rotation.x = lerpTo(gkRig.rElbow.rotation.x, P.cotovelo, 0.5);
            gkRig.chest.rotation.x = lerpTo(gkRig.chest.rotation.x, P.chest, 0.5);
            gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + P.altura, 0.5);

            // Segue a bola devagar enquanto se agacha, sem voltar a acelerar.
            gkCorpo.position.x = lerpTo(gkCorpo.position.x, Match.ball.position.x, 0.15);
            gkCorpo.position.z = lerpTo(gkCorpo.position.z, Match.ball.position.z, 0.15);

            // Vira-se para a bola enquanto se aproxima — sem isto ficava com a
            // rotação de onde quer que viesse a correr, de lado ou de costas.
            {
                let lookPos = Match.ball.position.clone(); lookPos.y = gkCorpo.position.y;
                lookAtBola(gkCorpo, lookPos);
            }

            if (k >= 1) {
                this.grabBall();
            }
        } else if (this.gkEstado === 'segurando') {
            // Bola já agarrada: segura junto ao peito enquanto as equipas se
            // reorganizam, antes de poder relançar (mão ou pontapé).
            this.gkTempoMergulho += dt;
            const t = this.gkTempoMergulho;
            /*
            Pose única: `segurar` já É a pose de repouso (de pé, direito,
            pernas descontraídas) com os braços dobrados a fechar a bola no
            peito. Não há fase agachada nenhuma — antes passava os primeiros
            0.4s na pose de 'apanhar', o que desfazia o snap feito em
            grabBall() e voltava a agachá-lo logo depois de agarrar.

            Também se aplicam aqui a abertura das pernas e o bracoZ: sem eles,
            qualquer pose anterior (mergulho de lado, com os braços abertos em
            z) ficava por corrigir e só o snap inicial a tapava.
            */
            const P = GoalkeeperPose.segurar;

            gkRig.lLeg.rotation.x = lerpTo(gkRig.lLeg.rotation.x, P.coxa, 0.25);
            gkRig.rLeg.rotation.x = lerpTo(gkRig.rLeg.rotation.x, P.coxa, 0.25);
            gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, P.joelho, 0.25);
            gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, P.joelho, 0.25);
            gkRig.lLeg.rotation.z = lerpTo(gkRig.lLeg.rotation.z, P.abertura, 0.25);
            gkRig.rLeg.rotation.z = lerpTo(gkRig.rLeg.rotation.z, -P.abertura, 0.25);
            gkRig.lArm.rotation.x = lerpTo(gkRig.lArm.rotation.x, P.bracoX, 0.25);
            gkRig.rArm.rotation.x = lerpTo(gkRig.rArm.rotation.x, P.bracoX, 0.25);
            gkRig.lArm.rotation.z = lerpTo(gkRig.lArm.rotation.z, P.bracoZ, 0.25);
            gkRig.rArm.rotation.z = lerpTo(gkRig.rArm.rotation.z, -P.bracoZ, 0.25);
            gkRig.lElbow.rotation.x = lerpTo(gkRig.lElbow.rotation.x, P.cotovelo, 0.25);
            gkRig.rElbow.rotation.x = lerpTo(gkRig.rElbow.rotation.x, P.cotovelo, 0.25);
            gkRig.chest.rotation.x = lerpTo(gkRig.chest.rotation.x, P.chest, 0.25);
            gkCorpo.position.y = lerpTo(gkCorpo.position.y, ALTURA_BASE_Y + P.altura, 0.25);

            /*
            Entra nesta fase com a rotação de onde quer que estivesse a
            defesa (mergulho de lado, apanhada de costas) — ninguém a
            corrigia durante os 8s de espera, e ficava de costas pro campo.
            Vira já de frente, sempre — usa lookAtBola (o mesmo `.lookAt()`
            usado em todo o resto do jogo para orientar jogadores; um
            `rotation.y = 0/PI` calculado à mão aqui dava exactamente o
            oposto do esperado).
            */
            _v1.set(gkCorpo.position.x, gkCorpo.position.y, gkCorpo.position.z + this.dirZ * 10);
            lookAtBola(gkCorpo, _v1);

            /*
            ANDAR COM A BOLA NA MÃO. Ficava completamente imóvel os 5 a 8
            segundos todos: nem a FSM corre neste estado (só é chamada no ramo
            'idle'), nem a velocidade sobrevive ao reset no fim do updateGK.

            Anda para o alvo de gkAlvoSegurando (config.js) a segurarVel, com
            passo limitado — mesmo tratamento do ramo 'idle', para não deslizar
            quando o alvo salta. Não sai da grande área: com a bola na mão,
            fora dela é falta.
            */
            const alvoSeg = gkAlvoSegurando(this.ownGoalZ, this.dirZ);
            const dxSeg = alvoSeg.x - gkCorpo.position.x;
            const dzSeg = alvoSeg.z - gkCorpo.position.z;
            const distSeg = Math.hypot(dxSeg, dzSeg);
            const passoSeg = GoalkeeperPose.segurarVel * dt;

            let andouSeg = 0;
            if (distSeg > 0.15) {
                const k = Math.min(1, passoSeg / distSeg);
                gkCorpo.position.x += dxSeg * k;
                gkCorpo.position.z += dzSeg * k;
                andouSeg = distSeg * k;
            }

            // Pernas a acompanhar. Os braços ficam na pose de segurar, acima:
            // a bola continua fechada no peito enquanto ele anda.
            if (andouSeg > 0.001) {
                const Pa = GoalkeeperPose.andar;
                this.animTimer += andouSeg / 3.0;
                const tt = ((this.animTimer % 1.0) + 1.0) % 1.0;
                const poseSeg = getRunPose(tt);
                gkRig.lLeg.rotation.x = lerpTo(gkRig.lLeg.rotation.x, poseSeg.lHip * Pa.passada, 0.4);
                gkRig.rLeg.rotation.x = lerpTo(gkRig.rLeg.rotation.x, poseSeg.rHip * Pa.passada, 0.4);
                gkRig.lKnee.rotation.x = lerpTo(gkRig.lKnee.rotation.x, Pa.kneeBase + poseSeg.lKnee * Pa.passadaJoelho, 0.4);
                gkRig.rKnee.rotation.x = lerpTo(gkRig.rKnee.rotation.x, Pa.kneeBase + poseSeg.rKnee * Pa.passadaJoelho, 0.4);
            }

            /*
            Relançar mais cedo, se já houver linha. `gkPodeLancar` guarda a
            folga de segurarMinimo para as equipas saírem da área; sem alvo, o
            relançamento sai na mesma ao fim de segurarDur, logo a seguir.

            O findPassTarget aqui é só o GATILHO — "já há a quem jogar". Quem
            escolhe mesmo o destinatário é o releaseFromHands, no instante do
            contacto, e é ele que respeita o Playing Style da equipa.

            Corre a cada 0.25 s e não a cada frame: percorre todos os
            companheiros e todas as linhas de passe, e nada disto muda de
            frame para frame.
            */
            this.gkProcuraTimer = (this.gkProcuraTimer || 0) + dt;
            if (t >= GoalkeeperPose.segurarMinimo && this.gkProcuraTimer >= 0.25) {
                this.gkProcuraTimer = 0;
                this.gkTemLinha = !!this.findPassTarget();
            }
            const lancarCedo = gkPodeLancar(t, this.gkTemLinha);

            if (lancarCedo || t >= (this.gkSegurarDur ?? GoalkeeperPose.segurarDur)) {
                this.gkEstado = 'chutando';
                this.gkTempoMergulho = 0;
                this.gkKickNorm = 0;
                this.gkKickAction = new ActionState('gkPunt', {
                    onContact: () => {
                        this.puntBall();
                    }
                });
            }
        } else if (this.gkEstado === 'chutando' || this.gkEstado === 'lancando') {
            const isThrow = (this.gkEstado === 'lancando');
            const isGroundKick = (!isThrow && this.gkKickTipo === 'chao');
            const normK = this.gkKickAction ? this.gkKickAction.update(dt, this) : 1;
            this.gkKickNorm = normK;

            if (isThrow) {
                const K = amostrarClipLancamentoGR(normK);
                gkRig.chest.rotation.x = K.chest;
                gkRig.chest.rotation.z = 0;
                gkRig.pelvis.rotation.x = 0;
                gkRig.pelvis.rotation.z = 0;

                gkRig.lLeg.rotation.x = K.coxaL;
                gkRig.lKnee.rotation.x = K.joelhoL;
                gkRig.rLeg.rotation.x = K.coxaR;
                gkRig.rKnee.rotation.x = K.joelhoR;

                gkRig.lArm.rotation.x = K.bracoLx;
                gkRig.lArm.rotation.z = K.bracoLz;
                gkRig.rArm.rotation.x = K.bracoRx;
                gkRig.rArm.rotation.z = K.bracoRz;

                gkRig.lElbow.rotation.x = K.cotoveloL;
                gkRig.rElbow.rotation.x = K.cotoveloR;

                gkCorpo.position.y = ALTURA_BASE_Y + K.altura;
            } else if (isGroundKick) {
                // TIRO DE META / BOLA PARADA DO CHÃO (12 frames com pivô no pé de apoio)
                const K = amostrarClipChuteChaoGR(normK);
                const chuteR = (GoalkeeperGroundKickClip.pernaChute === 'r');
                const pernaC = chuteR ? gkRig.rLeg : gkRig.lLeg;
                const joelhoC = chuteR ? gkRig.rKnee : gkRig.lKnee;
                const pernaA = chuteR ? gkRig.lLeg : gkRig.rLeg;
                const joelhoA = chuteR ? gkRig.lKnee : gkRig.rKnee;

                // PIVÔ NO PÉ DE APOIO:
                // O pé de apoio (esquerdo) localiza-se em x = +0.4 (espaço local da pelvis).
                // A inclinação lateral (leanZ) roda o corpo inteiro em bloco como uma unidade rígida
                // em torno do pé esquerdo cravado na relva, sem quebrar a cintura ou dobrar a coluna de lado.
                const pivotX = chuteR ? 0.4 : -0.4;
                const leanZ = K.leanZ;
                const cosL = Math.cos(leanZ);
                const sinL = Math.sin(leanZ);

                /*
                MISTURA DE ENTRADA (corrida -> chute).
                Durante os primeiros GK_GROUND_KICK_BLEND segundos, cada canal
                sai da pose com que a corrida acabou e vai até ao valor do clip.
                O peso usa smoothstep para não haver descontinuidade de
                velocidade em nenhum dos extremos.
                */
                const B = this.gkKickBlend;
                if (B) {
                    B.t += dt;
                    const u = Math.min(1, B.t / B.dur);
                    B.w = u * u * (3 - 2 * u);
                    if (u >= 1) this.gkKickBlend = null;
                }
                const wB = B ? B.w : 1;
                const P0 = B ? B.pose : null;
                const bl = (de, para) => (P0 ? de + (para - de) * wB : para);

                /*
                O pé de apoio também não teleporta para o lado da bola: o corpo
                desliza da posição de chegada da corrida até plantX/plantZ ao
                mesmo ritmo da mistura da pose.
                */
                if (B) {
                    gkCorpo.position.x = B.origemX + (B.plantX - B.origemX) * wB;
                    gkCorpo.position.z = B.origemZ + (B.plantZ - B.origemZ) * wB;
                }

                // Translação compensatória para ancorar o pé de apoio no solo:
                gkRig.pelvis.position.x = bl(P0 ? P0.pelvisPx : 0, pivotX * (1 - cosL) - 2.6 * sinL);
                gkRig.pelvis.position.y = bl(P0 ? P0.pelvisPy : 2.6, 2.6 * cosL - pivotX * sinL);
                gkRig.pelvis.position.z = 0;

                // Rotação da bacia em bloco (inclinação lateral leanZ e anteroposterior pitchX):
                gkRig.pelvis.rotation.z = bl(P0 ? P0.pelvisRz : 0, leanZ);
                gkRig.pelvis.rotation.x = bl(P0 ? P0.pelvisRx : 0, K.pitchX || 0);
                gkRig.pelvis.rotation.y = 0;

                // O tronco (chest) mantém-se alinhado com a bacia no eixo Z (sem dobrar de lado!):
                gkRig.chest.rotation.x = bl(P0 ? P0.chest : 0, K.chest);
                gkRig.chest.rotation.y = 0;
                gkRig.chest.rotation.z = 0;

                // Perna de apoio: desce alinhada com a bacia diretamente para o pé no solo
                pernaA.rotation.x = bl(P0 ? P0.coxaA : 0, K.coxaApoio);
                pernaA.rotation.y = 0;
                pernaA.rotation.z = 0;
                joelhoA.rotation.x = bl(P0 ? P0.joelhoA : 0, K.joelhoApoio);
                joelhoA.rotation.y = 0;
                joelhoA.rotation.z = 0;

                // Perna de chute: articulação de remate em relação à bacia inclinada
                pernaC.rotation.x = bl(P0 ? P0.coxaC : 0, K.coxaChute);
                pernaC.rotation.y = 0;
                pernaC.rotation.z = bl(P0 ? P0.coxaCz : 0, K.coxaChuteZ || 0);
                joelhoC.rotation.x = bl(P0 ? P0.joelhoC : 0, K.joelhoChute);
                joelhoC.rotation.y = 0;
                joelhoC.rotation.z = 0;

                // Membros superiores e equilíbrio
                gkRig.lArm.rotation.x = bl(P0 ? P0.bracoLx : 0, K.bracoLx);
                gkRig.lArm.rotation.z = bl(P0 ? P0.bracoLz : 0, K.bracoLz);
                gkRig.rArm.rotation.x = bl(P0 ? P0.bracoRx : 0, K.bracoRx);
                gkRig.rArm.rotation.z = bl(P0 ? P0.bracoRz : 0, K.bracoRz);

                gkRig.lElbow.rotation.x = bl(P0 ? P0.cotoveloL : 0, K.cotoveloL);
                gkRig.rElbow.rotation.x = bl(P0 ? P0.cotoveloR : 0, K.cotoveloR);

                // Elevação vertical na finalização (Follow-through subindo na ponta do pé)
                gkCorpo.position.y = bl(P0 ? P0.corpoY : ALTURA_BASE_Y, ALTURA_BASE_Y + K.altura);
            } else {
                // CHUTÃO DAS MÃOS (Punt em jogo corrido)
                const K = amostrarClipChuteGR(normK);
                const chuteR = (GoalkeeperKickClip.pernaChute === 'r');
                const pernaC = chuteR ? gkRig.rLeg : gkRig.lLeg;
                const joelhoC = chuteR ? gkRig.rKnee : gkRig.lKnee;
                const pernaA = chuteR ? gkRig.lLeg : gkRig.rLeg;
                const joelhoA = chuteR ? gkRig.lKnee : gkRig.rKnee;

                pernaC.rotation.x = K.coxaChute;
                pernaC.rotation.y = 0;
                pernaC.rotation.z = 0;
                joelhoC.rotation.x = K.joelhoChute;
                joelhoC.rotation.y = 0;
                joelhoC.rotation.z = 0;

                pernaA.rotation.x = K.coxaApoio;
                pernaA.rotation.y = 0;
                pernaA.rotation.z = 0;
                joelhoA.rotation.x = K.joelhoApoio;
                joelhoA.rotation.y = 0;
                joelhoA.rotation.z = 0;

                gkRig.chest.rotation.x = K.chest;
                gkRig.chest.rotation.y = 0;
                gkRig.chest.rotation.z = 0;

                gkRig.pelvis.rotation.x = 0;
                gkRig.pelvis.rotation.y = 0;
                gkRig.pelvis.rotation.z = 0;

                gkRig.lArm.rotation.x = K.bracoX;
                gkRig.rArm.rotation.x = K.bracoX;
                gkRig.lElbow.rotation.x = K.cotovelo;
                gkRig.rElbow.rotation.x = K.cotovelo;

                const abreBraco = 0.05 + 0.45 * normK;
                gkRig.lArm.rotation.z = abreBraco;
                gkRig.rArm.rotation.z = -abreBraco;

                gkCorpo.position.y = ALTURA_BASE_Y + K.altura;
            }

            // Continua virado para o campo durante todo o gesto
            _v1.set(gkCorpo.position.x, gkCorpo.position.y, gkCorpo.position.z + this.dirZ * 10);
            lookAtBola(gkCorpo, _v1);

            /*
            Na entrada do chute do chão a orientação também não muda de golpe:
            a corrida acaba virada para a BOLA, o gesto quer o corpo virado
            campo adentro. Slerp entre as duas com o mesmo peso da pose.
            */
            if (isGroundKick && this.gkKickBlend) {
                const BQ = this.gkKickBlend;
                if (!BQ.quatAlvo) BQ.quatAlvo = gkCorpo.quaternion.clone();
                else BQ.quatAlvo.copy(gkCorpo.quaternion);
                gkCorpo.quaternion.copy(BQ.quatOrigem).slerp(BQ.quatAlvo, BQ.w);
            }

            if (!this.gkKickAction || this.gkKickAction.isDone()) {
                this.gkKickAction = null;
                this.gkKickBlend = null;
                this.gkEstado = 'idle';
                this.resetBonesToDefault();
            }
        }
        if (dt > 0.0001 && this.gkEstado === 'idle') {
            this.velocity.set(gkCorpo.position.x - prevX, 0, gkCorpo.position.z - prevZ).multiplyScalar(1 / dt);
        } else if (this.gkEstado !== 'idle') {
            this.velocity.set(0, 0, 0);
        }
    }

    /*
    Chamado quando o GR agarra a bola (defesa mansa, mergulho ou salto alto).
    Não larga logo para o BT/FSM decidir — entra em 'segurando' para as
    equipas terem tempo de se reorganizar antes do relançamento.
    */
    grabBall(manterPose) {
        Match.ballVel.set(0, 0, 0);
        this.hasBall = true;
        Match.ballCarrier = this;
        Match.possessionTeam = this.team;
        Match.possessionTimer = 0;
        window.bolaChutada = false;
        /*
        `manterPose`: agarrou a meio de um mergulho. A posse conta já, mas o
        estado e a orientação ficam quietos — quem manda no corpo até ele se
        levantar é o GkDive, que passa a 'segurando' no fim. Sem isto o
        mergulho era interrompido a meio do voo e ele aparecia de pé.
        */
        if (!manterPose) {
            this.gkEstado = 'segurando';
            this.gkTempoMergulho = 0;
        }
        // Não precisa esperar sempre os 8s fixos — 5-8s, sorteado a cada captura.
        this.gkSegurarDur = 5.0 + Math.random() * 3.0;
        // Procura de linha de passe enquanto segura — ver o ramo 'segurando'.
        this.gkProcuraTimer = 0;
        this.gkTemLinha = false;
        /*
        Sem isto, um companheiro já marcado como intendedReceiver de um
        passe/desvio anterior continuava a correr direito pra
        Match.ball.position (agora nas mãos do GR) via Receber — passa por
        cima de tudo, incluindo o afastamento do commit().
        */
        Match.intendedReceiver = null;
        Match.passTargetPos = null;
        /*
        Vira já de frente pro campo (mesmo lookAtBola usado no resto do
        jogo — um rotation.y=0/PI calculado à mão dava de costas).
        */
        if (!manterPose) {
            _v1.set(this.model.position.x, this.model.position.y, this.model.position.z + this.dirZ * 10);
            lookAtBola(this.model, _v1);
        }

        /*
        Fecha os braços na hora. Sem isto, um braço que ainda estava na pose
        do mergulho/salto (esticado bem aberto, rotation.z ~1.5-2.8) só
        convergia pra pose de 'segurar' devagar (lerp 0.25-0.5/frame) —
        durante essa transição ficava com um braço erguido/aberto, o outro
        já fechado na bola, uma pose assimétrica de "um braço no ar".
        */
        if (this.rig && !manterPose) {
            const P = GoalkeeperPose.segurar;
            this.rig.lLeg.rotation.x = P.coxa; this.rig.rLeg.rotation.x = P.coxa;
            this.rig.lKnee.rotation.x = P.joelho; this.rig.rKnee.rotation.x = P.joelho;
            this.rig.lLeg.rotation.z = P.abertura; this.rig.rLeg.rotation.z = -P.abertura;
            this.rig.lArm.rotation.z = P.bracoZ; this.rig.rArm.rotation.z = -P.bracoZ;
            this.rig.lArm.rotation.x = P.bracoX; this.rig.rArm.rotation.x = P.bracoX;
            this.rig.lElbow.rotation.x = P.cotovelo; this.rig.rElbow.rotation.x = P.cotovelo;
            this.rig.chest.rotation.x = P.chest;
        }

        if (typeof EventBus !== 'undefined') EventBus.emit('GK_CATCH_BALL', { team: this.team, gk: this });
    }

    /*
    Fim da espera com a bola na mão: chutão para a frente, sempre.

    Antes havia um ramo de passe curto para um colega sem pressão. Saiu a
    pedido do utilizador — o relançamento é agora sempre o chutão do
    puntBall(), com elevação e direcção sorteadas lá dentro.
    */
    chooseReleaseTarget() {
        return null;
    }

    executeRelease(targetPlayer) {
        this.puntBall();
    }

    /*
    Tiro de meta: a bola está no chão, não nas mãos. Mesma balística do
    puntBall — elevação 25-50°, direcção até ±20° da frente — mas sem o
    `hasBall` a limpar, porque ele nunca a chegou a segurar.

    É aqui que o jogo volta a 'PLAY': até ao contacto pé-bola o estado é
    GOAL_KICK e ninguém decide nada.
    */
    kickFromGround() {
        const gGrav = BallPhysics.gravidade;
        // Ângulo ajustado entre 25 e 35 graus
        const anguloGraus = 25 + Math.random() * 10;
        const elev = THREE.MathUtils.degToRad(anguloGraus);
        const desvio = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * 15);

        const alcance = 42 + Math.random() * 18;
        const v = Math.min(45, Math.sqrt((alcance * gGrav) / Math.sin(2 * elev)));
        const horiz = v * Math.cos(elev);

        _v2.set(0, 0, this.dirZ).applyAxisAngle(_vUp, desvio);
        Match.ball.position.y = BallPhysics.raio;
        Match.ballVel.set(_v2.x * horiz, v * Math.sin(elev), _v2.z * horiz);

        this.touchLock = BallControl.touchLock;
        Match.ballCarrier = null;
        Match.intendedReceiver = null;
        Match.passTargetPos = null;
        Match.lastTouchedTeam = this.team;
        Match.lastTouchedPlayer = this;
        window.bolaChutada = false;

        // A jogada recomeça no instante do toque.
        Match.state = 'PLAY';
        Match.setPieceTaker = null;
        this.gkKickTipo = null;

        if (typeof MatchStats !== 'undefined') MatchStats.registarPasseIniciado(this.team, 'lancamento');
    }
}

