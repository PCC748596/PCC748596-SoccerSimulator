function mergeNonIndexedGeometries(geos) {
    let totalVertices = 0;
    geos.forEach(g => {
        totalVertices += g.attributes.position.count;
    });

    const positions = new Float32Array(totalVertices * 3);
    const normals = new Float32Array(totalVertices * 3);

    let vertexOffset = 0;
    geos.forEach(g => {
        const count = g.attributes.position.count;
        positions.set(g.attributes.position.array, vertexOffset * 3);
        normals.set(g.attributes.normal.array, vertexOffset * 3);
        vertexOffset += count;
        g.dispose();
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    return merged;
}

function createSpectatorGeometry() {
    const u = 1.0;
    const pelvis = new THREE.BoxGeometry(u * 1.3, u * 0.6, u * 0.8).toNonIndexed(); pelvis.translate(0, 2.6, 0);
    // Tronco numa peça só, como nos jogadores (ver criarModelo em player.js).
    const chest = new THREE.BoxGeometry(u * 1.4, u * 1.45, u * 0.75).toNonIndexed(); chest.translate(0, 3.625, 0);
    const head = new THREE.BoxGeometry(u * 0.8, u * 1.0, u * 0.85).toNonIndexed(); head.translate(0, 4.975, 0);
    const lArm = new THREE.BoxGeometry(u * 0.45, u * 1.1, u * 0.45).toNonIndexed(); lArm.translate(u * 0.9, 3.65, 0);
    const rArm = new THREE.BoxGeometry(u * 0.45, u * 1.1, u * 0.45).toNonIndexed(); rArm.translate(-u * 0.9, 3.65, 0);
    const legs = new THREE.BoxGeometry(u * 1.3, u * 0.5, u * 1.6).toNonIndexed(); legs.translate(0, 2.1, 0.4);
    const merged = mergeNonIndexedGeometries([pelvis, chest, head, lArm, rArm, legs]);
    merged.scale(1.8 / 5.5, 1.8 / 5.5, 1.8 / 5.5);
    merged.translate(0, -0.65, 0);
    return merged;
}

/*
Mistura os três andamentos conforme a velocidade.

Devolve um objecto com a mesma forma que uma entrada do GaitModel, com os
valores interpolados. Abaixo do `andar` e acima do `correr` não extrapola — o
andamento fica no extremo.
*/
function misturarAndamento(vel) {
    const A = GaitModel.andar, T = GaitModel.trote, C = GaitModel.correr;
    let a, b, k;

    if (vel <= A.vel) { a = A; b = A; k = 0; }
    else if (vel <= T.vel) { a = A; b = T; k = (vel - A.vel) / (T.vel - A.vel); }
    else if (vel <= C.vel) { a = T; b = C; k = (vel - T.vel) / (C.vel - T.vel); }
    else { a = C; b = C; k = 0; }

    const r = {};
    for (const campo in A) r[campo] = lerp(a[campo], b[campo], k);
    return r;
}

/*
Pose de locomoção para um dado ponto do ciclo `t` (0..1) e uma velocidade.

Ao contrário do getRunPose (que ficou para o guarda-redes, que tem andamento
próprio), aqui a AMPLITUDE também depende da velocidade — é isso que faz andar
parecer andar e não correr devagar.

O joelho só dobra na fase de balanço (`max(0, sin)`): a perna de apoio fica
quase direita, que é o que distingue uma passada de uma corrida.
*/
function getGaitPose(t, vel) {
    const g = misturarAndamento(vel);
    const c = t * Math.PI * 2;

    return {
        lHip: Math.sin(c) * g.anca,
        rHip: Math.sin(c + Math.PI) * g.anca,
        lKnee: g.joelhoBase + Math.max(0, Math.sin(c - Math.PI / 2)) * g.joelhoOscila,
        rKnee: g.joelhoBase + Math.max(0, Math.sin(c + Math.PI / 2)) * g.joelhoOscila,
        lFoot: -Math.sin(c) * g.pe,
        rFoot: -Math.sin(c + Math.PI) * g.pe,
        lArm: Math.sin(c + Math.PI) * g.braco,
        rArm: Math.sin(c) * g.braco,
        cotovelo: g.cotovelo,
        tronco: g.tronco,
        // Dois ressaltos por ciclo, um por cada apoio. O termo constante
        // mantém a anca ligeiramente acima do zero, como no código anterior —
        // sem ele os pés afundam no relvado no ponto mais baixo do ciclo.
        ressalto: g.ressalto * (1.0 + Math.sin(c * 2 + Math.PI)) * 0.5,
        passada: g.passada
    };
}

function getRunPose(t) {
    const cycle = t * Math.PI * 2;
    return {
        lHip: Math.sin(cycle) * 1.1,
        rHip: Math.sin(cycle + Math.PI) * 1.1,
        lKnee: Math.max(0, Math.sin(cycle - Math.PI / 2) * 1.5),
        rKnee: Math.max(0, Math.sin(cycle + Math.PI / 2) * 1.5),
        lFoot: 0,
        rFoot: 0,
        lArm: Math.sin(cycle + Math.PI) * 1.0,
        rArm: Math.sin(cycle) * 1.0
    };
}


/*
Sorteio com taxa POR SEGUNDO em vez de por frame.

As decisões aleatórias estavam escritas como `Math.random() < 0.15`, avaliado
uma vez por frame. Isso torna a IA dependente do FPS (a 144 Hz tenta desarmar
2,4x mais vezes por segundo do que a 60 Hz) e faz o botão de velocidade 1.6x
alterar a agressividade das equipas. Multiplicar pelo dt do frame corrige as
duas coisas — e a 60 fps dá exactamente o comportamento antigo.

    taxa = tentativas por segundo
*/
/*
Duelo de skills opostos (Técnica x Marcação, Velocidade x Força, Passe x
Interceptação, Técnica x GK): devolve true se A vence. baseA é a chance de A
com os dois skills EMPATADOS (0.5 = justo, <0.5 favorece B por natureza da
jogada — ex.: um carrinho é arriscado por si só). escala controla quanto a
diferença de skill pesa: com skills 50-100, uma diferença de 50 pontos muda
a chance em ~50/escala.
*/
function venceuDuelo(valorA, valorB, baseA = 0.5, escala = 220) {
    const chance = THREE.MathUtils.clamp(baseA + (valorA - valorB) / escala, 0.08, 0.92);
    return Math.random() < chance;
}

/*
=============================================================================
BALÍSTICA DO PASSE — que velocidade é preciso para a bola CHEGAR ao alvo
=============================================================================
As forças de passe eram heurísticas do tipo `forca = dist * 0.85`, calibradas
contra a física antiga (g = 15, arrasto exponencial só em x/z). Com a física
real (ver BallPhysics) ficaram todas curtas, e cada vez mais curtas quanto
mais longo o passe: medido, um passe de 70 m caía aos 52 m.

Aqui resolve-se o problema ao contrário: dado o ALCANCE pretendido, qual a
velocidade de saída? É a mesma ideia já usada no puntBall do guarda-redes.
=============================================================================
*/

/*
Passe aéreo: velocidade de saída para a bola aterrar a `dist` metros com a
elevação dada.

Não há fórmula fechada com arrasto quadrático — a de manual
(`v = √(R·g / sin 2θ)`) ignora-o e erra por defeito até 20 m num passe de
60 m. Resolve-se por bissecção sobre uma simulação do voo, que é barata
(acontece uma vez por passe, não por frame).
*/
function velocidadeParaAlcance(dist, elev) {
    const g = BallPhysics.gravidade;
    const k = BallPhysics.kArrasto;
    const r = BallPhysics.raio;

    const alcanceDe = (v) => {
        let x = 0, y = r, vx = v * Math.cos(elev), vy = v * Math.sin(elev);
        const dt = 1 / 120;
        for (let i = 0; i < 900; i++) {
            const s = Math.hypot(vx, vy);
            if (s > 0.001) { const dv = k * s * s * dt; vx -= vx / s * dv; vy -= vy / s * dv; }
            if (y > r + 0.001) vy -= g * dt;
            x += vx * dt; y += vy * dt;
            if (y <= r && vy < 0) return x;
        }
        return x;
    };

    // Arranca do valor sem arrasto (sempre curto) e abre o intervalo para cima.
    let lo = Math.sqrt(Math.max(1, dist * g / Math.max(0.2, Math.sin(2 * elev))));
    let hi = lo * 2.2;
    for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (alcanceDe(mid) < dist) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

/*
DISPERSAO ANGULAR DE UM PASSE, em radianos (desvio padrao).

`passSkill` e `tecSkill` sao 0..100. `distAdversario` e a distancia ao
adversario mais proximo de quem passa (Infinity se nao houver nenhum) e
`cosCorpo` e o coseno do angulo entre a frente do jogador e a direccao do
passe (1 virado para o alvo, -1 de costas).

Ver PassErrorModel em config.js.

Pura: sem Match, sem THREE, e sem Math.random — a amostra e sorteada por
quem chama (ver amostraGaussiana).
*/
function sigmaDePasse(o) {
    const M = PassErrorModel;
    const pass = Math.max(0, Math.min(100, o.passSkill || 0));
    const tec = Math.max(0, Math.min(100, o.tecSkill || 0));

    // A TEC conta, mas menos que o PASS: passar e a habilidade principal.
    const skill = (pass * (1 - M.pesoTecnica) + tec * M.pesoTecnica) / 100;
    let sigma = M.sigmaMin + (M.sigmaMax - M.sigmaMin) * (1 - skill);

    /*
    PRESSAO. Um adversario a `raioPressao` nao estorva nada; colado,
    multiplica a dispersao por `pressaoMult`. Entre os dois, linear.

    Isto nao existia: um jogador com um adversario em cima passava com a
    mesma precisao de um sozinho no meio do campo. A pressao so actuava na
    DECISAO (underPressure faz cair para o findPassTargetRelaxed) — ele
    escolhia pior, mas executava igualmente bem.
    */
    const d = o.distAdversario;
    if (typeof d === 'number' && d < M.raioPressao) {
        const aperto = 1 - Math.max(0, d) / M.raioPressao;
        sigma *= 1 + (M.pressaoMult - 1) * aperto;
    }

    /*
    ANGULO DO CORPO. `cosCorpo` 1 e virado para o alvo, -1 de costas. A
    penalizacao cresce so na metade de tras: passar para o lado e normal,
    passar sem olhar e que nao.
    */
    const cos = (typeof o.cosCorpo === 'number') ? Math.max(-1, Math.min(1, o.cosCorpo)) : 1;
    if (cos < 1) {
        const atras = (1 - cos) / 2;   // 0 de frente, 1 de costas
        sigma *= 1 + (M.costasMult - 1) * atras;
    }

    // Tecto: os multiplicadores de pressão e costas empilham-se, e sem
    // limite o pior caso (sigmaMax * pressaoMult * costasMult) passa dos
    // 30°, muito acima do que "~9.2 graus" documentado sugere.
    return Math.min(sigma, M.sigmaTecto);
}

/*
Quanto da forca sobra num passe feito sob pressao, 0..1.

Um passe apertado sai mais fraco: nao ha tempo para armar a perna. Aplica-se
a DISTANCIA ALVO (como o erro de peso) e nao a velocidade ja resolvida — a
balistica com arrasto quadratico nao e linear, e multiplicar a velocidade
faz o erro na distancia explodir.

Pura: sem Match, sem THREE.
*/
function fatorForcaSobPressao(distAdversario) {
    const M = PassErrorModel;
    const d = distAdversario;
    if (typeof d !== 'number' || d >= M.raioPressao) return 1.0;
    const aperto = 1 - Math.max(0, d) / M.raioPressao;
    return 1.0 - (1.0 - M.forcaMinPressao) * aperto;
}

/*
Uma amostra de uma normal (0, 1), por Box-Muller.

`rnd` e injectado de proposito: uma funcao pura nao chama Math.random, e sem
isto nao havia maneira de testar a FORMA da distribuicao (media, desvio,
cauda) — so de esperar que ela se portasse bem.

O clamp do u1 evita log(0) = -Infinity quando o gerador devolve zero.
*/
function amostraGaussiana(rnd) {
    const u1 = Math.max(1e-12, rnd());
    const u2 = rnd();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/*
Roda um vector no plano XZ. O sentido segue o mesmo do resto do jogo (ver
alvoDeApoio: x = sin, z = cos).

Pura: sem THREE — isto corre uma vez por passe e criar um Vector3 para o
efeito era desperdicio.
*/
function rodarNoPlano(x, z, angulo) {
    const c = Math.cos(angulo);
    const s = Math.sin(angulo);
    return { x: x * c + z * s, z: -x * s + z * c };
}

/*
Passe rasteiro: velocidade de saída para a bola percorrer `dist` metros e lá
chegar ainda com `vChegada` m/s (um passe tem de chegar jogável, não morto).

Aqui há fórmula fechada. A desaceleração no chão é `k·v² + μ·g` (arrasto mais
rolamento); integrando `v·dv / (k·v² + μ·g) = -dx`:

    v0 = √( ( (k·v1² + μ·g)·e^(2·k·x) − μ·g ) / k )
*/
function velocidadeRasteiraPara(dist, vChegada) {
    /*
    Velocidade de SAÍDA para a bola percorrer `dist` e lá chegar ainda
    jogável. Inverte o arrasto quadrático do ar mais o atrito de rolamento:

        alvo = (k·v_alvo² + μg)·e^(2k·dist) − μg
        v0   = √(alvo / k)

    A calibração é feita pela velocidade de CHEGADA, não pela de saída: é a
    chegada que decide se o receptor domina a bola (ver
    BallControl.easySpeed = 7.75) — a saída é consequência da distância.

    O `v_alvo` não é o `vChegada` cru:

      curto (< 12 m)  chega mais vivo. Uma bola de 3 m com a mesma chegada
                      de uma de 20 m sai a passo e parece que o jogador não
                      quis passar.
      longo (> 15 m)  chega mais manso, com piso de 1.5 m/s. Sem isto a
                      velocidade de saída bate no tecto e o passe deixa de
                      responder à distância.

    Com `atritoRolamento` a 0.38 (μg = 3.73 m/s²) o passe rasteiro tem um
    limite físico: nem no tecto de 18.5 m/s a bola passa dos ~29.8 m. Acima
    dos 15 m o `resolverElevacaoPasse` já manda a bola pelo ar, por isso o
    tecto aqui é rede de segurança e não caminho normal.
    */
    // Uma distância negativa (erro de quem chama) não pode dar velocidade
    // zero — isso lançaria a bola morta aos pés do próprio passador.
    dist = Math.max(0, dist);

    let vAlvo = vChegada;
    if (dist < 12.0) {
        vAlvo += (12.0 - dist) * 0.18;
    } else if (dist > 15.0) {
        vAlvo = Math.max(1.5, vChegada - (dist - 15.0) * 0.15);
    }

    const k = BallPhysics.kArrasto;
    const atrito = BallPhysics.atritoRolamento * BallPhysics.gravidade;
    const alvo = (k * vAlvo * vAlvo + atrito) * Math.exp(2 * k * dist) - atrito;

    // Tecto: acima disto o passe rasteiro vira disparo.
    return Math.min(18.5, Math.sqrt(Math.max(0, alvo / k)));
}

/*
Decide a FORMA do passe normal (rasteiro vs arco) pela distância ao alvo, e
devolve a elevação a usar — ver PassModel.passeArco em config.js.

<=15m: sempre rasteiro (devolve null).
15-30m: sorteia entre rasteiro (null) e um arco raso, com o TECTO de altura
       da faixa. A elevação vem de `apex/alcance = tan(elev)/4` (física do
       tiro parabólico sem arrasto, plana) — só o ponto de partida: o
       alcance real, com arrasto, resolve-se a seguir em
       velocidadeParaAlcance. Um tecto aproximado, não exacto, chega para o
       pedido (não deixar subir mais que isto).
>=30m: sorteia na mesma entre rasteiro (null) e pelo alto — quando sai pelo
       alto, o ângulo vem entre anguloLongoMin (longe, mais raso e rápido) e
       anguloLongoMax (perto dos 30m, mais alto), conforme a distância.

`forcarArco` salta o sorteio rasteiro/arco (estilo de passe "longo" — pedido
p'ra sair sempre pelo alto acima de `rasteiroMax`, não só às vezes). NÃO salta
o corte dos 15m: até lá é rasteiro seja qual for o estilo.

Devolve `null` quando é para ir rasteiro.
*/
function resolverElevacaoPasse(dist, forcarArco) {
    const B = PassModel.passeArco;
    if (dist <= B.rasteiroMax) return null;
    if (!forcarArco && Math.random() >= B.chanceArco) return null;

    if (dist < B.bandas[B.bandas.length - 1].max) {
        let alturaMax = B.bandas[B.bandas.length - 1].alturaMax;
        for (const banda of B.bandas) {
            if (dist <= banda.max) { alturaMax = banda.alturaMax; break; }
        }
        return Math.min(Math.PI / 3, Math.atan(4 * alturaMax / dist));
    }

    const t = THREE.MathUtils.clamp((dist - 30.0) / 30.0, 0, 1);
    return B.anguloLongoMax - (B.anguloLongoMax - B.anguloLongoMin) * t;
}

/*
Velocidade de saída para a bola estar a `altura` metros do chão quando chega
a `distH`, com a elevação dada.

É o que distingue um CRUZAMENTO de um passe pelo alto: o passe aterra no
ponto, o cruzamento tem de lá chegar à altura da CABEÇA do companheiro, ainda
no ar, para ele cabecear. Pedir `velocidadeParaAlcance(D)` punha a bola no
chão em D — chegava sempre baixa de mais para cabecear.

Para uma elevação fixa, a altura em `distH` cresce com a velocidade (com
pouca velocidade a bola já caiu antes de lá chegar), por isso bissecta-se em
v. Devolve null se nem à velocidade máxima razoável lá chega.
*/
function velocidadeParaAlturaEm(distH, altura, elev) {
    const g = BallPhysics.gravidade;
    const k = BallPhysics.kArrasto;

    const alturaEm = (v) => {
        let x = 0, y = BallPhysics.raio;
        let vx = v * Math.cos(elev), vy = v * Math.sin(elev);
        const dt = 1 / 120;
        for (let i = 0; i < 600; i++) {
            const s = Math.hypot(vx, vy);
            if (s > 0.001) { const dv = k * s * s * dt; vx -= vx / s * dv; vy -= vy / s * dv; }
            vy -= g * dt;
            const xa = x, ya = y;
            x += vx * dt; y += vy * dt;
            if (x >= distH) {
                const f = (distH - xa) / Math.max(1e-6, x - xa);
                return ya + (y - ya) * f;
            }
            if (y < 0) return -1;      // caiu antes de lá chegar
        }
        return -1;
    };

    let lo = 5, hi = 45;
    if (alturaEm(hi) < altura) return null;
    for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (alturaEm(mid) < altura) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

/*
Remate/cabeceio: com que ELEVAÇÃO sair para, à velocidade `v`, a bola passar
por um ponto a `distH` metros e `altura` metros do chão.

O remate é o caso inverso do passe: a potência já está decidida (é a pancada
do jogador), o que falta é a mira. A conta antiga era
`t = dZ / pow; cY = ½·g·t²` — assumia velocidade constante e usava a
velocidade 3D como se fosse horizontal, por isso subestimava o tempo de voo
duas vezes. Com o arrasto real (12-22 m/s² à velocidade de um remate) a bola
chegava sempre abaixo do ponto visado.

Devolve o ângulo em radianos, ou `null` se nem no ângulo óptimo lá chega.
*/
function elevacaoParaAlvo(distH, altura, v) {
    const g = BallPhysics.gravidade;
    const k = BallPhysics.kArrasto;

    // Altura da bola ao passar por distH, para uma dada elevação.
    const alturaEm = (elev) => {
        let x = 0, y = BallPhysics.raio;
        let vx = v * Math.cos(elev), vy = v * Math.sin(elev);
        const dt = 1 / 120;
        for (let i = 0; i < 600; i++) {
            const s = Math.hypot(vx, vy);
            if (s > 0.001) { const dv = k * s * s * dt; vx -= vx / s * dv; vy -= vy / s * dv; }
            vy -= g * dt;
            const xAnt = x, yAnt = y;
            x += vx * dt; y += vy * dt;
            if (x >= distH) {
                // Interpola no passo em que cruza a distância pedida.
                const f = (distH - xAnt) / Math.max(1e-6, x - xAnt);
                return yAnt + (y - yAnt) * f;
            }
            if (y < -5) return -Infinity;   // já enterrou muito antes
        }
        return -Infinity;
    };

    // A altura em distH cresce com a elevação até ao óptimo; bissecção no
    // ramo ascendente (o que dá a trajectória mais tensa, que é a que se quer
    // num remate).
    let lo = -0.15, hi = Math.PI / 4;
    if (alturaEm(hi) < altura) return null;      // nem no máximo lá chega
    for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (alturaEm(mid) < altura) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

/*
Distância de um ponto ao CORPO do jogador, e não à origem do modelo.

`model.position` está nos PÉS. Medir a distância 3D até lá tratava o jogador
como um ponto no chão: uma bola à altura da cabeça (1.75 m) ficava sempre a
mais de 1.75 m "dele", fora do alcance de contacto — e só entrava em alcance
quando o salto levantava a origem, altura em que o ponto de referência ficava
à altura da barriga. Era isso que fazia os cabeceios saírem do centro do
corpo em vez da testa.

Trata-se o jogador como um SEGMENTO vertical dos pés à testa: a altura do
ponto é limitada a esse intervalo antes de medir. Assim uma bola rasteira
toca-lhe nos pés, uma bola alta toca-lhe na cabeça, e o salto sobe o segmento
inteiro sem mudar a natureza da conta.

Devolve também a altura do contacto, para quem precise de saber se foi
cabeceio (ver resolveBallContact).
*/
function distanciaAoCorpo(p, ponto) {
    const base = p.model.position.y;
    const topo = base + ALTURA_CABECA;
    const yContacto = THREE.MathUtils.clamp(ponto.y, base, topo);
    return {
        dist: Math.hypot(
            ponto.x - p.model.position.x,
            ponto.y - yContacto,
            ponto.z - p.model.position.z),
        alturaContacto: yContacto - base
    };
}

/*
Onde é que a bola vai CAIR — o ponto em que ela volta ao chão.

Um passe pelo alto tem a bola a 3-4 m durante meio segundo, longe de onde vai
aterrar. Quem a fosse receber corria para `Match.ball.position` (a posição
ACTUAL) e, como essa se afasta a cada frame, acabava por lhe passar por baixo
e ficar atrás dela.

Simula o voo com a física real (a mesma do updateBall) até tocar no relvado.
Se a bola já estiver rasteira, devolve simplesmente onde ela está.
*/
function preverQuedaDaBola() {
    const B = BallPhysics;
    const pos = Match.ball.position;
    const vel = Match.ballVel;

    if (pos.y <= B.raio + 0.05) return { x: pos.x, z: pos.z, tempo: 0 };

    let x = pos.x, z = pos.z, y = pos.y;
    let vx = vel.x, vy = vel.y, vz = vel.z;
    const dt = 1 / 120;

    for (let i = 0; i < 480; i++) {          // até 4 s de voo
        const s = Math.hypot(vx, vy, vz);
        if (s > 0.001) {
            const dv = B.kArrasto * s * s * dt;
            vx -= vx / s * dv; vy -= vy / s * dv; vz -= vz / s * dv;
        }
        vy -= B.gravidade * dt;
        x += vx * dt; y += vy * dt; z += vz * dt;
        if (y <= B.raio) return { x: x, z: z, tempo: i * dt };
    }
    return { x: x, z: z, tempo: 4.0 };
}

/*
Onde é que a bola está daqui a `t` segundos.

Mesma física do updateBall. Serve para apontar o salto de cabeceio: prevê-se
a posição no instante do PICO do salto e só se salta se a bola lá estiver.
Se ela aterrar antes de `t`, continua a rolar rasteira — o que devolve uma
altura ao nível do chão e, por isso, "não vale a pena saltar".
*/
function preverBolaEm(t) {
    const B = BallPhysics;
    let x = Match.ball.position.x, y = Match.ball.position.y, z = Match.ball.position.z;
    let vx = Match.ballVel.x, vy = Match.ballVel.y, vz = Match.ballVel.z;
    const dt = 1 / 120;
    const passos = Math.min(240, Math.round(t / dt));

    for (let i = 0; i < passos; i++) {
        const s = Math.hypot(vx, vy, vz);
        if (s > 0.001) {
            const dv = B.kArrasto * s * s * dt;
            vx -= vx / s * dv; vy -= vy / s * dv; vz -= vz / s * dv;
        }
        vy -= B.gravidade * dt;
        x += vx * dt; y += vy * dt; z += vz * dt;
        if (y <= B.raio) { y = B.raio; vy = 0; }
    }
    return { x: x, y: y, z: z };
}

/*
Onde é que a bola DESCE por uma dada altura — o ponto onde se pode cabecear.

`preverQuedaDaBola` dá o sítio onde ela toca no relvado; quem quer cabecear
não a quer aí, quer onde ela cruza a altura da testa, que é bastante antes.
Ir para o ponto de queda era o que punha o jogador parado à espera que a bola
lhe aterrasse aos pés.

Só conta a passagem em DESCIDA (`vy < 0`): a subida logo a seguir ao pé de
quem cruzou não é ponto de cabeceio de ninguém.

Devolve `{x, z, tempo}`, ou `null` se a bola nunca chega a essa altura.
*/
function preverBolaEmAltura(altura) {
    const B = BallPhysics;
    let x = Match.ball.position.x, y = Match.ball.position.y, z = Match.ball.position.z;
    let vx = Match.ballVel.x, vy = Match.ballVel.y, vz = Match.ballVel.z;
    const dt = 1 / 120;

    for (let i = 0; i < 480; i++) {
        const s = Math.hypot(vx, vy, vz);
        if (s > 0.001) {
            const dv = B.kArrasto * s * s * dt;
            vx -= vx / s * dv; vy -= vy / s * dv; vz -= vz / s * dv;
        }
        vy -= B.gravidade * dt;
        const xAnt = x, yAnt = y, zAnt = z;
        x += vx * dt; y += vy * dt; z += vz * dt;

        if (vy < 0 && yAnt > altura && y <= altura) {
            const f = (yAnt - altura) / Math.max(1e-6, yAnt - y);
            return {
                x: xAnt + (x - xAnt) * f,
                z: zAnt + (z - zAnt) * f,
                tempo: (i + f) * dt
            };
        }
        if (y <= B.raio) return null;
    }
    return null;
}

/*
Este jogador está demasiado perto da linha de fundo para adiantar a bola?

Mede a distância à linha de fundo que ele ATACA (a que fica à frente dele no
referencial de ataque). Dentro de CarryModel.margemLinhaFundo, adiantar a bola
punha-a fora e dava pontapé de baliza ao adversário.

Usado pelo toque do CARRY (fsm.js).
*/
function pertoDaLinhaDeFundo(p) {
    const avanco = p.model.position.z * p.dirZ;
    return (CAMPO_COMP / 2 - avanco) < CarryModel.margemLinhaFundo;
}

function chancePorSegundo(taxa, dt) {
    return Math.random() < taxa * dt;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpTo(atual, alvo = 0, v = 0.15) { const r = atual + (alvo - atual) * v; return Math.abs(r - alvo) < 0.001 ? alvo : r; }

/*
Wrapper para model.lookAt(ponto) nos jogadores.

Histórico: cheguei a meter aqui um `rotation.y += Math.PI`, deduzido a partir
da posição da cara (+Z) em buildBody — matematicamente consistente sozinho,
mas testado em jogo deu jogadores/guarda-redes de costas onde antes (com
`.lookAt()` puro) não geravam essa queixa. Ou seja: a dedução geométrica
estava errada nalgum ponto (ou o pressuposto sobre a ordem dos materiais da
BoxGeometry, ou outra coisa) e o `.lookAt()` sem flip é que está certo.
Revertido — fica só como wrapper para o dia em que isto for investigado a
sério (comparar de facto contra o jogo, não só contra a matemática).
*/
function passoDeGuinada(atual, alvo, dt, velMax = 500 * Math.PI / 180) {
    let diff = Math.atan2(Math.sin(alvo - atual), Math.cos(alvo - atual));
    const maxPasso = velMax * dt;
    if (Math.abs(diff) <= maxPasso) return alvo;
    return atual + Math.sign(diff) * maxPasso;
}

function guinadaPara(origem, alvoX, alvoZ) {
    const dx = alvoX - origem.x;
    const dz = alvoZ - origem.z;
    return Math.atan2(dx, dz);
}

let _vLookAt = null;

function lookAtBola(model, point) {
    if (!model || !point) return;
    const targetY = (model.position && typeof model.position.y === 'number') ? model.position.y : 0;
    if (!_vLookAt) {
        _vLookAt = (typeof THREE !== 'undefined' && THREE.Vector3)
            ? new THREE.Vector3()
            : { x: 0, y: 0, z: 0, set: function(x,y,z){ this.x=x; this.y=y; this.z=z; return this; } };
    }
    _vLookAt.set(point.x, targetY, point.z);
    model.lookAt(_vLookAt);
}

/*
Alvo posicional de um colega para efeitos de passe/lançamento: o alvo que
o PositionBT (nível 2) já calculou para ele — para onde o bloco o está a
mandar — e não a posição actual.

Simplificação deliberada e temporária: até existir o PlayingStylesBT, é
mais previsível mirar para onde a equipa QUER que o colega esteja do que
tentar antecipar a posição actual dele com lead por velocidade. O guarda-
redes nunca tem tacticalTarget (não passa pelo PositionBT), por isso cai
na posição actual.
*/
function alvoDePasse(p) {
    if (!p || !p.model) return new THREE.Vector3();
    const pos = p.model.position.clone();
    
    if (p.velocity && typeof Match !== 'undefined' && Match.ball) {
        const vBall = 14.0;
        const dx = pos.x - Match.ball.position.x;
        const dz = pos.z - Match.ball.position.z;
        const vx = p.velocity.x * 0.85;
        const vz = p.velocity.z * 0.85;
        
        const a = (vx * vx + vz * vz) - (vBall * vBall);
        const b = 2 * (dx * vx + dz * vz);
        const c = dx * dx + dz * dz;
        
        let t = 0;
        if (Math.abs(a) < 0.001) {
            if (Math.abs(b) > 0.001) t = -c / b;
        } else {
            const delta = b * b - 4 * a * c;
            if (delta >= 0) {
                const t1 = (-b + Math.sqrt(delta)) / (2 * a);
                const t2 = (-b - Math.sqrt(delta)) / (2 * a);
                if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
                else if (t1 > 0) t = t1;
                else if (t2 > 0) t = t2;
            }
        }
        
        if (t <= 0 || t > 3.0) {
            t = Math.min(Math.sqrt(c) / vBall, 3.0);
        }
        
        pos.x += vx * t;
        pos.z += vz * t;
    }
    
    // Percepção de limites do campo: mantém o ponto de lead dentro das margens úteis de jogo
    if (typeof CAMPO_LARG !== 'undefined' && typeof CAMPO_COMP !== 'undefined') {
        const margem = (typeof PassModel !== 'undefined' && PassModel.margemSegurancaLinha) ? PassModel.margemSegurancaLinha : 2.5;
        const limX = (CAMPO_LARG / 2) - margem;
        const limZ = (CAMPO_COMP / 2) - margem;
        pos.x = Math.max(-limX, Math.min(limX, pos.x));
        pos.z = Math.max(-limZ, Math.min(limZ, pos.z));
    }
    
    return pos;
}

function applyKeyframeAnimation(player, animName, time) {
    const anim = OptimizedAnimations[animName];
    if (!anim) return;
    const bones = anim.bones;
    const rig = player.rig;
    
    for (const boneName in bones) {
        const keyframes = bones[boneName];
        if (!keyframes || keyframes.length === 0) continue;
        
        let fA = keyframes[0], fB = keyframes[0];
        for (let i = 0; i < keyframes.length - 1; i++) {
            if (time >= keyframes[i].t && time <= keyframes[i + 1].t) {
                fA = keyframes[i];
                fB = keyframes[i + 1];
                break;
            }
        }
        
        let tLocal = 0;
        if (fB.t !== fA.t) {
            tLocal = (time - fA.t) / (fB.t - fA.t);
        }
        
        const rA = fA.r;
        const rB = fB.r;
        
        let targetBone = rig[boneName];
        if (targetBone) {
            targetBone.rotation.x = rA[0] + (rB[0] - rA[0]) * tLocal;
            targetBone.rotation.y = rA[1] + (rB[1] - rA[1]) * tLocal;
            targetBone.rotation.z = rA[2] + (rB[2] - rA[2]) * tLocal;
            
            if (boneName === 'pelvis' && fA.p && fB.p) {
                const pA = fA.p;
                const pB = fB.p;
                const baseHipsHeight = keyframes[0].p[1] * 0.01;
                const currentHipsHeight = (pA[1] + (pB[1] - pA[1]) * tLocal) * 0.01;
                player.model.position.y = ALTURA_BASE_Y + (currentHipsHeight - baseHipsHeight);
            }
        }
    }
}

const OptimizedAnimations = {
    "Soccer Tackle": {
        "duration": 1.767,
        "bones": {
            "pelvis": [
                {"t":0,"r":[0,0,0],"p":[0,87.6,0]},
                {"t":0.5,"r":[-0.1,1.1,-0.9],"p":[-5.2,23.3,241]},
                {"t":1.0,"r":[0.3,1.0,-0.7],"p":[-18.9,27.2,347]},
                {"t":1.767,"r":[0.3,-0.05,-0.01],"p":[1.5,86.1,414]}
            ],
            "lLeg": [
                {"t":0,"r":[-0.2,0,-3.0]},
                {"t":0.8,"r":[-1.2,0.3,2.7]},
                {"t":1.767,"r":[-0.7,0,-2.8]}
            ],
            "rLeg": [
                {"t":0,"r":[-0.5,0.1,3.0]},
                {"t":0.8,"r":[-0.6,0.1,2.6]},
                {"t":1.767,"r":[-0.7,0,2.9]}
            ]
        }
    },
    "Goalie Throw": { 
        "duration": 3.833, 
        "bones": {
             "pelvis": [
                {"t":0,"r":[0,0,0],"p":[0,93,0]},
                {"t":3.833,"r":[0,0,0],"p":[0,93,0]}
            ]
        } 
    }
};


/*
Quanto vale o espaço livre para este jogador, pela Técnica. Quem tem técnica lê
o espaço e desvia; quem não tem insiste no caminho para a baliza.

É uma das DUAS vias pelas quais a técnica manda na condução. A outra já existia:
o cone de visão em CARRY (fsm.js) abre com a técnica — ±30° a 40, ±56° a 80 — e
um jogador de técnica baixa nem chega a VER a ponta livre a 56°.
*/
function pesoEspacoPorTecnica(tec) {
    const C = CarryModel;
    const t = Math.max(0, Math.min(1,
        (tec - C.tecEspacoMin) / (C.tecEspacoMax - C.tecEspacoMin)));
    return C.pesoEspacoMin + (C.pesoEspacoMax - C.pesoEspacoMin) * t;
}

/*
A LINHA ENTRE DOIS PONTOS ESTA LIVRE?

Distancia de cada obstaculo ao SEGMENTO (nao a recta): quem esta atras de
quem passa, ou para la do destino, nao fecha linha nenhuma.

`obstaculos` e uma lista de { x, z }. `margem` em metros — a folga minima que
a bola precisa para passar ao lado de alguem.

Pura: sem Match, sem THREE (o Line3 exigia um Vector3 por obstaculo e por
chamada, e isto corre dentro da procura do destino de corrida, muitas vezes
por frame).
*/
function linhaLivre(ax, az, bx, bz, obstaculos, margem) {
    if (!obstaculos || !obstaculos.length) return true;

    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const m2 = margem * margem;

    for (const o of obstaculos) {
        if (!o) continue;
        let t = 0;
        if (len2 > 0.000001) {
            t = ((o.x - ax) * dx + (o.z - az) * dz) / len2;
            t = Math.max(0, Math.min(1, t));
        }
        const px = ax + dx * t;
        const pz = az + dz * t;
        const ex = o.x - px;
        const ez = o.z - pz;
        if (ex * ex + ez * ez < m2) return false;
    }
    return true;
}

/*
Corte de um avanço (z * dirZ) pela linha de fora-de-jogo publicada pelo nível
1 (`bb.offsideLimitDir`, já no referencial de ataque). `null`/`undefined`
significa que não há linha publicada — a equipa não tem a posse — e nesse caso
não há nada a respeitar.

Vive aqui, separada, porque tem DOIS chamadores: a escolha do destino da
corrida (destinoDeCorrida, logo abaixo) e a revalidação por frame em
actRunIntoSpace. Só a primeira existia, e a corrida ficava depois fixa 4
segundos — tempo mais do que suficiente para a última linha subir e o destino
passar a ilegal, com o jogador a correr para lá na mesma.
*/
function avancoLegalDeCorrida(avanco, offsideLimitDir) {
    const MARGEM_FORA_DE_JOGO = 0.5;
    if (typeof offsideLimitDir !== 'number') return avanco;
    const tecto = offsideLimitDir - MARGEM_FORA_DE_JOGO;
    return (avanco > tecto) ? tecto : avanco;
}

/*
DESTINO DE UMA CORRIDA AO ESPACO.

O candidato bruto vem do SpatialGrid (a celula mais vazia num raio a frente
do jogador). Esta funcao decide se ele SERVE, e corta-o a medida:

    a frente      avanco do destino > avanco do jogador + MINIMO
    corrivel      entre MINIMO e `maxCorrida` metros; mais longe e encurtado
                  na mesma direccao, mais perto nao vale a pena arrancar
    em jogo       dentro das linhas, com folga
    legal         aquem da linha de fora-de-jogo publicada pelo nivel 1
                  (bb.offsideLimitDir, ja no referencial de ataque)

Tudo em `avanco` (z * dirZ) para nao haver dois casos espelhados a manter.

`offsideLimitDir` a null significa "sem linha publicada" (a equipa nao tem a
posse) — nesse caso nao ha fora-de-jogo a respeitar.

Devolve { x, z } no referencial do MUNDO, ou null se nao houver corrida que
valha a pena.

Pura: sem Match, sem SpatialGrid, sem THREE.
*/
function destinoDeCorrida(o) {
    const MINIMO = 6.0;        // menos do que isto e um passo, nao uma corrida
    const MARGEM_LINHA = 2.0;  // folga para as linhas laterais e de fundo

    const dirZ = o.dirZ;
    const avancoJogador = o.pz * dirZ;
    let alvoX = o.candidatoX;
    let avancoAlvo = o.candidatoZ * dirZ;

    // Aquem da linha de fora-de-jogo, se houver uma (ver avancoLegalDeCorrida,
    // partilhada com a revalidacao por frame em actRunIntoSpace).
    avancoAlvo = avancoLegalDeCorrida(avancoAlvo, o.offsideLimitDir);

    // Dentro do campo.
    const meiaLarg = CAMPO_LARG / 2 - MARGEM_LINHA;
    const meioComp = CAMPO_COMP / 2 - MARGEM_LINHA;
    alvoX = Math.max(-meiaLarg, Math.min(meiaLarg, alvoX));
    avancoAlvo = Math.max(-meioComp, Math.min(meioComp, avancoAlvo));

    // Tem de ser para a frente, e tem de dar uma corrida.
    if (avancoAlvo <= avancoJogador) return null;

    let dx = alvoX - o.px;
    let dAvanco = avancoAlvo - avancoJogador;
    const dist = Math.hypot(dx, dAvanco);
    if (dist < MINIMO) return null;

    // Longe demais: encurta na mesma direccao em vez de desistir.
    if (dist > o.maxCorrida) {
        const k = o.maxCorrida / dist;
        dx *= k;
        dAvanco *= k;
    }

    return {
        x: o.px + dx,
        z: (avancoJogador + dAvanco) * dirZ
    };
}

/*
NOTA DE DISTANCIA DO PASSE — a forma da curva que faz o jogo girar.

Era, dentro do findPassTarget (player.js):

    if (dist <= 20.0)      baseScore = 80 + 20 * circulacao;
    else if (dist <= 40.0) baseScore = (100 - (dist - 20) * 1.5) * (circ + vert) / 2;
    else                   baseScore = max(10, (70 - (dist - 40) * 2) * vert);

O primeiro ramo era PLANO: um passe de 2.5 m valia exactamente o mesmo que um
de 19 m. Com a nota igual, quem desempatava era o bonus de "livre de
marcacao" (ate +50), e esse o passe curtissimo ganha quase sempre — uma linha
de 3 m nao da tempo a ninguem de a cortar. Medido no jogo: 32.1% dos passes
abaixo de 5 m e mediana de 11.0 m; a troca de 12-18 m que faz a bola girar
nao tinha vantagem nenhuma sobre o toquinho ao lado.

Agora a curva tem forma:

    < 6 m      0.25   possivel, mas caro: quase nunca e a melhor ideia
    6 - 12 m   sobe   ate ao topo
    12 - 22 m  1.00   a faixa da circulacao normal

A primeira versao punha o topo a partir dos 10 m e o piso em 0.35. Medido:
16.8% dos passes ainda abaixo de 5 m, e 70% desses passes curtos TINHAM uma
linha livre a 10-22 m pelo criterio do proprio jogo. Ou seja, a curva perdia
para o bonus de "livre de marcacao" (ate +50). Dai o piso descer a 0.25 e a
rampa acabar so aos 12 m.
    22 - 40 m  desce  ate 0.55
    > 40 m     desce  ate um minimo de 0.20

O estilo entra por cima, e nao dentro da forma: `circulacao` pesa no passe
curto/medio e `verticalidade` no longo, com a mistura a rodar entre os 12 e
os 32 m. Um Possession e um Direct escolhem alvos diferentes com a MESMA
curva por baixo.

Pura de proposito: sem Match, sem window, so os argumentos (ver
tests/passe_distancia.test.js).
*/
function formaDistanciaPasse(dist) {
    const d = Math.max(0, dist);
    if (d < 6) return 0.25;
    if (d < 12) return 0.25 + (d - 6) / 6 * 0.75;
    if (d <= 22) return 1.0;
    if (d <= 40) return 1.0 - (d - 22) / 18 * 0.45;
    return Math.max(0.20, 0.55 - (d - 40) * 0.01);
}

function notaDistanciaPasse(dist, circulacao, verticalidade) {
    const d = Math.max(0, dist);
    const forma = formaDistanciaPasse(d);

    // 0 no passe curto, 1 no longo: e o que decide se manda a circulacao ou
    // a verticalidade do TeamPlayStyle.
    const t = Math.max(0, Math.min(1, (d - 12) / 20));
    const estilo = circulacao * (1 - t) + verticalidade * t;

    return 100 * forma * estilo;
}

/*
Nota de uma direcção candidata de condução. Os três argumentos vêm normalizados
a 0..1 por quem chama (ver o case 'CARRY' em fsm.js):

    espaco     distância ao obstáculo mais próximo no corredor, sobre spaceCap
    progresso  avanço para a baliza sobre a distância de visão — cos(ângulo)
    sectorPen  Tatics.penalidadeSector do ponto candidato

Pura de propósito: sem Match, sem window, só os argumentos (ver
tests/carry_direccao.test.js).
*/
function notaDireccaoCarry(espaco, progresso, sectorPen, tec) {
    const C = CarryModel;
    return espaco * pesoEspacoPorTecnica(tec)
        + progresso * C.pesoProgresso
        - sectorPen * C.pesoSector;
}

/*
Graça de condução (p.carryTouchGrace): a janela entre soltar a bola no toque
à frente do CARRY e voltar a tocá-la. Durante ela o BT ainda trata o jogador
como portador (temBola em player_bt.js), senão o instante de hasBall=false
mandava-o para SemBola e ele abandonava a bola que acabara de tocar.

`outroTemBola` é o que fecha o buraco: enquanto a bola anda solta à frente,
um adversário — ou um colega — pode ficar com ela. Sem este corte o antigo
portador continuava com a graça a correr e ficavam DOIS jogadores em CARRY
ao mesmo tempo. A graça só cobre a bola que continua a ser dele.
*/
function graceDeConducao(hasBall, grace, outroTemBola, dt) {
    if (hasBall || outroTemBola) return 0;
    if (grace > 0) return Math.max(0, grace - dt);
    return 0;
}

/*
QUEM INTERCEPTA, UM POR EQUIPA.

`lista` são os candidatos elegíveis, cada um `{ p, t }` com o tempo de
interceptação vindo da percepção. `tQuemJaVai` é o melhor tempo entre os que
já estão encarregues da bola (chaser, destinatário do passe); `margem` é o
quanto é preciso batê-los para valer a pena mandar mais alguém.

Era decidido dentro da árvore, por cada jogador, com uma reivindicação escrita
no blackboard: quem corresse primeiro reivindicava, e os seguintes só cediam
se fossem PIORES. Um jogador melhor a correr depois reivindicava também — e o
primeiro já tinha mudado de estado nesse frame. Resultado: dois jogadores da
mesma equipa em INTERCEPT, e permanente, porque a ordem da lista não muda
entre frames. Escolher aqui, de uma vez, tira a ordem da equação.

Empate no tempo resolve-se pelo primeiro da lista — estável, porque a lista da
equipa mantém a ordem de frame para frame.
*/
function escolherIntercetor(lista, tQuemJaVai, margem) {
    let melhor = null;
    for (const c of lista) {
        if (!c || !c.p) continue;
        if (melhor === null || c.t < melhor.t) melhor = c;
    }
    if (melhor === null) return null;

    const limite = (typeof tQuemJaVai === 'number') ? tQuemJaVai : Infinity;
    if (melhor.t + margem >= limite) return null;
    return melhor.p;
}

/*
FOLGA DA LINHA: a que distância passa o adversário mais próximo do segmento
A->B. É a versão contínua do `linhaLivre` (que só responde passa/não passa) e
serve para PONTUAR uma linha de passe em vez de a aceitar ou rejeitar.

`Infinity` quando não há ninguém — o chamador é que decide o tecto.
*/
function folgaDaLinha(ax, az, bx, bz, obstaculos) {
    if (!obstaculos || !obstaculos.length) return Infinity;

    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let melhor = Infinity;

    for (const o of obstaculos) {
        if (!o) continue;
        let t = 0;
        if (len2 > 0.000001) {
            t = ((o.x - ax) * dx + (o.z - az) * dz) / len2;
            t = Math.max(0, Math.min(1, t));
        }
        const px = ax + dx * t;
        const pz = az + dz * t;
        const d = Math.hypot(o.x - px, o.z - pz);
        if (d < melhor) melhor = d;
    }
    return melhor;
}

/*
NOTA DE UM PONTO DE APOIO — quanto vale oferecer-se ali.

O `atribuirApoios` filtrava os pontos por linha livre (binário) e depois
escolhia entre eles o MAIS BARATO, isto é, o mais perto do slot do bloco. Em
campo lia-se como o médio a fechar para dentro em vez de se pôr no vão entre
dois adversários: o ponto cómodo tinha linha "livre" à tangente e ganhava ao
vão aberto que ficava dois metros mais longe.

Três termos:
    folgaLinha   a que distância passa o adversário mais perto do caminho da
                 bola (folgaDaLinha) — é isto que abre a linha de passe
    folgaPonto   a que distância fica o adversário mais perto do PONTO — um
                 ponto colado a um marcador não é opção, é disputa
    custoSlot    metros que ele tem de sair do slot do bloco para lá ir

Os dois primeiros têm tecto (`folgaCap`): uma linha completamente vazia não
pode valer infinito, senão o ponto do outro lado do campo ganha sempre.
*/
function notaPontoDeApoio(o, pesos) {
    const cap = pesos.folgaCap;
    const folgaLinha = Math.min(o.folgaLinha, cap);
    const folgaPonto = Math.min(o.folgaPonto, cap);

    return folgaLinha * pesos.pesoFolgaLinha
        + folgaPonto * pesos.pesoFolgaPonto
        - o.custoSlot * pesos.pesoCusto;
}

/*
SEGUIMENTO DA BOLA — o centro do bloco, usado nos DOIS eixos.

NÃO é momentum. Momentum é o LADO do campo onde o jogo está a acontecer:
eixo X, largura, sectores Left/Right/Center (ver bb.momentumX). Isto é outra
coisa: onde a bola está ao longo do campo, suavizado o suficiente para os onze
alvos não tremerem com cada ressalto.

Vivia com o nome `momentumZ` e, por causa do nome, com constantes de tempo de
momentum: 2.5 s a defender e 4.0 s com a bola a recuar. Um seguimento com 2.5 s
de constante fica ~25 m atrás de uma bola a 10 m/s — era isso que punha os dois
rectângulos do TeamBT atrás da jogada.

Simétrico de propósito: a assimetria antiga colava o bloco ao ataque e
arrastava-o no recuo. `reposta` é a bola fora de jogo (golo, canto,
lançamento), onde o centro salta em vez de deslizar pelo campo.
*/
function seguirBola(actual, alvo, k, dt, reposta) {
    if (reposta || dt >= 1) return alvo;
    const passo = 1 - Math.exp(-k * dt);
    return actual + (alvo - actual) * passo;
}
