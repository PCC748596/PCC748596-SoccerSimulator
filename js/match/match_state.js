/*
QUEM COBRA O LATERAL — ver ThrowInModel.ordemBatedor.

Era o jogador de campo mais PERTO do ponto da linha, e num lateral no proprio
meio-campo isso da quase sempre o CENTRAL: o homem que menos devia estar a por a
bola em jogo fica com ela nas maos e a linha defensiva abre ao meio enquanto ele
la vai.

A ordem e a do futebol — lateral do lado, medio da ala, CM — e o lado sai do
sinal do x da bola, a mesma convencao das formacoes (LB em +x, RB em -x).

Duas saidas de emergencia, ambas deliberadas:
  - candidato da ordem longe de mais (`distanciaMaxBatedor`): passa-se ao
    seguinte, senao o lance ficava parado a espera de quem vem de 45 m;
  - nenhum dos tres em campo (expulsoes, formacoes sem medios de ala): cobra o
    mais perto, como antes. Um batedor imperfeito e melhor do que nenhum.
*/
function escolherBatedorDoLateral(candidatos, bolaPos) {
    const T = ThrowInModel;
    const lado = (bolaPos.x >= 0) ? 'esquerda' : 'direita';
    const ordem = T.ordemBatedor[lado];

    const dist = (p) => Math.hypot(
        p.model.position.x - bolaPos.x, p.model.position.z - bolaPos.z);

    for (const pos of ordem) {
        let melhor = null, melhorD = Infinity;
        for (const p of candidatos) {
            if (!p || p.role === 'gk' || p.pos !== pos) continue;
            const d = dist(p);
            if (d > T.distanciaMaxBatedor) continue;
            if (d < melhorD) { melhorD = d; melhor = p; }
        }
        if (melhor) return melhor;
    }

    let maisPerto = null, minD = Infinity;
    for (const p of candidatos) {
        if (!p || p.role === 'gk') continue;
        const d = dist(p);
        if (d < minD) { minD = d; maisPerto = p; }
    }
    return maisPerto;
}

/*
PRAZO DA SAÍDA DE JOGO.

Quem recebe a primeira bola do pontapé de saída toca para um defesa (o ramo
`PasseSaidaDeBola`, em js/bt/player_bt.js), para se poder ver a construção
desde trás. Isto é o que garante que a intenção não sobrevive à jogada.

A bandeira já se apagava com o toque do adversário e com qualquer bola parada,
mas faltava o caso normal: ninguém achar defesa livre (o
`encontrarDefesaParaSaida` devolve null com a linha toda tapada). Sem prazo, a
bandeira ficava acesa e o toque para trás saía muito depois, no meio de outra
jogada — um passe atrasado sem razão nenhuma, que é pior do que não o ter.

Seis segundos: dá para receber, dominar e tocar sem pressa, e acaba muito antes
de a jogada seguinte começar.
*/
const KICKOFF_PRAZO_PASSE_DEFESA = 6.0;

function correrPrazoDaSaida(M, dt) {
    if (!M.kickoffPendingPassToDef) return;
    M.kickoffPassToDefTimer -= dt;
    if (M.kickoffPassToDefTimer <= 0) {
        M.kickoffPendingPassToDef = false;
        M.kickoffPassToDefTimer = 0;
    }
}


const Match = {
    scene: null, ball: null, ballVisual: null, ballVel: new THREE.Vector3(),
    players: [], opponents: [], ballCarrier: null, intendedReceiver: null, state: 'PLAY',
    // Matadas no peito seguidas sem a bola assentar. Ver maxPeitosSeguidos em
    // config.js: era por aqui que o jogo encravava, com a bola presa no ar
    // entre dois jogadores a matá-la no peito um ao outro.
    peitosSeguidos: 0,
    // Equipa cujo guarda-redes nao pode usar as maos (recuo com o pe de um
    // companheiro). Null e o caso normal. Ver maosProibidasNoRecuo em utils.js.
    recuoParaGR: null,
    tempoParada: 0, delta: 0,
    placarA: 0, placarB: 0, tempoDeJogo: 0,
    chaserA: null, chaserB: null,
    possessionTeam: null, possessionTimer: 0,
    lastTouchedTeam: 'TeamA', lastTouchedPlayer: null,
    setPieceTaker: null, setPieceTimer: 0,
    // Tiro de meta: espera 3-6s depois de todos posicionados (ver
    // updateGoalKickWait / setupSetPiece).
    golKickProntos: false, golKickEspera: 0, golKickAlvoEspera: 0,
    golKickPendente: false, golKickAtrasoInicio: 0,
    lateralPendente: false, lateralAtraso: 0,
    cantoBolaAlvo: null, cantoAguardaChao: false, cantoBolaAtraso: 0,
    /*
    O canto DEPOIS de batido: { equipa, timer }. Enquanto existe, os marcadores
    ficam colados ao seu homem em vez de voltarem ao bloco (ver
    CornerDefenseModel). Limpo no Match.update quando o lance resolve.
    */
    cantoVivo: null,
    faltaPendente: false, faltaAtraso: 0,
    penaltiPendente: false, penaltiAtraso: 0,
    counterAttackTeam: null, counterAttackTimer: 0,
    specMesh: null, specData: [], specDummy: new THREE.Object3D(),
    crowdExcitement: 0, crowdTimer: 0,
    currentLookTarget: null, // Usado para interpolação da câmara
    kickoffActive: false, kickoffTimer: 0, kickoffTaker: null, kickoffApoio: null,
    // Já se apitou esta saída de bola? Ver APITO_ANTES_DA_SAIDA.
    kickoffApitado: false,
    // Segundos com a bola parada e sem dono (ver PerceptionModel.prazoBolaParada).
    tempoBolaParada: 0,
    kickoffTeam: null, kickoffPendingPassToDef: false, kickoffPassToDefTimer: 0,

    // Migração por eventos (ver EventBus) — parte 1: GK. Substitui o polling
    // directo de gk.gkEstado === 'apanhar'/'segurando' espalhado por vários
    // ficheiros (match.js afastarDoGuardaRedes, position_bt.js commit).
    // TeamA/TeamB -> true enquanto o GR dessa equipa está com a bola na mão.
    gkHoldingBall: { TeamA: false, TeamB: false },
};

// Se usarmos window.Match (no browser), ou módulos
if (typeof window !== 'undefined') window.Match = Match;
