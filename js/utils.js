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
Passe rasteiro: velocidade de saída para a bola percorrer `dist` metros e lá
chegar ainda com `vChegada` m/s (um passe tem de chegar jogável, não morto).

Aqui há fórmula fechada. A desaceleração no chão é `k·v² + μ·g` (arrasto mais
rolamento); integrando `v·dv / (k·v² + μ·g) = -dx`:

    v0 = √( ( (k·v1² + μ·g)·e^(2·k·x) − μ·g ) / k )
*/
function velocidadeRasteiraPara(dist, vChegada) {
    // Adaptar a velocidade de chegada à distância:
    // Passes curtos precisam sair com mais velocidade e dinamismo para não parecerem lentos/frouxos.
    // Passes longos desaceleram progressivamente para não parecerem foguetes/chutões.
    let vAlvo = vChegada;
    if (dist < 12.0) {
        vAlvo += (12.0 - dist) * 0.45; // Boost mais firme nos curtos (ex: 4m ganha +3.6 m/s)
    } else if (dist > 15.0) {
        // Redução gradual e progressiva nos passes longos
        vAlvo = Math.max(1.0, vChegada - (dist - 15.0) * 0.28);
    }

    const k = BallPhysics.kArrasto;
    const atrito = BallPhysics.atritoRolamento * BallPhysics.gravidade;
    const alvo = (k * vAlvo * vAlvo + atrito) * Math.exp(2 * k * dist) - atrito;
    
    // Tecto de segurança moderado para passes rasteiros (18.5 m/s) para evitar disparos irreais
    return Math.min(18.5, Math.sqrt(Math.max(0, alvo / k)));
}

/*
Decide a FORMA do passe normal (rasteiro vs arco) pela distância ao alvo, e
devolve a elevação a usar — ver PassModel.passeArco em config.js.

<=5m: sempre rasteiro (devolve null).
5-30m: sorteia entre rasteiro (null) e um arco raso, com o TECTO de altura
       da faixa. A elevação vem de `apex/alcance = tan(elev)/4` (física do
       tiro parabólico sem arrasto, plana) — só o ponto de partida: o
       alcance real, com arrasto, resolve-se a seguir em
       velocidadeParaAlcance. Um tecto aproximado, não exacto, chega para o
       pedido (não deixar subir mais que isto).
>=30m: sorteia na mesma entre rasteiro (null) e pelo alto — quando sai pelo
       alto, o ângulo vem entre anguloLongoMin (longe, mais raso e rápido) e
       anguloLongoMax (perto dos 30m, mais alto), conforme a distância.

`forcarArco` salta o sorteio rasteiro/arco (estilo de passe "longo" — pedido
p'ra sair sempre pelo alto acima dos 5m, não só às vezes).

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

