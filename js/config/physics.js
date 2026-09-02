/*
=============================================================================
CONFIG: FÍSICA E CAMPO
=============================================================================
Dimensões da baliza, campo, redes, barreiras, física da bola e bandeiras.
=============================================================================
*/

/*
ALTURA_BASE_Y — a altura a que o corpo do jogador assenta.

Era 0.0 e o boneco lia-se a pairar: medido em jogo corrido, o ponto mais baixo
do corpo estava mais de 5 cm acima do relvado em 36% das leituras. Vem da
POSE — o `ressalto` da passada mais o `altura` dos keyframes das accoes, que
vai a +0.15 m — e nao de um erro de posicionamento.

Tentou-se resolver a serio, medindo a sola e assentando o corpo frame a frame.
Mexia na animacao e ficou pior; foi desfeita por inteiro. O que fica e o que o
pedido pede: um DESNIVEL CONSTANTE. A animacao e exactamente a de sempre, o
boneco e que assenta tres centimetros mais abaixo.

E a base de tudo no jogador — posicao, alvos, alcance da cabeca
(`ALTURA_BASE_Y + ALTURA_TESTA`) — portanto o corpo desce inteiro e coerente.
Mexer neste numero e mexer na altura de toda a gente, que e a ideia.
*/
const LARGURA_BALIZA = 7.32; const ALTURA_BALIZA = 2.44; const ALTURA_BASE_Y = -0.03;

/*
Rede da baliza — forma e comportamento.

A rede DESENHADA é inclinada: o pano de cima entra `profTopo` metros a partir
da linha, e daí desce em diagonal até ao chão a `profBase` metros (ver a
criação das faces em match.js). A COLISÃO, essa, era uma caixa: parava a bola
a 2.3 m de profundidade a qualquer altura. Uma bola entrada por cima ficava
suspensa muito atrás do pano — lia-se como a bola a atravessar a rede.

E o que havia a seguir era pior para a leitura: `ballVel.set(0,0,0)`. A bola
congelava no ar onde tocasse, em vez de escorregar pelo pano abaixo.

`restituicao` é baixa de propósito — corda amortece quase tudo. `atrito`
trava o deslizamento sem o impedir: é ele que faz a bola descer o pano em vez
de ficar colada onde bateu.
*/
const GoalNet = {
    /*
    FÍSICA — não mexer sem medir. A bola já bate no pano, perde velocidade e
    escorrega até ao chão pela inclinação do pano de trás (profTopo 0.8 no
    cimo, profBase 2.0 na base). Ver Match.colidirComRede em match.js.
    */
    profTopo: 0.8,
    profBase: 2.0,
    restituicao: 0.02,
    atrito: 0.35,

    /*
    MALHA — quantos quadrados por face. Antes cada face era UM quad de quatro
    vértices, e por isso a rede não podia deformar-se: era uma chapa rígida com
    textura de rede. Os laterais são estreitos e levam menos divisões ao longo
    de u.
    */
    segmentosU: 16,
    segmentosV: 6,
    segmentosLateralU: 8,

    /*
    ONDULAÇÃO (ver NetWave em goal_net.js). O deslocamento é ao longo da normal
    da face:

        desloc = amplitude * envolvente(t) * sin(frequencia*t + k*(u+v))
        envolvente(t) = (1 - e^(-t/ataqueOnda)) * e^(-t/tau)

    com tau = duracaoOnda/4, o que deixa ~1.8% da amplitude ao fim de
    duracaoOnda. `ondasPorPano` é quantas cristas cabem na diagonal do pano: é
    o que faz a ondulação PERCORRER a rede em vez de a levantar em bloco.

    O factor de ATAQUE existe para a envolvente valer 0 em t=0. Sem ele a
    envolvente arrancava em 1 e, como a fase depende de (u+v), a rede saltava
    para uma posição já deformada no primeiro frame em vez de partir do
    repouso — apanhado pelos testes.
    */
    ataqueOnda: 0.05,
    duracaoOnda: 5.0,
    amplitudeMax: 0.28,
    frequencia: 7.0,
    ondasPorPano: 2.5,
    velocidadeCheia: 22.0
};

/*
Estrutura da baliza — postes e travessão como obstáculos físicos.

A bola atravessava-os: não havia colisão nenhuma com a armação, só a
detecção de golo (que continua a exigir a bola INTEIRA para lá da linha) e o
clamp da rede. Uma bola na trave passava ou encostava sem ressaltar.

`z` é o plano dos postes: a armação está meio raio para dentro da linha,
como no desenho da baliza (ver criação em match.js).
*/
const GoalFrame = {
    raioPoste: 0.06,
    // Trave e postes são rígidos: devolvem bem mais do que a rede, um pouco
    // menos do que uma parede perfeita.
    restituicao: 0.65,
    // Atrito tangencial no ressalto: a bola sai da trave a rodar e perde
    // alguma velocidade no plano do impacto.
    atrito: 0.85
};

window.Config = {
    usePlayingStyles: true,

    /*
    Público no estádio. LIGADO.

    Esteve a `false` desde que o público antigo (`createSpectatorGeometry` +
    shader de animação por vértice) foi considerado caro de mais — e ficou
    assim, o que fazia os adeptos simplesmente não aparecerem.

    O sistema actual (js/crowd.js) é outra coisa: 15 000 adeptos em QUATRO
    InstancedMesh estáticos, sem shader e sem update por frame. Para desligar
    em jogo há o botão *Fans* no painel direito, que é onde essa decisão deve
    ser tomada; este flag fica como interruptor de arranque.
    */
    enableCrowd: true
};

/*
MULTIPLICADORES DE TENDÊNCIA POR POSIÇÃO
Permite separar a "capacidade técnica" da "mentalidade". 
Por exemplo, um CF com passe 80 prefere chutar do que passar, enquanto um CM com o mesmo atributo prefere o passe.
*/
window.PositionalTendencies = {
    'CB': { shoot: 0.50, dribble: 0.40, pass: 1.00, forwardPass: 0.80, cross: 0.20, clearance: 1.30 },
    'LB': { shoot: 0.60, dribble: 0.80, pass: 1.00, forwardPass: 0.90, cross: 1.30, clearance: 1.10 },
    'RB': { shoot: 0.60, dribble: 0.80, pass: 1.00, forwardPass: 0.90, cross: 1.30, clearance: 1.10 },
    'DM': { shoot: 0.70, dribble: 0.70, pass: 1.30, forwardPass: 1.10, cross: 0.50, clearance: 1.10 },
    'CM': { shoot: 0.80, dribble: 0.90, pass: 1.20, forwardPass: 1.20, cross: 0.80, clearance: 0.90 },
    'LM': { shoot: 0.80, dribble: 1.10, pass: 1.10, forwardPass: 1.10, cross: 1.30, clearance: 0.80 },
    'RM': { shoot: 0.80, dribble: 1.10, pass: 1.10, forwardPass: 1.10, cross: 1.30, clearance: 0.80 },
    'AM': { shoot: 1.00, dribble: 1.10, pass: 1.10, forwardPass: 1.40, cross: 0.90, clearance: 0.50 },
    'LW': { shoot: 1.10, dribble: 1.30, pass: 0.90, forwardPass: 1.00, cross: 1.40, clearance: 0.40 },
    'RW': { shoot: 1.10, dribble: 1.30, pass: 0.90, forwardPass: 1.00, cross: 1.40, clearance: 0.40 },
    'CF': { shoot: 1.40, dribble: 1.10, pass: 0.70, forwardPass: 0.80, cross: 0.50, clearance: 0.30 },
    'ST': { shoot: 1.40, dribble: 1.10, pass: 0.70, forwardPass: 0.80, cross: 0.50, clearance: 0.30 },
    'GK': { shoot: 0.10, dribble: 0.10, pass: 1.00, forwardPass: 1.00, cross: 0.10, clearance: 1.50 }
};

window.getPositionalTendency = function (pos, action) {
    if (typeof PositionalTendencies !== 'undefined' && PositionalTendencies[pos]) {
        if (typeof PositionalTendencies[pos][action] === 'number') {
            return PositionalTendencies[pos][action];
        }
    }
    return 1.0;
};


/*
Altura da TESTA acima da base do modelo.

`model.position` está nos PÉS (y = ALTURA_BASE_Y). O rig, à escala 1.8/5.5,
põe o centro da cabeça a ~1.64 m e a testa a ~1.75 m. Este valor é o ponto de
contacto de um cabeceio — ver distanciaAoCorpo() em utils.js.
*/
const ALTURA_CABECA = 1.72;

/*
ALTURA DA TESTA — onde a bola bate num cabeceio.

Cabeça-se com a TESTA, um pouco abaixo do topo do crânio. `ALTURA_CABECA` é
o topo: mirar aí punha a bola a raspar por cima, e o jogador a "cabecear" uma
bola em que nunca tocava. Toda a decisão de cabeceio mede-se a partir daqui —
sem salto, a testa está a esta altura; a saltar, a esta altura mais a subida
do salto.
*/
const ALTURA_TESTA = ALTURA_CABECA - 0.10;   // 1.62
const CAMPO_LARG = 68; const CAMPO_COMP = 106;
const LINHA_FUNDO = CAMPO_COMP / 2;          // 53.0 m (distância do centro a cada linha de fundo)
const MEIA_LARGURA_CAMPO = CAMPO_LARG / 2;   // 34.0 m (distância do centro a cada linha lateral)

/*
=============================================================================
GEOMETRIA DAS ÁREAS DO CAMPO
=============================================================================
Centralização das dimensões e predicados das áreas (grande e pequena área),
para evitar dispersão de números mágicos (16.5, 20.16, 5.5, 9.16) e duplicidade
de lógicas de contenção.
=============================================================================
*/
const Area = {
    profundidade: 16.5,          // da linha de fundo para dentro
    meiaLargura: 20.16,          // do eixo do campo para cada lado
    largura: 40.32,              // largura total (2 * meiaLargura)
    pequenaProfundidade: 5.5,    // profundidade da pequena área a partir da linha de fundo
    pequenaMeiaLargura: 9.16,    // LARGURA_BALIZA / 2 + 5.5 (7.32/2 + 5.5 = 9.16)
    pequenaLargura: 18.32,       // largura total da pequena área
    distanciaPenalti: 11.0,      // marca de penálti a partir da linha de fundo
    raioMeiaLua: 9.15,           // raio do arco da grande área

    /*
    Verifica se um ponto (x, z) está dentro da grande área.
    - Se ladoZ for fornecido (+1, -1, ou z da linha de fundo ex.: ±53):
      avalia em relação à baliza específica indicada.
    - Se ladoZ for omitido/nulo: avalia se está em QUALQUER uma das duas grandes áreas.
    */
    contem: function (x, z, ladoZ) {
        if (Math.abs(x) > this.meiaLargura) return false;
        if (ladoZ !== undefined && ladoZ !== null) {
            const sinal = Math.sign(ladoZ) || 1;
            const dz = (sinal * LINHA_FUNDO - z) * sinal;
            return dz >= 0 && dz <= this.profundidade;
        }
        const dz = LINHA_FUNDO - Math.abs(z);
        return dz >= 0 && dz <= this.profundidade;
    },

    /*
    Verifica se um ponto (x, z) está dentro da pequena área (área de meta).
    */
    contemPequena: function (x, z, ladoZ) {
        if (Math.abs(x) > this.pequenaMeiaLargura) return false;
        if (ladoZ !== undefined && ladoZ !== null) {
            const sinal = Math.sign(ladoZ) || 1;
            const dz = (sinal * LINHA_FUNDO - z) * sinal;
            return dz >= 0 && dz <= this.pequenaProfundidade;
        }
        const dz = LINHA_FUNDO - Math.abs(z);
        return dz >= 0 && dz <= this.pequenaProfundidade;
    }
};

/*
Aliases para manter compatibilidade com módulos existentes.
*/
const AREA_GRANDE_PROF = Area.profundidade;
const AREA_GRANDE_MEIA_LARG = Area.meiaLargura;

if (typeof window !== 'undefined') {
    window.Area = Area;
    window.LINHA_FUNDO = LINHA_FUNDO;
    window.MEIA_LARGURA_CAMPO = MEIA_LARGURA_CAMPO;
    window.AREA_GRANDE_PROF = AREA_GRANDE_PROF;
    window.AREA_GRANDE_MEIA_LARG = AREA_GRANDE_MEIA_LARG;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
const _line1 = new THREE.Line3();
const _vUp = new THREE.Vector3(0, 1, 0);   // eixo vertical, para rodar direcções no plano do campo
const _vFrenteCorpo = new THREE.Vector3();  // frente local (+Z) do jogador que passa, para o ângulo do corpo no erro do passe (executePassGameplay)
const _vDireitaCorpo = new THREE.Vector3(); // direita local (+X) do jogador, para detecção de recepções laterais

/*
=============================================================================
FÍSICA DA BOLA — valores reais, não afinados à mão
=============================================================================
O que estava antes em updateBall(), e porque estava errado:

    gravidade   15.0 m/s²        53% acima da real; a bola caía como pedra
    raio        0.15 m           circunferência 94 cm (regulamento: 68-70)
    arrasto     pow(0.85, dt)    decaimento EXPONENCIAL, proporcional a v e
                                 só em x/z. O arrasto real é quadrático (∝v²)
                                 e trava as três componentes: com o modelo
                                 antigo uma bola lenta perdia 15%/s (a mais)
                                 e uma bola a 30 m/s quase não travava (a
                                 menos). Daí o voo "esquisito".
    chão        pow(0.55, dt)    45% da velocidade por segundo a rolar. Uma
                                 bola a rolar perde ~1 m/s por segundo, e
                                 essa perda é constante (μ·g), não uma
                                 fracção da velocidade.

Valores agora:
    massa 430 g          FIFA Lei 2 (410-450 g)
    circunferência 69 cm FIFA Lei 2 (68-70 cm) → raio 0.11 m
    ρ = 1.225 kg/m³      ar seco, 1 atm (101 325 Pa), nível do mar, 15 °C
    Cd = 0.25            bola de futebol em regime turbulento
    g = 9.81 m/s²

    arrasto:    a = ½·ρ·Cd·A/m · v²  =  0.0135·v²
                (0.34 m/s² a 5 m/s; 12.2 m/s² a 30 m/s)
    rolamento:  a = μ·g = 0.98 m/s², constante
=============================================================================
*/
const BallPhysics = {
    massa: 0.430,           // kg
    raio: 0.11,             // m (circunferência 69 cm)
    gravidade: 9.81,        // m/s²
    densidadeAr: 1.225,     // kg/m³ — 1 atm, nível do mar, 15 °C
    cd: 0.25,               // coeficiente de arrasto
    restituicao: 0.60,      // ressalto vertical em relva
    atritoRessalto: 0.75,   // perda horizontal em cada ressalto
    atritoRolamento: 0.38,  // μ de rolamento em relva
    vMinRessalto: 0.6,      // abaixo disto não ressalta, assenta
    vMinRolar: 0.25,        // abaixo disto pára de vez

    /*
    Só a MALHA é aumentada, não a física: a bola regulamentar (raio 0.11 m)
    fica pequena de mais para se ver bem à distância da câmara. O raio de
    colisão, o ressalto e a rotação continuam a usar o valor real.
    */
    escalaVisual: 1.30
};

/*
=============================================================================
BARREIRA DO CAMPO — muro de contenção à frente da bancada
=============================================================================
Sem isto, uma bola forte para fora saía do estádio e ia rolar por baixo das
bancadas até parar sozinha (a física real tem pouco atrito de rolamento e o
`resetPlay` só acontece depois de ela parar).

As bancadas laterais começam em |x| = 38.5 e as de fundo em |z| = 58.5 (ver
createField). A barreira fica logo à frente delas, com a folga do degrau.

A contenção aplica-se a QUALQUER altura da bola, embora o painel só suba
`alturaPainel`: acima disso é a rede de protecção (a parte translúcida), que
existe pela mesma razão nos estádios a sério.
=============================================================================
*/
const BarreiraCampo = {
    /*
    A barreira lateral estava EM CIMA da linha (CAMPO_LARG/2), portanto a bola
    ressaltava na linha lateral e nunca saía — não havia lateral nenhum no jogo.
    Agora tem a mesma folga de 4 m que o lado da linha de fundo já tinha: a bola
    sai, o lateral é assinalado, e a barreira só a trava depois disso.
    */
    x: (CAMPO_LARG / 2) + 4.0,
    z: (CAMPO_COMP / 2) + 4.0,
    alturaPainel: 1.1,      // muro de publicidade, opaco
    alturaRede: 4.5,        // rede de protecção por cima, translúcida
    restituicao: 0.35,      // ressalto seco: a bola morre ali, não volta ao meio
    atrito: 0.6             // perda na componente paralela ao embate
};
BallPhysics.area = Math.PI * BallPhysics.raio * BallPhysics.raio;
// ½·ρ·Cd·A/m — multiplicar por v² dá a desaceleração em m/s².
BallPhysics.kArrasto = 0.5 * BallPhysics.densidadeAr * BallPhysics.cd *
    BallPhysics.area / BallPhysics.massa;

/*
Sincronização gameplay↔animação (ActionState, ver js/bt/action_state.js).
contactTime é a fracção (0..1) da duração do gesto em que o efeito real
(bola sai do pé, etc.) dispara — não no instante em que o BT decide.
Começa só pelo PASS; os valores replicam exactamente o timing antigo
(this.timer<0.08 / >=0.2) para não mudar o "feel" ao migrar de arquitectura.
*/

const CornerFlag = {
    raioArco: 1.0,        // regulamento
    alturaPoste: 1.5,     // regulamento: minimo 1.5 m
    raioPoste: 0.03,
    corPoste: 0xf5f5f5,
    larguraBandeira: 0.42,
    alturaBandeira: 0.30,
    corBandeira: 0xf2c400
};
