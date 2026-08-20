/*
=============================================================================
NetWave — a rede da baliza a ondular depois do impacto
=============================================================================
A física da bola contra a rede é outra coisa, e vive em Match.colidirComRede
(match.js): a bola já batia, perdia velocidade e escorregava até ao chão. O
que faltava era a rede REAGIR — cada face era um quad de quatro vértices, uma
chapa rígida com textura de rede.

Aqui trata-se só do visual. Cada face regista as posições de repouso num
Float32Array próprio e, enquanto houver onda, cada frame reescreve `position`
a partir DELAS. Nunca se deforma sobre a geometria corrente: assim a rede volta
sempre exactamente ao lugar, sem deriva ao fim de vários golos.

Em repouso o custo é uma comparação por frame — ver o `update`.
=============================================================================
*/
const NetWave = {
    // { mesh, base, normal, zSinal, t, amplitude } por face registada.
    faces: [],

    /*
    Deslocamento de um ponto da grelha, ao longo da normal da face.

    Pura e sem THREE de propósito: é assim que os testes a correm em Node (ver
    tests/goal_net.test.js).

    `u` e `v` são as coordenadas da grelha em 0..1. A fase depende de (u+v), por
    isso a onda percorre o pano na diagonal em vez de o levantar todo de uma
    vez.
    */
    deslocamento: function (t, u, v, amplitude) {
        const G = GoalNet;
        const tau = G.duracaoOnda / 4;
        // O factor de ataque põe a envolvente a ZERO em t=0: a rede parte do
        // repouso. Sem ele saltava para uma posição já deformada no primeiro
        // frame, porque a fase depende de (u+v) e não de t sozinho.
        const envolvente = (1 - Math.exp(-t / G.ataqueOnda)) * Math.exp(-t / tau);
        const k = G.ondasPorPano * Math.PI * 2;
        return amplitude * G.amplitudeMax * envolvente *
            Math.sin(G.frequencia * t + k * (u + v) * 0.5);
    },

    /*
    Quanto abana a rede, a partir da velocidade NORMAL absorvida no impacto.
    Satura em 1 para um canhão não fazer a rede explodir, e nunca devolve
    negativo.
    */
    amplitudeDoImpacto: function (velocidadeNormal) {
        const v = Math.abs(velocidadeNormal);
        return Math.max(0, Math.min(1, v / GoalNet.velocidadeCheia));
    }
};
