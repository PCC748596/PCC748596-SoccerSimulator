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
    const P = GaitModel.parado || A;
    let a, b, k;

    /*
    ABAIXO DO ANDAR a amplitude decai até zero, e não fica congelada no andar
    inteiro como ficava. Ver GaitModel.parado: com a coxa a oscilar 22.9 graus
    a 0.05 m/s, atravessar o limiar de 0.1 m/s do `animateBones` fazia o corpo
    saltar entre uma passada completa e estar de pé — a vibração de quem espera
    um passe.
    */
    if (vel <= A.vel) { a = P; b = A; k = A.vel > 0 ? Math.max(0, vel) / A.vel : 0; }
    else if (vel <= T.vel) { a = A; b = T; k = (vel - A.vel) / (T.vel - A.vel); }
    else if (vel <= C.vel) { a = T; b = C; k = (vel - T.vel) / (C.vel - T.vel); }
    else { a = C; b = C; k = 0; }

    const r = {};
    for (const campo in A) r[campo] = lerp(a[campo], b[campo], k);
    return r;
}

/*
Pose de locomoção para um dado ponto do ciclo `t` (0..1) e uma velocidade.

Ao contrário do getRunPose, aqui a AMPLITUDE também depende da velocidade — é
isso que faz andar parecer andar e não correr devagar. E a `passada` que
devolve é o avanço por ciclo DAQUELE andamento (1.55 m a andar, 4.40 a correr),
que é o que a cadência tem de usar: `animTimer += vel * dt / passada`.

O `getRunPose` era usado pelo guarda-redes e **já não tem chamadores** — o GK
passou a usar esta função, como o resto do jogo. Ele tinha ficado com a versão
antiga do ciclo (3 m por ciclo a qualquer andamento, amplitude fixa) e era isso
que o fazia deslizar em vez de correr.

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
    const passeCurto = (typeof o.distPasse === 'number' && o.distPasse <= 14.0);
    const multPressao = passeCurto ? (1 + (M.pressaoMult - 1) * 0.45) : M.pressaoMult;
    if (typeof d === 'number' && d < M.raioPressao) {
        const aperto = 1 - Math.max(0, d) / M.raioPressao;
        sigma *= 1 + (multPressao - 1) * aperto;
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
/*
QUANTO É QUE O CORPO TEM DE RODAR NUM LANÇAMENTO LATERAL.

A cintura torce-se até `giroMax` e não mais (LateralPose.giroMax) — para lá
disso deixava de ser um arco e passava a ser um jogador partido ao meio. O que
sobra é o corpo que o dá: quem atira para trás de si vira-se, não se contorce.

Devolve só o EXCESSO, e por isso um alvo dentro do alcance da cintura continua
a ser resolvido exactamente como antes, com o corpo de frente para o campo.
`ang` é o ângulo com sinal entre a frente do corpo e a direcção do lançamento.
*/
/*
ATE ONDE ESTE JOGADOR CONSEGUE ATIRAR UM LATERAL.

Interpolacao linear entre `fraco` (STRENGTH 0) e `forte` (STRENGTH 100). Fora
da escala corta nos extremos: um skill acima de 100 nao compra alcance extra.
*/
/*
RECUO PARA O GUARDA-REDES: PODE ELE PEGAR COM A MAO?

A regra do jogo: um passe DELIBERADO e COM O PE de um companheiro nao pode ser
agarrado com as maos. Cabeca, peito ou coxa podem; um desvio involuntario de
um adversario tambem.

`recuoTeam` e a equipa cujo guarda-redes esta proibido — posto quando o passe
sai do pe (ver executePassGameplay na fsm.js) e limpo assim que outra pessoa
toca na bola. Nulo enquanto nao houver recuo nenhum, que e o caso normal.
*/
function maosProibidasNoRecuo(recuoTeam, gkTeam) {
    return !!recuoTeam && recuoTeam === gkTeam;
}

/*
ONDE SE POE UM COMPANHEIRO NUM LANCAMENTO LATERAL.

Quem repoe nao tinha a quem atirar: os companheiros ficavam nos slots do bloco,
a vinte e tal metros, e o lateral saia para ninguem. Isto puxa-os para uma
FAIXA em volta do batedor — nem em cima dele, nem longe de mais.

Move-os ao longo da linha que ja os liga ao batedor, e nao para pontos fixos:
assim cada um continua no seu corredor (o central pelo eixo, o medio pelo meio,
o extremo pela ala) e a unica coisa que muda e a distancia. Slots fixos punham
tres jogadores em leque no mesmo sitio, seja qual for a posicao deles.

Devolve { x, z }. Pura: sem Match, sem THREE.
*/
/*
ONDE COMECA O QUARTO DE CIRCULO DE UM CANTO.

O arco de canto e um quarto de circulo virado PARA DENTRO do campo. A conta
nao e obvia porque o `RingGeometry` e desenhado no plano XY e depois deitado
com `rotation.x = -PI/2`: um ponto em angulo t, que no plano seria
(cos t, sin t), acaba em (x = cos t, z = -sin t) — o z fica INVERTIDO.

Dai a tabela: para cada canto, o `thetaStart` cujo quarto (t ate t + PI/2)
cai no quadrante que aponta para o meio do campo. `sx` e `sz` sao os sinais
das coordenadas do canto.

Devolve o angulo inicial em radianos; o comprimento e sempre PI/2.
*/
/*
MOLA DE COESAO A BOLA.

O PROBLEMA. Quando as molas de coesao foram apagadas (ver o comentario no
match.js), o unico laco que sobrou foi a coesao a FORMA: cada jogador vai para
o seu slot no bloco e mais nada. Com o portador longe do slot dos companheiros
— um central que subiu pela ala, por exemplo — eles CORREM PARA LONGE DA
JOGADA. Nao estao a fugir da bola: estao a ir para a forma, e o modelo so
conhece esse laco.

O apoio de circulacao nao resolve porque tem um corte por desenho: um jogador
so pode ser apoio se o ponto estiver a menos de `desvioMax` (8 m) do slot dele
— "nao arranca ninguem do outro lado do campo". Quem esta longe nunca chega a
ser candidato.

O QUE ISTO FAZ. Puxa o alvo de cada um na direccao da bola, e so o EXCESSO
acima de `distMin`: quem ja esta perto nao e tocado, quem esta longe encolhe a
distancia. Como todos sao puxados na mesma direccao, a FORMA mantem-se — o que
muda e que ela se comprime para o lado da bola, que e o que um bloco faz.

O `puxaoMax` e o que impede isto de virar um imã: sem tecto, os onze acabavam
todos em cima da bola e a formacao deixava de existir.

Pura: sem Match, sem THREE. Devolve { x, z }.
*/
function molaParaABola(alvoX, alvoZ, bolaX, bolaZ, forca, distMin, puxaoMax) {
    if (!(forca > 0)) return { x: alvoX, z: alvoZ };

    const dx = bolaX - alvoX, dz = bolaZ - alvoZ;
    const d = Math.max(0.000001, Math.hypot(dx, dz));
    if (!(d > distMin)) return { x: alvoX, z: alvoZ };

    const puxao = Math.min((d - distMin) * forca, puxaoMax);
    const k = puxao / d;
    return { x: alvoX + dx * k, z: alvoZ + dz * k };
}

function arcoDeCanto(sx, sz) {
    if (sx > 0) return (sz > 0) ? Math.PI / 2 : Math.PI;
    return (sz > 0) ? 0 : -Math.PI / 2;
}

/*
`dirX`/`dirZ` (opcionais): a direcção em que este apoio DEVE ficar em relação
ao batedor. Sem eles usa-se a direcção em que ele já está, que é o que estava
aqui e é o que juntava toda a gente: dois jogadores que chegam ao lance pela
mesma banda são projectados no mesmo raio e ficam em cima um do outro — o RM e
o CM da imagem. Com a direcção do SLOT de cada um, o médio da ala vai para a
frente pela linha, o lateral fica atrás e o CM abre para dentro, que é onde
cada um deles devia estar.
*/
function alvoDeApoioNoLateral(px, pz, bx, bz, distMin, distMax, dirX, dirZ) {
    let dx = px - bx, dz = pz - bz;

    if (typeof dirX === 'number' && typeof dirZ === 'number') {
        const n = Math.hypot(dirX, dirZ);
        if (n > 0.001) {
            /*
            A distância mantém-se a que ele já tem (para não o teleportar), mas
            a DIRECÇÃO passa a ser a do slot dele. O clamp abaixo trata do
            resto.
            */
            const dAtual = Math.hypot(dx, dz) || distMin;
            dx = (dirX / n) * dAtual;
            dz = (dirZ / n) * dAtual;
        }
    }

    const d = Math.hypot(dx, dz);

    // Em cima do batedor, sem direccao definida: manda-se para dentro do campo
    // (o batedor esta na linha, logo o campo e do lado do x menor em modulo).
    if (d < 0.001) {
        const paraDentro = (bx >= 0) ? -1 : 1;
        return { x: bx + paraDentro * distMin, z: bz };
    }

    let alvo = d;
    if (d > distMax) alvo = distMax;
    else if (d < distMin) alvo = distMin;
    else return { x: px, z: pz };      // ja esta na faixa: nao se mexe

    const k = alvo / d;
    return { x: bx + dx * k, z: bz + dz * k };
}

function alcanceMaximoDoLateral(strength, fraco, forte) {
    const s = Math.max(0, Math.min(100, Number(strength) || 0));
    return fraco + (forte - fraco) * (s / 100);
}

function giroDoCorpoNoLateral(ang, giroMax) {
    if (!Number.isFinite(ang) || !Number.isFinite(giroMax)) return 0;
    const m = Math.abs(giroMax);
    if (ang > m) return ang - m;
    if (ang < -m) return ang + m;
    return 0;
}

function rodarNoPlano(x, z, angulo) {
    const c = Math.cos(angulo);
    const s = Math.sin(angulo);
    return { x: x * c + z * s, z: -x * s + z * c };
}

/*
Velocidade de saída para a bola chegar a um ponto com ALTURA — `distancia`
metros à frente e `alturaAlvo` do chão, partindo de `alturaSaida`.

Isto não existia. O lateral (e o chutão) usavam a fórmula de alcance,

    v = sqrt(alcance * g / sin(2 * elev))

que só vale quando a altura de saída é IGUAL à de chegada. A bola de um lateral
sai das mãos, a uns 2 m do chão, e a fórmula trata esse ponto como se fosse o
chão: o "alcance" que ela devolve é onde a bola voltaria à altura das mãos, não
onde chega ao receptor. Resultado: mirava-se um companheiro e a bola chegava-lhe
à altura que calhasse.

Da parábola, com dh = alturaAlvo - alturaSaida:

    dh = D * tan(elev) - g * D^2 / (2 * v^2 * cos^2(elev))
    v^2 = g * D^2 / (2 * cos^2(elev) * (D * tan(elev) - dh))

O denominador tem de ser positivo — `D * tan(elev) > dh` — senão o ângulo não
chega para o alvo (alvo alto, ângulo baixo). Nesse caso sobe-se o ângulo em
passos até haver solução; se nem no tecto houver, devolve `null` e quem chama
que decida (o `lancarLateral` cai na fórmula de alcance de sempre).

Devolve `{ v, elev }`: o ângulo pode não ser o pedido.

Pura: sem Match, sem THREE, sem Math.random.
*/
function velocidadeDeLancamento(distancia, alturaSaida, alturaAlvo, elev, gravidade, elevMaxRad) {
    const D = distancia;
    if (!(D > 0.01)) return null;

    const g = (typeof gravidade === 'number') ? gravidade : 9.81;
    const tecto = (typeof elevMaxRad === 'number') ? elevMaxRad : (75 * Math.PI / 180);
    const dh = alturaAlvo - alturaSaida;

    // 12 passos até ao tecto: fino que chegue para não saltar por cima de uma
    // solução, barato que chegue para correr num lançamento.
    const PASSOS = 12;
    let ang = elev;
    for (let i = 0; i <= PASSOS; i++) {
        const c = Math.cos(ang);
        const denom = 2 * c * c * (D * Math.tan(ang) - dh);
        if (denom > 1e-6) {
            const v2 = (g * D * D) / denom;
            if (v2 > 0 && isFinite(v2)) return { v: Math.sqrt(v2), elev: ang };
        }
        if (ang >= tecto) break;
        ang = Math.min(tecto, ang + (tecto - elev) / PASSOS);
    }
    return null;
}

/*
=============================================================================
O SECTOR DA FALTA — que desenho a equipa faz
=============================================================================
A `decisaoDeFalta` diz o que a BOLA vai fazer; isto diz onde a EQUIPA se põe.
São coisas diferentes e tinham de ser duas funções, mas não podem discordar:
no terço ofensivo o sector segue a decisão, senão o desenho dizia "cruzamento"
com a bola a ir à baliza.

A unidade é o AVANÇO (`bolaZ * attDir`, medido do meio-campo), a mesma do
`barreiraZonaZ` e do `zonaDeArea`. Ver FreeKickModel.setores.

    defesa          terço defensivo próprio
    meio_recuado    meio-campo, ainda no campo próprio
    meio_avancado   meio-campo, já no campo adversário
    ataque_lateral  terço ofensivo, ao lado da área   -> cruzamento
    ataque_entrada  terço ofensivo, de frente         -> cobrança directa
*/
function setorDaFalta(bolaX, bolaZ, attDir, decisao) {
    const F = FreeKickModel;
    const S = F.setores;
    const avanco = bolaZ * attDir;

    if (avanco >= S.tercoOfensivo) {
        /*
        No terço ofensivo manda a decisão: se a bola vai à baliza é cobrança
        directa (os centrais ficam atrás), se vai cruzada é o desenho de área.
        O `passe` daqui é raro — sai do trapézio e da zona de cruzamento ao
        mesmo tempo — e trata-se como cobrança directa, que é o desenho mais
        prudente dos dois.
        */
        const d = decisao || decisaoDeFalta(bolaX, bolaZ, attDir);
        return (d === 'cruzamento') ? 'ataque_lateral' : 'ataque_entrada';
    }
    if (avanco >= S.meioCampo) return 'meio_avancado';
    if (avanco >= S.tercoDefensivo) return 'meio_recuado';
    return 'defesa';
}

/*
O grupo de posicionamento de uma posição. Não é o `role`: um lateral e um
central são os dois `role: 'def'` e numa bola parada não fazem a mesma coisa —
o central sobe para cabecear e o lateral bate ou fica de segurança.
*/
function grupoNaBolaParada(pos) {
    if (pos === 'CB') return 'cb';
    if (pos === 'LB' || pos === 'RB') return 'lat';
    if (pos === 'DM' || pos === 'CM' || pos === 'AM') return 'mc';
    if (pos === 'LM' || pos === 'RM' || pos === 'LW' || pos === 'RW') return 'ml';
    return 'ata';
}

/*
QUEM BATE A FALTA. Ver FreeKickModel.batedorPorSetor.

Era o mais PERTO da bola, e por isso a cobrança calhava a quem a jogada tinha
deixado ali — um central a bater uma falta na entrada da área adversária. Agora
sai do critério do sector, e o desempate é sempre a Técnica.

`skillDe` é injectado (o `skillFor` do jogador) para a função ser testável sem
o resto do jogo.
*/
function batedorDaFalta(candidatos, criterio, skillDe) {
    const tec = (p) => skillDe ? skillDe(p) : (p.skillFor ? p.skillFor('TEC') : 0);
    const melhorDe = (lista) => {
        let melhor = null, nota = -Infinity;
        for (const p of lista) {
            const t = tec(p);
            if (t > nota) { nota = t; melhor = p; }
        }
        return melhor;
    };

    const semGk = candidatos.filter(p => p.role !== 'gk');
    if (!semGk.length) return null;

    if (criterio === 'central') {
        // ZAGUEIRO, não um defensor qualquer: o lateral é `role: 'def'` e
        // sem esta distinção a falta na própria defesa saía batida por ele.
        const centrais = semGk.filter(p => p.pos === 'CB');
        return melhorDe(centrais) ||
            melhorDe(semGk.filter(p => p.role === 'def')) || melhorDe(semGk);
    }
    if (criterio === 'def') {
        return melhorDe(semGk.filter(p => p.role === 'def')) || melhorDe(semGk);
    }
    if (criterio === 'lateral') {
        // O lateral do LADO da bola bate primeiro; sem laterais, o melhor
        // técnico não-defensor, que é a regra geral do ataque.
        const laterais = semGk.filter(p => p.pos === 'LB' || p.pos === 'RB');
        return melhorDe(laterais) ||
            melhorDe(semGk.filter(p => p.role !== 'def')) || melhorDe(semGk);
    }
    // 'naoDef'
    return melhorDe(semGk.filter(p => p.role !== 'def')) || melhorDe(semGk);
}

/*
OS LUGARES DA EQUIPA QUE COBRA, para um sector. Geometria pura: recebe a bola,
a direcção de ataque e a lista de quem colocar, devolve um ponto por jogador.
Fica aqui e não no `setupSetPiece` para se poder medir e testar sem montar um
jogo inteiro.

Devolve `[{ p, x, z }]`. Quem não tiver lugar no desenho do sector não vem na
lista — o chamador deixa-o onde está.
*/
function lugaresDaFalta(bolaX, bolaZ, attDir, jogadores, setor) {
    const F = FreeKickModel;
    const desenho = F.formacaoPorSetor[setor];
    if (!desenho) return [];

    const linhaFundo = attDir * (CAMPO_COMP / 2);
    const lado = Math.sign(bolaX) || 1;
    const limX = CAMPO_LARG / 2 - 2.0;
    const limZ = CAMPO_COMP / 2 - 2.0;
    const extra = F.espacamentoExtra || 4.5;

    // Agrupa por grupo de posicionamento.
    const grupos = {};
    for (const p of jogadores) {
        if (!p || p.role === 'gk') continue;
        const g = grupoNaBolaParada(p.pos);
        (grupos[g] = grupos[g] || []).push(p);
    }

    const saida = [];
    for (const g of Object.keys(grupos)) {
        const cfg = desenho[g];
        if (!cfg) continue;

        /*
        Ordena por x para os lugares saírem pela mesma ordem em que eles já
        estão na largura: sem isto o da esquerda ia para o lugar da direita e
        cruzavam-se a caminho.
        */
        const lista = grupos[g].slice().sort((a, b) => a.model.position.x - b.model.position.x);

        lista.forEach((p, i) => {
            let x, z;

            if (cfg.modo === 'baliza') {
                const n = cfg.slots.length;
                const slot = cfg.slots[Math.min(i, n - 1)];
                const sobra = Math.max(0, i - (n - 1));
                x = lado * slot.relX + sobra * extra * (i % 2 ? 1 : -1);
                z = linhaFundo - attDir * (slot.dist + sobra * 1.5);

            } else if (cfg.modo === 'apoio') {
                // Junto à bola: para o lado de onde ela está, e `dz` à frente.
                const sinal = (i % 2 === 0) ? -lado : lado;
                x = bolaX + sinal * (cfg.dx + Math.floor(i / 2) * extra);
                z = bolaZ + attDir * cfg.dz;

            } else {
                const xs = cfg.xs || [0];
                const n = xs.length;
                const base = xs[Math.min(i, n - 1)];
                const sobra = Math.max(0, i - (n - 1));
                x = base + sobra * extra * (base >= 0 ? 1 : -1);
                z = bolaZ + attDir * cfg.avanco;
            }

            saida.push({
                p: p,
                x: Math.max(-limX, Math.min(limX, x)),
                z: Math.max(-limZ, Math.min(limZ, z))
            });
        });
    }
    return saida;
}

/*
O QUE SE FAZ COM UMA FALTA, a partir de onde a bola está.

Três casos, e a ordem entre eles importa — o trapézio de remate ganha sempre:

  'remate'      dentro do TRAPÉZIO de remate directo: até `remateDistMax` do
                centro da baliza E dentro das rectas que saem dos POSTES a
                `remateAnguloTrave` da PERPENDICULAR à linha de fundo. A base
                menor do trapézio é a própria baliza, e ele abre com a
                distância: a 23 m tem 7.32 + 2 × 23·tan(30°) = 34 m.

  'cruzamento'  ao lado da grande área e perto da linha de fundo — o
                "mini-canto". Cruza-se para a área como num canto curto.

  'passe'       tudo o resto: joga-se para o melhor colega posicionado.

Trabalha em profundidade `dFundo` (metros da linha de fundo atacada, sempre
positiva) para não depender do sinal do ataque.

Pura: sem Match, sem THREE.
*/
function decisaoDeFalta(bolaX, bolaZ, attDir) {
    const F = FreeKickModel;
    const linhaFundo = attDir * (CAMPO_COMP / 2);
    const dFundo = Math.abs(linhaFundo - bolaZ);
    const ax = Math.abs(bolaX);

    // 1 — trapézio de remate directo.
    const meiaBaliza = LARGURA_BALIZA / 2;
    const distCentro = Math.hypot(bolaX, dFundo);
    const meiaLarguraNoZ = meiaBaliza + dFundo * Math.tan(F.remateAnguloTrave);
    if (distCentro <= F.remateDistMax && ax <= meiaLarguraNoZ) return 'remate';

    // 2 — mini-canto: ao lado da área e perto da linha de fundo.
    if (ax >= F.miniCornerXMin && dFundo <= F.miniCornerProfundidade) return 'cruzamento';

    /*
    2b — FALTA LATERAL JUNTO À ÁREA. Mais para dentro e mais funda do que o
    mini-canto: `cruzXMin` do eixo para fora, até `cruzProfundidade` da linha de
    fundo. Vem depois do trapézio, portanto de frente continua a rematar-se.

    Sem esta zona a falta a 14-20 m do eixo caía no ramo do passe e saía dali um
    passe curto para a frente — no sítio de onde, em campo, se cruza.
    */
    if (ax >= F.cruzXMin && dFundo <= F.cruzProfundidade) return 'cruzamento';

    // 3 — o resto.
    return 'passe';
}

/*
=============================================================================
O CRUZAMENTO DA FALTA LATERAL — quatro alvos
=============================================================================
Primeira trave, segunda trave, marca do penálti (os três pelo alto, para a
cabeça) e entrada da área a MEIA ALTURA, para quem chega a rematar de primeira.
Os alvos e as formas estão em `FreeKickModel.cruzamentos`.

Substituiu o `cruzamentoParaArea`: um alvo único, velocidade fixa de 24 m/s e
altura de saída fixa. Duas coisas que ele não fazia e que são a razão desta
função existir:

  - a ALTURA DE CHEGADA é o que se pede, não a força de saída. Uma bola para a
    cabeça e uma bola para o pé não se distinguem pela potência; distinguem-se
    pela altura a que passam no alvo. A velocidade sai daí, resolvida com
    arrasto no `velocidadeParaAlturaNoAlvo`;
  - o alvo é ESCOLHIDO e não sorteado às cegas: um cruzamento para a segunda
    trave sem ninguém na segunda trave é uma bola dada ao guarda-redes. O peso
    de cada alvo sobe quando lá está um companheiro.

`rnd` é injectado para a função ser pura e testável. `companheiros` é a lista
de colegas do batedor (sem ele e sem o guarda-redes).
*/
function cruzamentoDeFalta(bolaPos, dirZ, companheiros, rnd) {
    const r = rnd || Math.random;
    const F = FreeKickModel;
    const linhaFundo = dirZ * (CAMPO_COMP / 2);
    const lado = Math.sign(bolaPos.x) || 1;

    const pontoDe = (c) => ({
        x: lado * c.relX,
        z: linhaFundo - dirZ * c.dist
    });

    // Peso de cada alvo, com bónus por ter gente lá.
    const opcoes = F.cruzamentos.map(c => {
        const alvo = pontoDe(c);
        let peso = c.peso;
        if (companheiros && companheiros.length) {
            const temGente = companheiros.some(p => p && p.model &&
                Math.hypot(p.model.position.x - alvo.x, p.model.position.z - alvo.z) < F.raioCompanheiro);
            if (temGente) peso *= F.bonusCompanheiro;
        }
        return { c: c, alvo: alvo, peso: peso };
    });

    const total = opcoes.reduce((s, o) => s + o.peso, 0);
    let sorteio = r() * total;
    let escolhida = opcoes[opcoes.length - 1];
    for (const o of opcoes) { sorteio -= o.peso; if (sorteio <= 0) { escolhida = o; break; } }

    const c = escolhida.c;
    const varia = (F.variacaoAlvo || 0);
    const alvoX = escolhida.alvo.x + (r() * 2 - 1) * varia;
    const alvoZ = escolhida.alvo.z + (r() * 2 - 1) * varia * dirZ;

    let dx = alvoX - bolaPos.x;
    let dz = alvoZ - bolaPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return null;
    dx /= dist; dz /= dist;

    const v = velocidadeParaAlturaNoAlvo(dist, c.elevacao, c.altura);
    /*
    Sem solução: a bola não chega àquela altura àquela distância nem com o
    tecto de força. Não se inventa um cruzamento — quem chamou que trate isto
    como "não há cruzamento daqui".
    */
    if (v === null) return null;

    const horiz = v * Math.cos(c.elevacao);
    return {
        nome: c.nome,
        alvo: { x: alvoX, z: alvoZ },
        vel: { x: dx * horiz, y: v * Math.sin(c.elevacao), z: dz * horiz }
    };
}



/*
Quanto é que quem tem a bola está NAS LATERAIS DA ÁREA — 0 fora, 1 na zona
cheia junto à linha de fundo e encostado à linha lateral.

É a zona onde se cruza, e a mesma que dá os bónus de cruzamento
(`CrossModel.bonusLargura`/`bonusFundo`). Devolver uma FRACÇÃO e não um
booleano é de propósito: um degrau na decisão faz o jogador mudar de ideias de
um frame para o outro ao atravessar a fronteira.

    x     posição em X no mundo
    zDir  posição em Z no referencial de ataque (positivo = mais perto da
          baliza atacada)

Pura: sem Match, sem THREE.
*/
function zonaLateralDaArea(x, zDir) {
    const C = CrossModel;
    const ax = Math.abs(x);
    if (ax < C.alaX || zDir < C.zonaZ) return 0;

    const largura = Math.min(1, (ax - C.alaX) / Math.max(0.001, 28.0 - C.alaX));
    const fundo = Math.min(1, (zDir - C.zonaZ) / Math.max(0.001, C.fundoZ - C.zonaZ));

    // Precisa das duas coisas: estar na ala E estar adiantado. No meio-campo
    // encostado à linha não se cruza, faz-se o jogo.
    return Math.max(0, Math.min(1, largura * fundo));
}

/*
Dispersão angular de quem repõe um LATERAL, em radianos, a partir da TEC.

Porque não o `sigmaDePasse`: ele mistura PASS com TEC e aplica pressão e ângulo
do corpo. Num lateral nada disso se aplica — quem repõe está parado, fora do
campo, virado para dentro, e os adversários estão obrigados a
`ThrowInModel.afastaAdversarios` metros da bola. Sobra a técnica.

Pura: sem Math.random — a amostra é sorteada por quem chama (ver
amostraGaussiana).
*/
function sigmaDeLateral(tecSkill) {
    const T = ThrowInModel;
    const tec = Math.max(0, Math.min(100, tecSkill || 0)) / 100;
    return T.sigmaMin + (T.sigmaMax - T.sigmaMin) * (1 - tec);
}

/*
Onde a bola cai depois de uma matada no peito, em metros à frente do jogador.

Era um binário: o `venceuDuelo` sorteava bom/mau e a distância saía de duas
constantes fixas, 0.5 m ou 1.5 m. A técnica só mexia na probabilidade do
sorteio, e mesmo o caso bom largava a bola a meio metro — que não é "no pé".

Agora a TEC manda na distância, com dispersão à volta dela: técnico alto encosta
a bola ao pé, técnico fraco larga-a longe e disputável. O `gauss` é injectado
para a função ser pura e testável.
*/
function quedaNoPeito(tecSkill, gauss) {
    const B = BallControl;
    const tec = Math.max(0, Math.min(100, tecSkill || 0)) / 100;
    const base = B.peitoQuedaMax + (B.peitoQuedaMin - B.peitoQuedaMax) * tec;
    const dist = base * (1 + (gauss || 0) * B.sigmaQueda);
    return Math.max(B.peitoQuedaMin * 0.6, Math.min(B.peitoQuedaMax * 1.3, dist));
}

/*
Passe rasteiro: velocidade de saída para a bola percorrer `dist` metros e lá
chegar ainda com `vChegada` m/s (um passe tem de chegar jogável, não morto).

Aqui há fórmula fechada. A desaceleração no chão é `k·v² + μ·g` (arrasto mais
rolamento); integrando `v·dv / (k·v² + μ·g) = -dx`:

    v0 = √( ( (k·v1² + μ·g)·e^(2·k·x) − μ·g ) / k )
*/
function velocidadeRasteiraPara(dist, vChegada, opcoes) {
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

    /*
    O REFORCO DO CURTO NAO VALE PARA O LANCAMENTO.

    O `+ (12 - dist) * 0.18` existe para o passe AOS PES: uma bola de 3 m com a
    mesma chegada de uma de 20 sai a passo e parece que o jogador nao quis
    passar. Num lancamento nao faz sentido nenhum — o alvo JA e o espaco a
    frente de quem corre, e a bola chegar viva ali significa passar-lhe para
    la. Medido: com o reforco, um lancamento de 6 m parava 2.7 m depois do
    ponto; sem ele, 0.5 m.

    Quem chama passa `{ reforcoCurto: false }`. A omissao mantem o reforco,
    porque o caso comum e mesmo o passe aos pes.
    */
    const reforcoCurto = !(opcoes && opcoes.reforcoCurto === false);

    let vAlvo = vChegada;
    if (dist < 12.0) {
        if (reforcoCurto) vAlvo += (12.0 - dist) * 0.18;
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
ATÉ ONDE CHEGA UM PASSE RASTEIRO — a inversa do que está acima.

    d_max = ln( (k·vSaidaMax² + μg) / (k·v_alvo² + μg) ) / (2k)

Existe porque o tecto de 18.5 m/s do `velocidadeRasteiraPara` é SILENCIOSO:
pede-se 40 m, sai 18.5 m/s, e a bola morre aos ~30 m sem ninguém saber que o
passe já nascera curto. Medido em 1200 s: 13 dos 167 lançamentos rasteiros
pediam mais de 28 m, e ficaram em média 21.7 m aquém do ponto.

Quem chama compara a distância pedida com isto e manda a bola pelo AR quando
não cabe — ver o ramo do lançamento em executePassGameplay (fsm.js).

O `vChegada` tem de ser o mesmo com que o passe vai ser resolvido, senão as
duas contas discordam na fronteira.
*/
function alcanceRasteiroMaximo(vChegada, vSaidaMax) {
    const k = BallPhysics.kArrasto;
    const atrito = BallPhysics.atritoRolamento * BallPhysics.gravidade;
    const vMax = (typeof vSaidaMax === 'number') ? vSaidaMax : 18.5;

    /*
    O `vAlvo` decai com a distância no `velocidadeRasteiraPara` (piso 1.5), e
    é esse piso que dá o alcance máximo: qualquer distância grande o bastante
    para interessar aqui já está na zona do piso.
    */
    const vAlvo = Math.max(1.5, vChegada);

    const num = k * vMax * vMax + atrito;
    const den = k * vAlvo * vAlvo + atrito;
    if (!(num > den)) return 0;
    return Math.log(num / den) / (2 * k);
}

/*
=============================================================================
VELOCIDADE PARA PASSAR NO ALVO *A UMA ALTURA PEDIDA*
=============================================================================
CUIDADO COM O NOME: já existe um `velocidadeParaChegarA` neste ficheiro, e é
outra coisa — o passe RASTEIRO que chega ao destino com uma velocidade dada. Em
scripts clássicos a segunda declaração ganha, e chamar-lhes o mesmo nome fazia
esta função devolver silenciosamente o resultado da outra (medido: cruzamentos a
sair a 2.3 m/s, ou seja a bola a cair aos pés do batedor).

O `velocidadeParaAlcance` responde "que força põe a bola no CHÃO a `dist`". Não
serve para um cruzamento: um cruzamento não é para cair no relvado, é para
chegar à cabeça — ou, no caso da bola tensa para a entrada da área, à altura de
quem lhe vai bater de primeira.

Aqui fixa-se a elevação (é ela que dá a FORMA da bola: chapelada para a cabeça,
tensa para o remate) e procura-se a velocidade que a põe a `alturaChegada`
quando passa por `dist`. Bissecção sobre a mesma simulação com arrasto do
`velocidadeParaAlcance` — mais força, mais alta ela vem nessa distância, e a
monotonia é o que a bissecção precisa.

Devolve null se nem no tecto de velocidade se lá chega: é melhor não cruzar do
que cruzar com uma bola que não chega.
*/
function velocidadeParaAlturaNoAlvo(dist, elev, alturaChegada, y0) {
    const g = BallPhysics.gravidade;
    const k = BallPhysics.kArrasto;
    const startY = (typeof y0 === 'number') ? y0 : BallPhysics.raio;

    // Altura ao passar por `dist`, para uma dada velocidade de saída.
    const alturaEm = (v) => {
        let x = 0, y = startY;
        let vx = v * Math.cos(elev), vy = v * Math.sin(elev);
        const dt = 1 / 120;
        for (let i = 0; i < 900; i++) {
            const s = Math.hypot(vx, vy);
            if (s > 0.001) { const dv = k * s * s * dt; vx -= vx / s * dv; vy -= vy / s * dv; }
            vy -= g * dt;
            const xAnt = x, yAnt = y;
            x += vx * dt; y += vy * dt;
            if (x >= dist) {
                const f = (dist - xAnt) / Math.max(1e-6, x - xAnt);
                return yAnt + (y - yAnt) * f;
            }
            if (y < -2) return -Infinity;   // enterrou antes de lá chegar
        }
        return -Infinity;
    };

    let lo = 1.0, hi = 45.0;
    if (alturaEm(hi) < alturaChegada) return null;
    for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (alturaEm(mid) < alturaChegada) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

/*
=============================================================================
PASSE DE ENCONTRO — a bola e o receptor no mesmo ponto, ao mesmo tempo
=============================================================================
O passe aos pés funcionava e o passe no espaço não, e a razão é sempre a
mesma: a força saía SÓ da distância. `velocidadeRasteiraPara(dist, vChegada)`
responde "que velocidade põe a bola ali ainda jogável" e ignora QUANDO é que
o companheiro lá chega. Num passe aos pés isso não se nota — o alvo é ele, e
ele já lá está. Num lançamento o alvo está 10-15 m à frente dele, e a bola
chegava lá 1.5 s antes, parava, e ele corria atrás de uma bola morta; ou
chegava viva de mais e passava-lhe pela frente.

O que falta é resolver o ENCONTRO, e é isso que estas quatro funções fazem:

    tempoRasteiroDaBola(d, v0)      quanto tempo a bola leva a percorrer d
    velocidadeRasteiraEmTempo(d, T) a saída que a faz demorar T
    velocidadeDeChegadaRasteira     com que velocidade ela lá chega
    tempoDoJogadorAte(...)          quanto tempo o receptor leva ao ponto

A física rasteira já estava escrita no `velocidadeRasteiraPara`: arrasto
quadrático mais atrito de rolamento,

    dv/dt = −(k·v² + a),    a = μ·g

que tem solução fechada. Com V = √(a/k) e w = √(k·a):

    v(t) = V·tan( atan(v0/V) − w·t )
    v(d)² = ((k·v0² + a)·e^(−2kd) − a) / k        (o mesmo do velocidadeRasteiraPara)
    t(d)  = ( atan(v0/V) − atan(v(d)/V) ) / w

Ou seja o tempo sai exacto, sem integrar frame a frame.
=============================================================================
*/

/*
Velocidade da bola DEPOIS de percorrer `dist` no chão, partindo a `v0`.
Devolve 0 quando ela pára antes de lá chegar — é a resposta certa e é o que
o `tempoRasteiroDaBola` usa para dizer "nunca chega".
*/
function velocidadeDeChegadaRasteira(dist, v0) {
    const k = BallPhysics.kArrasto;
    const a = BallPhysics.atritoRolamento * BallPhysics.gravidade;
    const restante = (k * v0 * v0 + a) * Math.exp(-2 * k * Math.max(0, dist)) - a;
    return (restante <= 0) ? 0 : Math.sqrt(restante / k);
}

/*
Inverso EXACTO do anterior: a saída que põe a bola a `vChegada` ao fim de
`dist`.

    v0 = √( ((k·v_ch² + a)·e^(2kd) − a) / k )

Não é o mesmo que `velocidadeRasteiraPara`: essa mexe no alvo antes de
inverter (reforça o passe curto, amansa o longo — regras de JOGO, não de
física), e por isso um pedido de 3 m/s aos 28 m sai a 1.5. Aqui pede-se o
número e recebe-se o número, que é o que o encontro precisa para os seus
tectos e pisos valerem mesmo.
*/
function velocidadeParaChegarA(dist, vChegada, vSaidaMax) {
    const k = BallPhysics.kArrasto;
    const a = BallPhysics.atritoRolamento * BallPhysics.gravidade;
    const v = Math.max(0, vChegada);
    const bruto = ((k * v * v + a) * Math.exp(2 * k * Math.max(0, dist)) - a) / k;
    const tecto = (typeof vSaidaMax === 'number') ? vSaidaMax : 18.5;
    return Math.min(tecto, Math.sqrt(Math.max(0, bruto)));
}

/*
Tempo que a bola leva a percorrer `dist` rasteira. `null` se ela morrer pelo
caminho — quem chama tem de tratar isso como "força insuficiente", não como
tempo infinito.
*/
function tempoRasteiroDaBola(dist, v0) {
    dist = Math.max(0, dist);
    if (dist < 0.001) return 0;
    if (v0 <= 0) return null;

    const k = BallPhysics.kArrasto;
    const a = BallPhysics.atritoRolamento * BallPhysics.gravidade;
    const V = Math.sqrt(a / k);
    const w = Math.sqrt(k * a);

    const vd = velocidadeDeChegadaRasteira(dist, v0);
    if (vd <= 0) return null;

    return (Math.atan(v0 / V) - Math.atan(vd / V)) / w;
}

/*
Inverso do anterior: a velocidade de SAÍDA que faz a bola demorar `tempo` a
percorrer `dist`.

Por bissecção e não por fórmula: `t(d, v0)` é monótona decrescente em v0 (mais
força, menos tempo) mas não se inverte em forma fechada — o `atan` do tempo e
o `exp` da distância não se separam. Trinta iterações num intervalo de 0.5 a
30 m/s dão precisão de ~3e-8 m/s, e isto corre uma vez por passe.
*/
function velocidadeRasteiraEmTempo(dist, tempo, vMax) {
    const tecto = (typeof vMax === 'number') ? vMax : 30.0;
    dist = Math.max(0, dist);
    if (dist < 0.001 || !(tempo > 0)) return tecto;

    let lo = 0.5, hi = tecto;

    // Nem à força toda chega a tempo: devolve o melhor que consegue.
    const tMin = tempoRasteiroDaBola(dist, hi);
    if (tMin === null || tMin >= tempo) return hi;

    for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const t = tempoRasteiroDaBola(dist, mid);
        // `null` = morre pelo caminho, que conta como demorar demais.
        if (t === null || t > tempo) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

/*
Tempo que um jogador leva a percorrer `dist` até ao ponto de encontro.

O modelo é o do próprio `steerArrive`: a velocidade persegue a desejada por
lerp exponencial (`velocity.lerp(desired, 5*dt)`), o que dá

    v(t) = vMax + (v0 − vMax)·e^(−t/tau),   tau = 1/5 s
    x(t) = vMax·t − tau·(vMax − v0)·(1 − e^(−t/tau))

Usar `dist / vMax` em vez disto parece igual e não é: quem está PARADO perde
~0.2 s no arranque, e num lançamento 0.2 s são 2 m de bola.

`v0` é a componente da velocidade dele NA DIRECÇÃO do ponto — quem corre para
o lado contrário tem de inverter primeiro, e isso é tempo.
*/
function tempoDoJogadorAte(dist, v0, vMax, tau) {
    dist = Math.max(0, dist);
    if (dist < 0.001) return 0;
    vMax = Math.max(0.1, vMax);
    tau = (typeof tau === 'number') ? tau : 0.2;
    v0 = Math.max(-vMax, Math.min(vMax, v0 || 0));

    const x = (t) => vMax * t - tau * (vMax - v0) * (1 - Math.exp(-t / tau));

    // Tecto generoso: a distância a dividir pela velocidade, mais o arranque.
    let lo = 0, hi = dist / vMax + 4 * tau + 0.5;
    for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (x(mid) < dist) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

/*
Tempo de voo de um passe pelo alto que cai a `dist`, saído com a elevação
`elev`. A velocidade sai da mesma balística do passe (velocidadeParaAlcance),
e o tempo é o do tiro: t = 2·v·sen(elev)/g.
*/
function tempoDeVooDoPasse(dist, elev) {
    const v = velocidadeParaAlcance(dist, elev);
    return (2 * v * Math.sin(elev)) / BallPhysics.gravidade;
}

/*
ELEVAÇÃO QUE FAZ O PASSE DEMORAR O TEMPO PEDIDO.

O alcance é o mesmo para duas elevações diferentes — uma rasa e rápida, outra
alta e lenta. É essa liberdade que se usa aqui: em vez de mudar o sítio onde a
bola cai (isso estragava o passe), muda-se QUANTO TEMPO ela demora a lá chegar,
para chegar quando o companheiro chega.

Monótona em `elev` dentro dos limites — mais ângulo, mais tempo de voo —, por
isso bissecção. Se nem no extremo se consegue o tempo pedido, devolve o extremo
mais próximo: melhor um passe um pouco fora de tempo do que um passe fora do
sítio.
*/
function elevacaoParaTempoDeVoo(dist, tempoAlvo, elevMin, elevMax) {
    let lo = (typeof elevMin === 'number') ? elevMin : THREE.MathUtils.degToRad(12);
    let hi = (typeof elevMax === 'number') ? elevMax : THREE.MathUtils.degToRad(55);
    if (!(tempoAlvo > 0)) return lo;

    if (tempoDeVooDoPasse(dist, lo) >= tempoAlvo) return lo;
    if (tempoDeVooDoPasse(dist, hi) <= tempoAlvo) return hi;

    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (tempoDeVooDoPasse(dist, mid) < tempoAlvo) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

/*
O PASSE DE ENCONTRO propriamente dito: junta as quatro contas e devolve a
velocidade de saída rasteira.

    distBola        da bola ao ponto de encontro
    distReceptor    do receptor ao MESMO ponto
    vReceptor       velocidade dele na direcção do ponto (pode ser negativa)
    vMaxReceptor    a que ele corre

Duas condições, e a segunda é a que o utilizador pediu:

  1. a bola chega ao ponto quando ele chega (mais `folgaTempo`, para ele
     chegar primeiro e não ter de travar);
  2. e chega mais DEVAGAR do que ele corre (`fracVelReceptor`) — uma bola que
     lá chega a 14 m/s com ele a 7 passa-lhe pela frente por muito bem
     sincronizada que esteja.

Quando as duas se mordem, manda a segunda: mais vale a bola esperar meio
segundo por ele do que fugir-lhe. O piso `vChegadaMin` existe para o caso
oposto — não deixar a bola morrer antes do ponto.

Devolve `{ v0, vChegada, tempoBola, tempoReceptor, limitada }`.
*/
function passeDeEncontro(o) {
    const E = (typeof PassModel !== 'undefined' && PassModel.encontro)
        ? PassModel.encontro : {};
    const folga = (typeof E.folgaTempo === 'number') ? E.folgaTempo : 0.15;
    const frac = (typeof E.fracVelReceptor === 'number') ? E.fracVelReceptor : 0.85;
    const vMin = (typeof E.vChegadaMin === 'number') ? E.vChegadaMin : 3.5;
    const vMaxChegada = (typeof E.vChegadaMax === 'number') ? E.vChegadaMax : 11.0;
    const vSaidaMax = (typeof E.vSaidaMax === 'number') ? E.vSaidaMax : 18.5;

    const distBola = Math.max(0.5, o.distBola || 0);
    const vMaxRec = Math.max(1.0, o.vMaxReceptor || 6.0);

    const tempoReceptor = tempoDoJogadorAte(
        o.distReceptor || 0, o.vReceptor || 0, vMaxRec, o.tau);

    // 1 — a que chega a tempo.
    let v0 = velocidadeRasteiraEmTempo(distBola, tempoReceptor + folga, vSaidaMax);

    /*
    2 — TECTO DA CHEGADA, e o que conta é a velocidade RELATIVA.

    Estava em absoluto, e isso partia o passe longo: com um receptor a 6 m/s o
    tecto ficava em ~5 m/s, e para chegar a 5 m/s ao fim de 25 m a bola tem de
    sair mansa. Medido em jogo: 2.38 s de voo para 25 m, com o homem a chegar
    ao ponto em menos de 1 s — a bola ia tão devagar que era interceptada a
    meio caminho. 60% dos passes no espaço acabavam cortados.

    Quem recebe está a CORRER NO SENTIDO DA BOLA. Uma bola a 11 m/s apanhada
    por quem corre a 6 chega-lhe com 5 m/s relativos, e é isso que ele tem de
    dominar. O tecto é sobre a velocidade relativa, não sobre a do relvado.
    */
    const vRecNoPasse = (typeof o.vReceptorNoPasse === 'number') ? o.vReceptorNoPasse : 0;
    const tectoChegada = Math.min(vMaxChegada, Math.max(vMin, vMaxRec * frac));
    let vChegada = velocidadeDeChegadaRasteira(distBola, v0);
    let limitada = false;

    if (vChegada - vRecNoPasse > tectoChegada) {
        v0 = velocidadeParaChegarA(distBola, tectoChegada + vRecNoPasse, vSaidaMax);
        vChegada = velocidadeDeChegadaRasteira(distBola, v0);
        limitada = true;
    } else if (vChegada < vMin) {
        // Bola a morrer antes do ponto: garante-lhe pelo menos o piso.
        v0 = velocidadeParaChegarA(distBola, vMin, vSaidaMax);
        vChegada = velocidadeDeChegadaRasteira(distBola, v0);
        limitada = true;
    }

    const tempoBola = tempoRasteiroDaBola(distBola, v0);
    return { v0: v0, vChegada: vChegada, tempoBola: tempoBola,
        tempoReceptor: tempoReceptor, limitada: limitada };
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
        /*
        O tecto de altura da banda continua a mandar na FORMA, mas o ângulo
        fica dentro da faixa de um passe (25°-35°, ver passeArco.elevMin/Max).
        O tecto anterior eram 60°: um passe de 21 m pela banda dos 4.2 m saía
        a 38.7°, com a parábola de um chutão.
        */
        /*
        O piso é o `elevMinBaixa` e não o `elevMin`: com o tecto do peito
        (1.20 m) um passe de 20 m pede 13.5°, e subi-lo aos 25° punha a bola a
        2.33 m de apex — ou seja, o tecto da banda deixava de valer. Ver
        passeArco.elevMinBaixa.
        */
        const piso = (typeof B.elevMinBaixa === 'number') ? B.elevMinBaixa : B.elevMin;
        return THREE.MathUtils.clamp(
            Math.atan(4 * alturaMax / dist), piso, B.elevMax);
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
function elevacaoParaAlvo(distH, altura, v, y0) {
    const g = BallPhysics.gravidade;
    const k = BallPhysics.kArrasto;
    const startY = (typeof y0 === 'number') ? y0 : BallPhysics.raio;

    // Altura da bola ao passar por distH, para uma dada elevação.
    const alturaEm = (elev) => {
        let x = 0, y = startY;
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
    let lo = (startY > 0.5 ? -0.85 : -0.15), hi = Math.PI / 4;
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

        /*
        O QUIQUE. Isto era `{ y = B.raio; vy = 0; }` — para a previsão, o
        relvado absorvia tudo e a bola passava a rolar dali em diante. O
        updateBall real ressalta (`restituicao`), perde velocidade horizontal
        no embate (`atritoRessalto`) e só depois trava a rolar
        (`atritoRolamento`). Resultado: o jogador corria para onde a previsão
        dizia, a bola quicava e passava-lhe por cima.

        Agora é a MESMA física do jogo, passo a passo — ver o bloco do solo em
        Match.updateBall. Se um dia mudar lá, tem de mudar aqui.
        */
        if (y <= B.raio) {
            y = B.raio;
            if (vy < 0) {
                if (-vy > B.vMinRessalto) {
                    vy *= -B.restituicao;
                    vx *= B.atritoRessalto;
                    vz *= B.atritoRessalto;
                } else {
                    vy = 0;
                }
            }
            const vh = Math.hypot(vx, vz);
            if (vh > 0.0001) {
                const dvh = Math.min(vh, B.atritoRolamento * B.gravidade * dt);
                vx -= (vx / vh) * dvh;
                vz -= (vz / vh) * dvh;
                if (Math.hypot(vx, vz) < B.vMinRolar && vy === 0) { vx = 0; vz = 0; }
            }
        }
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
        /*
        A bola tocou no chão antes de cruzar esta altura em descida. NÃO se
        desiste aqui: ela ressalta e volta a passar por esta altura, e é essa
        a bola que se cabeceia ou se domina no peito. Antes devolvia null e o
        jogador ignorava tudo o que viesse depois do primeiro toque no relvado.
        */
        if (y <= B.raio) {
            y = B.raio;
            if (vy < 0) {
                if (-vy > B.vMinRessalto) {
                    vy *= -B.restituicao;
                    vx *= B.atritoRessalto;
                    vz *= B.atritoRessalto;
                } else {
                    // Já não salta: nunca mais chega a essa altura.
                    return null;
                }
            }
            const vh = Math.hypot(vx, vz);
            if (vh > 0.0001) {
                const dvh = Math.min(vh, B.atritoRolamento * B.gravidade * dt);
                vx -= (vx / vh) * dvh;
                vz -= (vz / vh) * dvh;
            }
        }
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
/*
Este jogador está em posição de finalizar?

O mesmo teste geométrico do `emZonaDeRemate` do BT (distância ao centro da
baliza dentro do `shootingRange()` dele, e ângulo dentro de
`ShootingModel.maxOffsetX`), sem a parte de zona/grelha — aqui não interessa
decidir SE remata, só saber que a bola não deve ser adiantada dali.

Usado pelo toque do CARRY (fsm.js): dentro desta zona a bola fica no pé, para
o ramo `Rematar` a poder usar. Sem isto, o portador chegava à frente do
guarda-redes e continuava a tocar para a frente — e como o GK está fora da
contagem de adversários do toque, o toque saía LONGO (2.8 m) e punha a bola
fora pela linha de fundo.
*/
function emZonaDeFinalizacao(p) {
    if (!p || !p.model || typeof p.shootingRange !== 'function') return false;
    if (typeof ShootingModel === 'undefined') return false;
    const dx = p.model.position.x;
    const dz = p.targetGoalZ - p.model.position.z;
    return Math.hypot(dx, dz) < p.shootingRange() &&
        Math.abs(dx) < ShootingModel.maxOffsetX;
}

/*
O MAIOR TOQUE QUE ELE AINDA GANHA.

Recebe o toque que as faixas de distância escolheram e devolve o maior toque
(dessa lista para baixo) que o portador ainda alcança antes de qualquer
adversário. Se nenhum serve, devolve 0 — e 0 quer dizer "não toques, leva a
bola no pé".

A conta, por candidato:

    ponto  = posição + direcção * lead
    tMeu   = √(2·lead / a)                          (a = μ·g, travagem a rolar)
    tDele  = distância(adversário, ponto) / velAdversarioDisputa

    serve se  tMeu + margem < tDele

`tMeu` NÃO é `lead / velocidade`: o portador não chega ao ponto quando lá
chegaria a correr, chega quando a bola lá está — e a bola vai à frente e
desacelera. O afastamento é máximo em t = u/a com u = √(2·a·lead), o que dá
√(2·lead/a). Com a = 3.73 m/s²: um toque de 2.8 m demora 1.22 s a fechar, um
de 0.96 m demora 0.72 s. Usar `lead / velocidade` (0.43 s e 0.15 s) fazia a
validação passar quase sempre — media o corredor, não a disputa.

O guarda-redes CONTA aqui, ao contrário do que acontece na escolha da faixa
(onde é excluído para não disparar o drible 1v1 contra ele): à frente da baliza
é ele quem chega à bola adiantada, e ignorá-lo era o que dava o toque longo por
cima do guardião.

Pura de propósito: sem Match, sem THREE — recebe listas de {x, z}.
*/
function maiorToqueSeguro(px, pz, dirX, dirZ, velPortador, leadInicial, adversarios) {
    const C = CarryModel;
    const vAdv = C.velAdversarioDisputa || 7.0;
    const margem = C.margemDisputa || 0.15;
    const a = BallPhysics.atritoRolamento * BallPhysics.gravidade;

    const candidatos = [leadInicial, C.touchMedium, C.touchShort, C.touchShort * 0.5]
        .filter(l => l > 0 && l <= leadInicial);

    for (const lead of candidatos) {
        const ax = px + dirX * lead;
        const az = pz + dirZ * lead;
        const tMeu = Math.sqrt(2 * lead / a);

        let seguro = true;
        for (let i = 0; i < adversarios.length; i++) {
            const o = adversarios[i];
            const tDele = Math.hypot(o.x - ax, o.z - az) / vAdv;
            if (tMeu + margem >= tDele) { seguro = false; break; }
        }
        if (seguro) return lead;
    }
    return 0;
}

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
        const dx = pos.x - Match.ball.position.x;
        const dz = pos.z - Match.ball.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        // Até 4m: Passe direto (muito perto para leading significativo)
        if (dist <= 4.0) {
            return pos;
        }

        /*
        Estimativa da velocidade média horizontal do passe, por distância.
        O valor fixo de 16.8 era uma média que falhava nos dois extremos:
        passes rasteiros curtos são mais lentos, e os arcos de 15-30 m são
        consideravelmente mais rápidos. Usar a velocidade certa faz o ponto de
        encontro cair onde o receptor realmente alcança a bola.
        */
        let vBall;
        if (dist <= 15.0) {
            vBall = 12.0;
        } else if (dist <= 30.0) {
            vBall = 22.0 - (dist - 15.0) * (22.0 - 18.0) / 15.0;
        } else {
            vBall = Math.max(16.0, 18.0 - (dist - 30.0) * (18.0 - 16.0) / 30.0);
        }
        
        let currentSpeed = p.velocity.length();
        let vx = 0;
        let vz = 0;

        if (currentSpeed > 0.1) {
            // Em vez de usar 85% da velocidade atual de forma fixa, 
            // baseamos na velocidade MÁXIMA individual do jogador (p.speedMult).
            // Assumimos que ele corre a ~90% do seu máximo para chegar à bola em movimento.
            let futureSpeed = p.speedMult ? (p.speedMult * 0.9) : currentSpeed;
            
            // Para passes muito curtos, limitamos a aceleração para não haver "teletransporte" matemático
            if (dist < 15.0) {
                futureSpeed = Math.min(futureSpeed, currentSpeed + 1.5);
            }

            vx = (p.velocity.x / currentSpeed) * futureSpeed;
            vz = (p.velocity.z / currentSpeed) * futureSpeed;
        }

        const a = (vx * vx + vz * vz) - (vBall * vBall);
        const b = 2 * (dx * vx + dz * vz);
        const c = dist * dist;
        
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
            t = Math.min(dist / vBall, 3.0);
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
/*
ÂNGULO QUE A BALIZA SUBTENDE a partir de um ponto do campo, em radianos.

É a abertura entre os dois postes vista de onde se remata: o que fica para
acertar. Dois remates à mesma DISTÂNCIA podem ter ângulos muito diferentes —
12 m em frente à baliza contra 12 m junto à linha de fundo, onde a baliza é
uma fresta.

Calculado pelo produto escalar entre os vectores ponto->poste, e não por
diferença de `atan2`, que dava o ângulo errado (o reflexo, 2π menos este)
sempre que o ponto ficava entre os postes prolongados.

`golZ` é a linha de baliza que se ataca; a baliza está centrada em x = 0.

Pura: sem Match, sem THREE.
*/
function anguloDaBaliza(x, z, golZ, larguraBaliza) {
    const meia = larguraBaliza / 2;

    const ax = -meia - x, az = golZ - z;
    const bx = meia - x, bz = golZ - z;

    const na = Math.hypot(ax, az), nb = Math.hypot(bx, bz);
    if (na < 1e-6 || nb < 1e-6) return Math.PI;   // em cima de um poste

    let cos = (ax * bx + az * bz) / (na * nb);
    cos = Math.max(-1, Math.min(1, cos));
    return Math.acos(cos);
}

/*
xG DE UM REMATE — ver XGModel em config.js para o modelo e as âncoras.

Devolve 0..1. Pura: sem Match, sem THREE.
*/
function xgDoRemate(x, z, golZ, larguraBaliza, M) {
    const ang = Math.max(M.anguloMinimo,
        anguloDaBaliza(x, z, golZ, larguraBaliza));
    const dist = Math.hypot(x, golZ - z);

    const logit = M.base + M.pesoLogAngulo * Math.log(ang) - M.pesoDistancia * dist;
    return 1 / (1 + Math.exp(-logit));
}

/*
O PASSE JÁ MORREU PARA O DESTINATÁRIO?

`Match.intendedReceiver` é escrito quando o passe sai e limpo quando alguém
toca na bola. Enquanto ele existe, a bola NÃO conta como solta (ver `bolaSolta`
em pickChaser, bt/team_bt.js) e ninguém é mandado buscá-la — o que está certo
para um passe a decorrer e é um deadlock para um passe que morreu.

A versão anterior vivia inline no `updateBall` e tinha uma guarda fatal:

    if (alvo && this.ballVel.lengthSq() > 0.5) { ... }

Só expirava com a bola EM MOVIMENTO. Se ela parava longe do destinatário, a
condição nunca mais corria — porque era ela que poria a bola a mexer outra vez:

    bola pára longe -> intendedReceiver nunca limpo -> bolaSolta false
      -> ninguém vai à bola -> a bola continua parada

Medido: jogos inteiros mortos, com a bola imóvel a poucos metros da linha de
fundo e 22 jogadores no bloco. E o teste de "afasta-se dele?" não quer dizer
nada a velocidade zero: o produto escalar dá 0, que não é afastar nem aproximar.

Três casos, por esta ordem:

    perto           dentro de `distPerdido` — é dele, mesmo parada: o passe que
                    morre aos pés do receptor é um passe bem sucedido
    parada e longe  bola solta. Não está a caminho de ninguém
    a mexer e longe perdida só se se AFASTAR dele (o caso de sempre)

`paradaV2` é o quadrado da velocidade abaixo da qual se considera parada, e
mede as TRÊS componentes: um passe alto no topo do arco tem velocidade
horizontal quase nula e muito `y`, e chamar-lhe parada tirava o dono a uma bola
ainda a caminho.

Pura: sem Match, sem THREE.
*/
function passeMorreuParaODestinatario(o) {
    const dx = o.bolaX - o.alvoX;
    const dz = o.bolaZ - o.alvoZ;

    const vy0 = o.velY || 0;
    const parada = (o.velX * o.velX + o.velZ * o.velZ + vy0 * vy0) <= o.paradaV2;

    /*
    PERTO DELE, MAS PARADA HÁ MUITO TEMPO, também é passe morto.

    Este `return false` era incondicional: dentro de `distPerdido` o passe
    contava como entregue e a bola ficava presa ao destinatário para sempre.
    Se ele não lhe tocasse — parou à espera da queda, o alvo dele era outro
    ponto, alguém se meteu no meio — mais ninguém a ia buscar, porque o
    `bolaSolta` do deveMandarChaser exige `!intendedReceiver`. Resultado: bola
    quieta a poucos metros de três jogadores e o jogo à espera.

    `tempoParada` é opcional: sem ele o comportamento é o antigo.
    */
    if (Math.hypot(dx, dz) <= o.distPerdido) {
        if (parada && typeof o.tempoParada === 'number' &&
            typeof o.prazoParada === 'number' && o.tempoParada >= o.prazoParada) {
            return true;
        }
        return false;
    }

    const vy = o.velY || 0;
    const v2 = o.velX * o.velX + o.velZ * o.velZ + vy * vy;
    if (v2 <= o.paradaV2) return true;

    // Afasta-se dele? (a bola vai no sentido oposto ao alvo)
    return (o.velX * dx + o.velZ * dz) > 0;
}

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

/*
Verifica se não há marcação a maxDist (10 metros) à frente do jogador
num cone de maxAngleDeg (20 graus) para cada lado.
*/
function semMarcacaoAFrente(p, opps, maxDist = 10.0, maxAngleDeg = 20.0) {
    if (!p) return false;
    const maxAngleRad = (maxAngleDeg * Math.PI) / 180.0;
    const oppList = opps || ((typeof Match !== 'undefined') ? (p.team === 'TeamA' ? Match.opponents : Match.players) : []);
    const pPos = p.model ? p.model.position : p.position;
    if (!pPos) return true;

    for (const opp of oppList) {
        if (opp.role === 'gk') continue;
        const oPos = opp.model ? opp.model.position : opp.position;
        if (!oPos) continue;
        const dx = oPos.x - pPos.x;
        const dz = (oPos.z - pPos.z) * p.dirZ;
        if (dz <= 0) continue; // atrás da linha do jogador
        const dist = Math.hypot(dx, dz);
        if (dist > maxDist) continue;
        const angle = Math.atan2(Math.abs(dx), dz);
        if (angle <= maxAngleRad) {
            // Adversário marcando no cone frontal
            return false;
        }
    }
    return true;
}

/*
=============================================================================
DEFESA DO GUARDA-REDES — a decisão, num sítio só
=============================================================================
Ver o cabeçalho do GkCatchModel (config.js) para o porquê e para a fórmula.
Aqui é só a conta, pura e sem dependências do jogo, para poder ser medida
(tests/gk_defesa.test.js).

    tipo        'corpo' | 'maos' | 'salto' | 'mergulho'
    gk, tec     skills do guarda-redes
    vChegada    velocidade da bola no instante do toque (m/s)
    extensao    0 com a bola ao peito, 1 no limite do alcance da mão
    altura      metros acima do peito (0 se ao peito ou abaixo)
    rnd         injectável para os testes

Devolve `{ resultado, pAgarra, pRoca, qualidade }` com resultado em
'agarra' | 'espalma' | 'roca'.
*/
function resolverDefesaGK(o) {
    const M = GkCatchModel;
    const tipo = o.tipo || 'mergulho';
    const base = (M.base[tipo] !== undefined) ? M.base[tipo] : M.base.mergulho;

    const gk = (typeof o.gk === 'number') ? o.gk : 50;
    const tec = (typeof o.tec === 'number') ? o.tec : 50;
    const v = Math.max(0, o.vChegada || 0);
    const ext = Math.max(0, Math.min(1, o.extensao || 0));
    const alt = Math.max(0, o.altura || 0);

    let pAgarra = base
        + M.pesoGK * (gk - 50) / 50
        + M.pesoTEC * (tec - 50) / 50
        - M.custoVel * (v - M.vRef) / M.vRef
        - M.custoExtensao * ext
        - M.custoAltura * alt;
    pAgarra = Math.max(M.minAgarra, Math.min(M.maxAgarra, pAgarra));

    /*
    ROÇAR: só em bolas rápidas e esticadas. O `rocarPesoExt` reparte a culpa
    entre a velocidade e a extensão — uma bola a 26 m/s ao peito ainda se
    espalma; a mesma bola na ponta dos dedos é que passa.
    */
    const acimaDoMin = Math.min(1, Math.max(0, v - M.rocarVMin) / M.rocarEscalaV);
    /*
    O `rocarMax` entra como ESCALA e não como clamp. Como clamp, tudo o que
    fosse rápido e esticado saturava lá — e a redução por GK deixava de se
    ver: um guarda-redes de 90 roçava tanto como um de 50.
    */
    let pRoca = M.rocarMax
        * acimaDoMin
        * ((1 - M.rocarPesoExt) + M.rocarPesoExt * ext)
        * Math.max(0, 1 - M.rocarPorGK * (gk - 50) / 50);
    pRoca = Math.max(0, Math.min(M.rocarMax, pRoca));

    // O que sobra é espalmada. Se as duas primeiras já somam mais do que 1
    // (guarda-redes excelente contra bola muito rápida), o roçar cede.
    if (pAgarra + pRoca > 1) pRoca = Math.max(0, 1 - pAgarra);

    const r = (o.rnd === undefined) ? Math.random() : o.rnd;
    let resultado;
    if (r < pAgarra) resultado = 'agarra';
    else if (r < pAgarra + (1 - pAgarra - pRoca)) resultado = 'espalma';
    else resultado = 'roca';

    return {
        resultado: resultado,
        pAgarra: pAgarra,
        pRoca: pRoca,
        qualidade: qualidadeEspalmada(tec)
    };
}

/*
Qualidade da espalmada (0..1), pela TÉCNICA. É ela que decide PARA ONDE a bola
vai — ver `destinoDaEspalmada`.
*/
function qualidadeEspalmada(tec) {
    const M = GkCatchModel;
    const t = (typeof tec === 'number') ? tec : 50;
    return Math.max(0, Math.min(1,
        M.qualidadeBase + M.qualidadePorTEC * (t - 50) / 50));
}

/*
PARA ONDE VAI A ESPALMADA. Três destinos, e é isto que faz um rebote ler-se
como rebote e uma espalmada ler-se como espalmada:

    'canto'    para lá do poste ou do travessão — sai, dá canto. Só é opção
               quando a bola já ia colocada; não se manda ao canto uma bola
               que vem ao centro do peito.
    'lateral'  volta ao campo mas para longe do miolo, aberta.
    'meio'     rebote curto à frente da baliza, com o avançado a chegar. É o
               que um guarda-redes de técnica fraca faz.

O sorteio é uma escada na `qualidade`: técnica alta quase nunca larga a bola
no meio, técnica fraca quase nunca a tira do perigo. Devolve só o NOME do
destino — a geometria (postes, travessão) é de quem chama, que a conhece.
*/
function destinoDaEspalmada(o) {
    const qualidade = Math.max(0, Math.min(1, o.qualidade || 0));
    const podeSair = !!o.podeSair;
    const r = (o.rnd === undefined) ? Math.random() : o.rnd;

    if (podeSair && r < qualidade) return 'canto';
    // Sem saída possível, a mesma qualidade decide entre afastar e largar.
    if (r < qualidade) return 'lateral';
    return (r < qualidade + (1 - qualidade) * 0.5) ? 'lateral' : 'meio';
}

/*
=============================================================================
REMATE — tipo, mira e erro
=============================================================================
Ver o cabeçalho do bloco novo do ShotModel (config.js) para o porquê: o remate
passou a decidir a BOLA (que tipo, para que canto, com que erro) em vez de
sortear o desfecho e encenar uma trajectória que o produzisse.

Funções puras, sem tocar no jogo, para poderem ser varridas em teste
(tests/remate_tipo_mira.test.js).
*/

/*
TIPO DE REMATE. Testados por esta ordem — chapéu, rasteiro, colocado — e o que
sobra é força. `rnd` injectável (uma amostra só; a ordem é que reparte).
*/
function tipoDeRemate(o) {
    const E = ShotModel.escolha;
    const dist = o.dist || 0;
    const tec = (typeof o.tec === 'number') ? o.tec : 50;
    const distAdversario = (typeof o.distAdversario === 'number') ? o.distAdversario : 99;
    const gkAdiantado = o.gkAdiantado || 0;   // metros à frente da linha
    const r = (o.rnd === undefined) ? Math.random() : o.rnd;

    /*
    ACUMULADOR, e não três testes contra o mesmo `r`. Com testes
    independentes, uma opção mais abaixo na lista só saía na FRESTA que a de
    cima deixasse — o colocado, com 55% de chance nominal, aparecia em 20% dos
    remates porque o rasteiro já tinha ficado com tudo abaixo de 0.45.
    Somando as fatias, cada chance quer dizer o que diz.
    */
    let acc = 0;

    // Chapéu: só com o guarda-redes fora da linha, e a uma distância que dê
    // para o passar por cima e ainda descer a tempo.
    if (gkAdiantado >= E.chapeuGkAdiantado &&
        dist >= E.chapeuDistMin && dist <= E.chapeuDistMax) {
        acc += E.chanceChapeu;
        if (r < acc) return 'chapeu';
    }

    // Rasteiro ao canto: mais provável de perto, onde levantar a bola é
    // desperdiçar baliza.
    acc += (dist <= E.distPerto) ? E.chanceRasteiraPerto : E.chanceRasteiraLonge;
    if (r < acc) return 'rasteiro';

    /*
    Colocado precisa de tempo e de pé: cai sob pressão e não existe de longe.
    A técnica é o que o torna uma opção — um TEC 20 não coloca, atira.
    */
    if (dist <= E.colocadoDistMax && distAdversario > E.colocadoPressao) {
        acc += E.chanceColocado * (0.5 + (tec / 100));
        if (r < acc) return 'colocado';
    }

    return 'forca';
}

/*
PONTO MIRADO, no plano da baliza. O canto é o mais LONGE do guarda-redes —
`gkX` é a posição dele em X. Devolve `{ x, y }` em metros.

O ponto mirado é SEMPRE golo (fica `margemPoste` para dentro do poste): o que
decide o desfecho é o erro que se soma por cima, não a mira.
*/
function miraDeRemate(o) {
    const MI = ShotModel.mira;
    const tipo = o.tipo || 'forca';
    const maxC = (LARGURA_BALIZA / 2) - MI.margemPoste;
    const gkX = (typeof o.gkX === 'number') ? o.gkX : 0;
    const r = (o.rnd === undefined) ? Math.random() : o.rnd;

    // Lado oposto ao guarda-redes; com ele ao meio, à sorte.
    let lado;
    if (Math.abs(gkX) > MI.gkCentradoMax) lado = -Math.sign(gkX);
    else lado = (r < 0.5) ? -1 : 1;

    let y;
    if (tipo === 'rasteiro') y = MI.alturaRasteira;
    else if (tipo === 'chapeu') y = MI.alturaChapeu;
    else if (tipo === 'colocado') y = (r < 0.5) ? MI.alturaRasteira + 0.25 : MI.alturaAlta;
    else y = (r < 0.5) ? MI.alturaMeia : MI.alturaAlta;

    // O chapéu não vai ao canto: vai por cima dele, ao centro da baliza.
    const x = (tipo === 'chapeu') ? lado * maxC * 0.35 : lado * maxC;
    return { x: x, y: y, lado: lado };
}

/*
SIGMA DA MIRA, em metros no plano da baliza. Devolve `{ lateral, vertical }`.

É isto que produz golos, traves e bolas por cima — sem tabela de desfechos.
Cresce com a distância, com a pressão e com o ângulo fechado; cai com a
técnica e com o tipo de remate escolhido (colocar é mais preciso do que bater).
*/
function sigmaDeRemate(o) {
    const E = ShotModel.erro;
    const dist = Math.max(0, o.dist || 0);
    const tec = (typeof o.tec === 'number') ? o.tec : 50;
    const distAdversario = (typeof o.distAdversario === 'number') ? o.distAdversario : 99;
    const tipo = ShotModel.tipos[o.tipo] || ShotModel.tipos.forca;

    let s = E.base + Math.max(0, dist - E.distRef) * E.porMetro;

    // Técnica: divide. TEC 100 -> 0.65x, TEC 0 -> 1.45x.
    s *= E.tecMax - (E.tecMax - E.tecMin) * (Math.max(0, Math.min(100, tec)) / 100);

    s *= tipo.sigma;
    if (distAdversario < E.pressaoDist) s *= E.pressaoMult;

    /*
    Ângulo com a baliza: `o.angulo` é o ângulo entre a linha de remate e a
    perpendicular à linha de fundo. Junto à linha de fundo a baliza é uma
    fresta, e acertar-lhe é outra coisa.
    */
    if (typeof o.angulo === 'number' && Math.abs(o.angulo) > E.anguloFechado) s *= E.anguloMult;

    s *= E.escalaGlobal;
    return { lateral: s, vertical: s * E.fracVertical };
}

/*
TECTO DE ALTURA DO PASSE — a elevação que mantém o apex abaixo de `apexMax`.

A faixa de 25°-35° do `passeArco` descreve o GESTO, e é a mesma a 18 m e a
55 m. Só que o apex não depende do ângulo, depende do ângulo E da velocidade —
e a velocidade sobe com a distância:

    apex = (v·sen(elev))² / 2g

Medido em jogo: um lançamento de 54.9 m saía a 32.3 m/s e 35°, com vy = 18.5,
ou seja **17 m de altura**. O ângulo estava dentro da faixa e a bola era um
balão de guarda-redes — que é exactamente o que se via.

Aqui baixa-se a elevação até o apex caber. Quando nem no mínimo da faixa cabe,
devolve-se o mínimo: a distância é que era demasiada, e isso resolve-se em quem
escolhe o alvo, não aqui.
*/
function elevacaoComTectoDeApex(dist, elev, apexMax, elevMin) {
    const g = BallPhysics.gravidade;
    const tecto = (typeof apexMax === 'number') ? apexMax : 8.0;
    const minimo = (typeof elevMin === 'number') ? elevMin : (12 * Math.PI / 180);

    const apexDe = (e) => {
        const v = velocidadeParaAlcance(dist, e);
        const vy = v * Math.sin(e);
        return (vy * vy) / (2 * g);
    };

    if (apexDe(elev) <= tecto) return elev;
    if (apexDe(minimo) >= tecto) return minimo;

    // Monótona em `elev` para alcance fixo: mais ângulo, mais altura.
    let lo = minimo, hi = elev;
    for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (apexDe(mid) < tecto) lo = mid; else hi = mid;
    }
    return lo;
}

/*
JOGA DE PRIMEIRA? Ver o cabeçalho do FirstTouchModel (config.js).

Pura e com `rnd` injectável: é sorteio, e um sorteio que não se pode varrer não
se pode testar. `distAdversario` é a distância ao adversário mais próximo de
QUEM RECEBE, no instante em que a bola lhe chega.
*/
function jogaDePrimeira(tec, distAdversario, rnd) {
    const M = FirstTouchModel;
    if (!(tec >= M.tecMin)) return false;
    if (!(distAdversario <= M.distAdversario)) return false;

    // Interpola a chance entre `tecMin` (chanceMin) e 100 (chanceMax).
    const k = Math.max(0, Math.min(1, (tec - M.tecMin) / Math.max(1, 100 - M.tecMin)));
    const chance = M.chanceMin + (M.chanceMax - M.chanceMin) * k;

    const r = (rnd === undefined) ? Math.random() : rnd;
    return r < chance;
}

/* =========================================================================
   GEOMETRIA E DECISÃO — GOALKEEPER (migradas de config/goalkeeper.js)
   ========================================================================= */

/*
Âncora do guarda-redes.

Profundidade: cresce com a distância da bola à baliza, com easing quadrático —
o recuo acelera junto da área, que é onde importa.

Lateral: bissetriz do ângulo bola-postes, recuada de depth. O desvio encolhe
sozinho conforme ele recua para a linha; é geometria, não uma constante à mão.
*/
function gkAnchor(ballX, ballZ, ownGoalZ, dirZ, style) {
    const e = style || (typeof GoalkeeperStyle !== 'undefined' ? GoalkeeperStyle.defensive : { depthMin: 1.5, depthMax: 5.5 });

    const dx = ballX;
    const dz = ballZ - ownGoalZ;
    const d = Math.max(0.000001, Math.hypot(dx, dz));

    const near = (typeof GK_D_NEAR !== 'undefined') ? GK_D_NEAR : 16.5;
    const far = (typeof GK_D_FAR !== 'undefined') ? GK_D_FAR : 55.0;
    let t = (d - near) / Math.max(0.000001, far - near);
    t = Math.max(0, Math.min(1, t));
    const depth = e.depthMin + (e.depthMax - e.depthMin) * t * t;

    // d === 0 é a bola em cima do centro da baliza: sem direção definida, fica
    // no eixo. Sem esta guarda, depth/d dava NaN.
    const largBaliza = (typeof LARGURA_BALIZA !== 'undefined') ? LARGURA_BALIZA : 7.32;
    const limitGKX = (largBaliza / 2) - 0.5;
    let x = ballX * (depth / d);
    x = Math.max(-limitGKX, Math.min(limitGKX, x));

    return { x: x, z: ownGoalZ + depth * dirZ };
}

/*
Onde o guarda-redes se põe enquanto segura a bola: `segurarAvanco` metros à
frente da própria linha, no eixo.
*/
function gkAlvoSegurando(ownGoalZ, dirZ) {
    const avanco = (typeof GoalkeeperPose !== 'undefined' && typeof GoalkeeperPose.segurarAvanco === 'number')
        ? GoalkeeperPose.segurarAvanco : 4.0;
    return { x: 0, z: ownGoalZ + avanco * dirZ };
}

/*
Já pode relançar? Precisa de ter passado `segurarMinimo` — a folga para as
equipas se reorganizarem — e de haver alguém a quem jogar.
*/
function gkPodeLancar(tempoSegurando, temAlvo) {
    const minimo = (typeof GoalkeeperPose !== 'undefined' && typeof GoalkeeperPose.segurarMinimo === 'number')
        ? GoalkeeperPose.segurarMinimo : 3.0;
    return tempoSegurando >= minimo && !!temAlvo;
}

/*
=============================================================================
O GUARDA-REDES PODE SAIR DA ÁREA PARA ALIVIAR?
=============================================================================
Só quando a bola está FORA da área (lá dentro joga com as mãos) e ele JÁ ESTÁ
COMPROMETIDO — a menos de `margemSaida` da linha da área. É esta segunda
condição que impede o guarda-redes de arrancar campo fora atrás de qualquer
bola solta: sai quem já saiu.

`dzGk` e `dzBola` são profundidades a contar da linha de golo dele, no sentido
do campo. Geometria pura, sem Match.
*/
function gkPodeSairParaAliviar(dzGk, dzBola, bolaX, G, area) {
    if (!G || !area) return false;
    const bolaForaDaArea = dzBola > area.profundidade || Math.abs(bolaX) > area.meiaLargura;
    if (!bolaForaDaArea) return false;

    // Já comprometido: a menos de `margemSaida` da linha da área.
    const comprometido = dzGk >= area.profundidade - G.margemSaida;
    if (!comprometido) return false;

    // E não persegue para lá do alcance.
    return dzBola <= area.profundidade + G.alcanceFora;
}

/*
PARA ONDE VAI O ALÍVIO. No corredor central, em FRENTE; encostado a um lado,
para a LINHA LATERAL mais próxima. Nunca para o meio da própria área, e nunca
para onde o corpo calhar estar virado.

Devolve a velocidade a dar à bola. `dirZ` é a direcção de ataque da equipa dele
— o alívio vai nesse sentido.
*/
function alivioDoGuardaRedes(bolaX, dirZ, G, larguraCampo) {
    const g = BallPhysics.gravidade;
    const elev = (G.elevacao || 28) * Math.PI / 180;
    const v = G.forca || 22.0;

    let dx, dz;
    if (Math.abs(bolaX) < G.corredorCentral) {
        // Centro: em frente, e ligeiramente para o lado em que já está, para a
        // bola não voltar a cair no eixo à frente da própria baliza.
        dx = (Math.sign(bolaX) || 1) * 0.35;
        dz = dirZ;
    } else {
        // Encostado: para a linha lateral mais próxima, ainda com algum avanço.
        dx = Math.sign(bolaX) || 1;
        dz = dirZ * 0.45;
    }
    const n = Math.hypot(dx, dz) || 1;
    dx /= n; dz /= n;

    const horiz = v * Math.cos(elev);
    return { x: dx * horiz, y: v * Math.sin(elev), z: dz * horiz };
}

/*
Alvo de varrida. Ao contrário de gkAnchor(), vai NA DIRECÇÃO da bola: é a
situação em que o guarda-redes sai mesmo, porque não há defensor entre o
atacante e a baliza. sweepOut trava quão longe.
*/
function gkSweepTarget(ballX, ballZ, ownGoalZ, dirZ, style) {
    const e = style || (typeof GoalkeeperStyle !== 'undefined' ? GoalkeeperStyle.defensive : { sweepOut: 14.0 });

    const dx = ballX;
    const dz = ballZ - ownGoalZ;
    const d = Math.hypot(dx, dz);
    if (d < 0.0001) return { x: 0, z: ownGoalZ };

    // Nunca ultrapassa a bola, nem sai mais do que sweepOut.
    const alcance = Math.min(d, e.sweepOut);
    return {
        x: (dx / d) * alcance,
        z: ownGoalZ + (dz / d) * alcance
    };
}

/* =========================================================================
   GEOMETRIA E DECISÃO — DEFESA E MARCAÇÃO (migradas de config/defense.js)
   ========================================================================= */

/*
`marcadores`: [{ x, z, manter, ref }] - o ponto de onde cada um marca (o slot ja
inclinado pelo estilo), o que ele acompanhava e se a histerese ainda o segura.
Devolve um array pela MESMA ordem, com o adversario de cada um ou null.

Pura: sem Match, sem Tatics, sem THREE.
*/
function atribuirMarcacoes(marcadores, adversarios, raio) {
    const n = marcadores.length;
    const escolha = new Array(n).fill(null);
    if (!adversarios || !adversarios.length) return escolha;

    const tomados = new Set();

    const pesoSlot = (typeof MarkingModel !== 'undefined' && typeof MarkingModel.pesoSlot === 'number')
        ? MarkingModel.pesoSlot : 0.5;
    const bonusManter = (typeof MarkingModel !== 'undefined' && typeof MarkingModel.bonusManter === 'number')
        ? MarkingModel.bonusManter : 3.0;
    const bonusPar = (typeof MarkingModel !== 'undefined' && typeof MarkingModel.bonusPar === 'number')
        ? MarkingModel.bonusPar : 6.0;
    const tabelaPares = (typeof MarkingModel !== 'undefined') ? MarkingModel.paresPorPosicao : null;

    /*
    Elegibilidade é ZONAL (distância do SLOT ao homem, contra `raio`); o custo
    que ordena o leilão é a distância REAL do marcador ao homem, mais uma
    fracção da distância do slot. `px`/`pz` são a posição actual de quem marca —
    se não vierem, cai no slot e o comportamento é o antigo.
    */
    const medir = (m, o) => {
        const dxs = o.model.position.x - m.x;
        const dzs = o.model.position.z - m.z;
        const dSlot = Math.hypot(dxs, dzs);

        const px = (typeof m.px === 'number') ? m.px : m.x;
        const pz = (typeof m.pz === 'number') ? m.pz : m.z;
        const dReal = Math.hypot(o.model.position.x - px, o.model.position.z - pz);

        let custo = dReal + dSlot * pesoSlot;
        if (m.ref === o) custo -= bonusManter;

        // Par natural da posição (CB<->CF, LB<->RM, ...), por ordem de
        // preferência: 1ª leva o desconto inteiro, 2ª metade, e assim por diante.
        const lista = (m.pos && tabelaPares) ? tabelaPares[m.pos] : null;
        if (lista && o.pos) {
            const idx = lista.indexOf(o.pos);
            if (idx >= 0) custo -= bonusPar / (idx + 1);
        }

        return { dSlot: dSlot, custo: custo };
    };

    // 1) Histerese primeiro: quem mantem o homem trava-o antes do leilao.
    for (let i = 0; i < n; i++) {
        const m = marcadores[i];
        if (!m || !m.manter || !m.ref) continue;
        if (adversarios.indexOf(m.ref) < 0) continue;   // saiu do campo
        if (tomados.has(m.ref)) continue;               // outro ja o segurava
        escolha[i] = m.ref;
        tomados.add(m.ref);
    }

    // 2) Leilao guloso: todos os pares elegiveis, do custo mais baixo ao mais alto.
    const pares = [];
    for (let i = 0; i < n; i++) {
        if (escolha[i]) continue;
        const m = marcadores[i];
        if (!m) continue;
        for (const o of adversarios) {
            // O guarda-redes nao se acompanha: fica na baliza dele.
            if (!o || o.role === 'gk' || !o.model) continue;
            if (tomados.has(o)) continue;
            const med = medir(m, o);
            if (med.dSlot >= raio) continue;
            pares.push({ i: i, o: o, custo: med.custo });
        }
    }
    pares.sort((a, b) => a.custo - b.custo);

    for (const par of pares) {
        if (escolha[par.i] || tomados.has(par.o)) continue;
        escolha[par.i] = par.o;
        tomados.add(par.o);
    }

    return escolha;
}

/*
TRASEIRA DA ÚLTIMA LINHA A DEFENDER, em metros no referencial de ataque da
equipa (o `dir` do TeamBT: a própria baliza é o valor mais negativo).
*/
function recuoDaUltimaLinha(z0Dir, maisRecuadoDir, distancia, pisoDir, tectoDir) {
    let z = z0Dir;
    if (maisRecuadoDir !== null && maisRecuadoDir !== undefined) {
        const atrasDoHomem = maisRecuadoDir - distancia;
        if (atrasDoHomem < z) z = atrasDoHomem;
    }
    if (tectoDir !== null && tectoDir !== undefined && z > tectoDir) z = tectoDir;
    if (pisoDir !== null && pisoDir !== undefined && z < pisoDir) z = pisoDir;
    return z;
}

/*
Onde este jogador se põe para acompanhar o homem: entre ele e a PRÓPRIA baliza,
a `distancia` metros dele, e nunca mais de `biasMax` fora do slot.

Pura: sem Match, sem Tatics, sem THREE.
*/
function pontoDeMarcacao(slotX, slotZ, alvoX, alvoZ, ownGoalZ, distancia, biasMax) {
    if (biasMax <= 0) return { x: slotX, z: slotZ };

    // Do homem para a própria baliza: é deste lado que se fica.
    let gx = 0 - alvoX;
    let gz = ownGoalZ - alvoZ;
    const gl = Math.hypot(gx, gz);
    if (gl > 0.0001) { gx /= gl; gz /= gl; } else { gx = 0; gz = 0; }

    const desejadoX = alvoX + gx * distancia;
    const desejadoZ = alvoZ + gz * distancia;

    // Desvio a partir do slot, cortado ao tecto.
    let dx = desejadoX - slotX;
    let dz = desejadoZ - slotZ;
    const d = Math.hypot(dx, dz);
    if (d > biasMax && d > 0.0001) {
        dx = (dx / d) * biasMax;
        dz = (dz / d) * biasMax;
    }

    return { x: slotX + dx, z: slotZ + dz };
}

/* =========================================================================
   GEOMETRIA E DECISÃO — PASSES, CORREDORES E CANTOS
   ========================================================================= */

/*
GEOMETRIA DO CANTO - onde fica a bola, quem bate e para onde ele olha.
*/
function pontoDeCanto(bolaX, attDir) {
    const lado = (bolaX >= 0) ? 1 : -1;
    const meiaLarg = (typeof CAMPO_LARG !== 'undefined' ? CAMPO_LARG : 68.0) / 2;
    const meioComp = (typeof CAMPO_COMP !== 'undefined' ? CAMPO_COMP : 105.0) / 2;
    const raioBola = (typeof BallPhysics !== 'undefined' && typeof BallPhysics.raio === 'number') ? BallPhysics.raio : 0.11;

    // Meio metro para dentro das duas linhas: a bandeirola, sem arriscar o
    // clamp da linha de fundo.
    const bola = {
        x: lado * (meiaLarg - 0.5),
        y: raioBola,
        z: attDir * (meioComp - 0.5)
    };

    // Para onde a bola vai: a zona do penalti da baliza atacada.
    const alvo = { x: 0, z: attDir * (meioComp - 11) };

    // Batedor: na recta alvo->bola, 1.6 m PARA ALEM da bola. Fica sempre fora
    // do campo (a bola ja esta a meio metro das duas linhas) e com a bola
    // entre ele e a area, que e o que lhe da o gesto de centrar.
    let dx = bola.x - alvo.x;
    let dz = bola.z - alvo.z;
    const d = Math.max(0.000001, Math.hypot(dx, dz));
    dx /= d; dz /= d;

    const batedor = { x: bola.x + dx * 1.6, z: bola.z + dz * 1.6 };

    return { bola: bola, batedor: batedor, alvo: alvo };
}

/*
O SECTOR MANDA NA LARGURA — multiplicador sobre o fecho do LineShape.
*/
function fechoDoSector(setores) {
    if (!setores || !setores.length) return 1.0;

    const esq = setores.indexOf('esq') >= 0;
    const dir = setores.indexOf('dir') >= 0;
    const cen = setores.indexOf('cen') >= 0;
    const flancos = (esq ? 1 : 0) + (dir ? 1 : 0);

    if (flancos === 0) return cen ? 0.75 : 1.0;
    if (cen) return flancos === 2 ? 1.0 : 1.05;
    return flancos === 2 ? 1.15 : 1.10;
}

function atribuirApoios(o) {
    const resultado = [];
    if (!o || !o.candidatos || !o.candidatos.length) return resultado;

    const port = o.portador;
    const dirZ = port.dirZ;
    const larg = (typeof CAMPO_LARG !== 'undefined' ? CAMPO_LARG : 68.0);
    const comp = (typeof CAMPO_COMP !== 'undefined' ? CAMPO_COMP : 105.0);
    const meiaLarg = larg / 2 - 2.0;
    const meioComp = comp / 2 - 2.0;

    function serve(x, z) {
        if (Math.abs(x) > meiaLarg || Math.abs(z) > meioComp) return false;
        if (typeof o.offsideLimitDir === 'number' && z * dirZ > o.offsideLimitDir) return false;

        const d = Math.hypot(x - port.x, z - port.z);
        if (d < o.raioMin - 1.0 || d > o.raioMax + 1.0) return false;

        for (const a of o.adversarios) {
            if (Math.hypot(a.x - x, a.z - z) < o.margemAdversario) return false;
        }

        return linhaLivre(port.x, port.z, x, z, o.adversarios, o.margemLinha);
    }

    const escolhidos = [];
    const usados = new Set();

    const longeDosOutros = (x, z) => {
        for (const e of escolhidos) {
            if (Math.hypot(e.x - x, e.z - z) < 6.0) return false;
        }
        return true;
    };

    for (const c of o.candidatos) {
        if (escolhidos.length >= o.maxApoios) break;
        const actual = c.apoioActual;
        if (!actual) continue;
        if (Math.hypot(actual.x - c.slotX, actual.z - c.slotZ) > o.desvioMax) continue;
        if (!serve(actual.x, actual.z)) continue;
        if (!longeDosOutros(actual.x, actual.z)) continue;

        usados.add(c.id);
        escolhidos.push({ id: c.id, x: actual.x, z: actual.z });
    }

    const angulos = [-150, -110, -70, -35, 0, 35, 70, 110, 150];
    const raios = [o.raioMin, (o.raioMin + o.raioMax) / 2, o.raioMax];

    const pontos = [];
    for (const grau of angulos) {
        for (const raio of raios) {
            const rad = grau * Math.PI / 180;
            const x = port.x + Math.sin(rad) * raio;
            const z = port.z + Math.cos(rad) * raio * dirZ;
            if (!serve(x, z)) continue;

            let folgaPonto = Infinity;
            for (const a of o.adversarios) {
                const d = Math.hypot(a.x - x, a.z - z);
                if (d < folgaPonto) folgaPonto = d;
            }

            pontos.push({
                x: x,
                z: z,
                folgaLinha: folgaDaLinha(port.x, port.z, x, z, o.adversarios),
                folgaPonto: folgaPonto
            });
        }
    }

    const notaPara = (ponto, c) => notaPontoDeApoio({
        folgaLinha: ponto.folgaLinha,
        folgaPonto: ponto.folgaPonto,
        custoSlot: Math.hypot(ponto.x - c.slotX, ponto.z - c.slotZ)
    }, o.pesos);

    for (const c of o.candidatos) {
        if (escolhidos.length >= o.maxApoios) break;
        if (usados.has(c.id) || !c.apoioActual) continue;

        let melhor = null, melhorNota = -Infinity;
        for (const ponto of pontos) {
            if (!longeDosOutros(ponto.x, ponto.z)) continue;
            const custo = Math.hypot(ponto.x - c.slotX, ponto.z - c.slotZ);
            if (custo > o.desvioMax) continue;
            const nota = notaPara(ponto, c);
            if (nota <= melhorNota) continue;
            melhorNota = nota;
            melhor = ponto;
        }
        if (!melhor) continue;

        usados.add(c.id);
        escolhidos.push({ id: c.id, x: melhor.x, z: melhor.z });
    }

    const pares = [];
    for (const c of o.candidatos) {
        if (usados.has(c.id)) continue;
        for (let i = 0; i < pontos.length; i++) {
            const custo = Math.hypot(pontos[i].x - c.slotX, pontos[i].z - c.slotZ);
            if (custo > o.desvioMax) continue;
            pares.push({ id: c.id, i: i, nota: notaPara(pontos[i], c) });
        }
    }
    pares.sort((a, b) => b.nota - a.nota);

    for (const par of pares) {
        if (escolhidos.length >= o.maxApoios) break;
        if (usados.has(par.id)) continue;

        const ponto = pontos[par.i];
        if (!longeDosOutros(ponto.x, ponto.z)) continue;

        usados.add(par.id);
        escolhidos.push({ id: par.id, x: ponto.x, z: ponto.z });
    }

    return escolhidos;
}

/* =========================================================================
   COMPORTAMENTO E APARÊNCIA DE JOGADORES (migradas de config/player_behavior.js)
   ========================================================================= */

function hashAparencia(seed, sal) {
    let h = (seed * 2654435761 + sal * 40503) >>> 0;
    h ^= h >>> 15;
    h = (h * 2246822519) >>> 0;
    h ^= h >>> 13;
    return h >>> 0;
}

function repartirPorPeso(lista, n) {
    const total = lista.reduce((soma, item) => soma + item.peso, 0);
    const quotas = lista.map((item) => {
        const exacta = (item.peso / total) * n;
        const inteira = Math.floor(exacta);
        return { item: item, inteira: inteira, resto: exacta - inteira };
    });

    let atribuidos = quotas.reduce((soma, q) => soma + q.inteira, 0);
    const porResto = quotas.slice().sort((a, b) => b.resto - a.resto);
    for (let i = 0; atribuidos < n; i++, atribuidos++) {
        porResto[i % porResto.length].inteira++;
    }

    const saida = [];
    for (const q of quotas) {
        for (let k = 0; k < q.inteira; k++) saida.push(q.item);
    }
    return saida;
}

function baralharPorHash(lista, seed) {
    const out = lista.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = hashAparencia(seed, i) % (i + 1);
        const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
}

function escolherAparencia(indice, total, seedEquipa) {
    const n = total || 11;
    const semente = (seedEquipa || 0) + 1;

    const M = (typeof AppearanceModel !== 'undefined') ? AppearanceModel : { tipos: [], chuteiras: [] };
    const tipos = baralharPorHash(repartirPorPeso(M.tipos, n), semente * 7919);
    const botas = baralharPorHash(repartirPorPeso(M.chuteiras, n), semente * 104729);

    const i = ((indice % n) + n) % n;
    const tipo = tipos[i] || { nome: 'default', cabelo: '#000', pele: '#d1a384' };
    const bota = botas[i] || { nome: 'default', cor: '#000' };

    return {
        tipo: tipo.nome,
        cabelo: tipo.cabelo,
        pele: tipo.pele,
        chuteira: bota.nome,
        corChuteira: bota.cor
    };
}

function offsetInquietacao(angulo, raio) {
    return { x: Math.cos(angulo) * raio, z: Math.sin(angulo) * raio };
}

function coneVisao(tec) {
    const V = (typeof VisionModel !== 'undefined') ? VisionModel : { anguloMin: 30.0, anguloPorTecnica: 0.9 };
    return (Math.max(V.anguloMin, tec * V.anguloPorTecnica) * Math.PI) / 180;
}

function alcanceVisao(tec, minimo) {
    const V = (typeof VisionModel !== 'undefined') ? VisionModel : { distanciaMin: 12.0, distanciaPorTecnica: 0.5 };
    return Math.max(minimo === undefined ? V.distanciaMin : minimo,
        tec * V.distanciaPorTecnica);
}

function esperarPeloSlot(e) {
    const M = (typeof EsperaPeloSlotModel !== 'undefined') ? EsperaPeloSlotModel : { distanciaMax: 3.5, velocidadeMin: 0.4 };
    const dx = e.slotX - e.px, dz = e.slotZ - e.pz;
    const dist = Math.hypot(dx, dz);
    if (dist > M.distanciaMax) return false;
    if (dist < 0.001) return true;

    const dtSeguro = (e.dt && e.dt > 0.0001) ? e.dt : 0.016;
    const vx = (e.slotX - e.slotAnteriorX) / dtSeguro;
    const vz = (e.slotZ - e.slotAnteriorZ) / dtSeguro;

    const aproximacao = -((vx * dx) + (vz * dz)) / dist;
    return aproximacao >= M.velocidadeMin;
}

function eixoDeConducao(e) {
    const paraFrente = { bx: 0, bz: e.dirZ };
    const G = (typeof GiroDeCostasModel !== 'undefined') ? GiroDeCostasModel : { zonaLivre: 17.0, raio: 7.0, meiaAberturaGraus: 45, passoGiroGraus: 30 };

    if (e.carryRecuo) return { bx: 0, bz: -e.dirZ };

    const olhaParaOAtaque = (e.facingZ * e.dirZ) >= 0;
    if (olhaParaOAtaque) return paraFrente;

    if (e.zDir > G.zonaLivre) return paraFrente;

    let sx = e.entradaX, sz = e.entradaZ;
    const lenS = Math.hypot(sx, sz);
    if (lenS < 0.001) { sx = 0; sz = e.dirZ; } else { sx /= lenS; sz /= lenS; }

    const cosAbertura = Math.cos(e.meiaAberturaGraus !== undefined
        ? e.meiaAberturaGraus * Math.PI / 180
        : G.meiaAberturaGraus * Math.PI / 180);
    const raio = G.raio;

    let livre = true;
    for (const o of (e.adversarios || [])) {
        const d = Math.hypot(o.x, o.z);
        if (d > raio || d < 0.001) continue;
        if ((o.x / d) * sx + (o.z / d) * sz >= cosAbertura) { livre = false; break; }
    }
    if (livre) return paraFrente;

    const fLen = Math.hypot(e.facingX, e.facingZ) || 1;
    const fx = e.facingX / fLen, fz = e.facingZ / fLen;
    const passo = (G.passoGiroGraus || 30) * Math.PI / 180;

    const rodar = (ang) => ({
        bx: fx * Math.cos(ang) + fz * Math.sin(ang),
        bz: fz * Math.cos(ang) - fx * Math.sin(ang)
    });

    const folgaDe = (v) => {
        let menor = Infinity;
        for (const o of (e.adversarios || [])) {
            const d = Math.hypot(o.x, o.z);
            if (d < 0.001) return 0;
            const t = o.x * v.bx + o.z * v.bz;
            if (t <= 0) continue;
            const perp = Math.abs(o.x * v.bz - o.z * v.bx);
            if (perp < menor) menor = perp;
        }
        return menor;
    };

    const esq = rodar(-passo);
    const dir = rodar(passo);
    return folgaDe(esq) >= folgaDe(dir) ? esq : dir;
}

function distanciaMinimaNoLateral(pos) {
    const T = (typeof ThrowInModel !== 'undefined') ? ThrowInModel : { distanciaMinimaPorPos: {}, distanciaMinimaOmissao: 0 };
    const v = T.distanciaMinimaPorPos ? T.distanciaMinimaPorPos[pos] : undefined;
    return (typeof v === 'number') ? v : (T.distanciaMinimaOmissao || 0);
}

if (typeof window !== 'undefined') {
    Object.assign(window, {
        gkAnchor, gkAlvoSegurando, gkPodeLancar, gkSweepTarget,
        atribuirMarcacoes, recuoDaUltimaLinha, pontoDeMarcacao,
        pontoDeCanto, fechoDoSector, atribuirApoios,
        hashAparencia, repartirPorPeso, baralharPorHash, escolherAparencia,
        offsetInquietacao, coneVisao, alcanceVisao,
        esperarPeloSlot, eixoDeConducao, distanciaMinimaNoLateral
    });
}
