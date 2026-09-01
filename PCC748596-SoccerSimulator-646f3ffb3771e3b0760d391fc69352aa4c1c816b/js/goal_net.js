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
    },

    /*
    Regista uma face para poder ser animada. `base` é a cópia das posições de
    repouso: é sempre DELAS que se parte, nunca da geometria corrente, senão a
    deformação acumulava e a rede nunca voltava ao lugar.
    */
    registarFace: function (mesh, zSinal, normal, nu, nv) {
        const attr = mesh.geometry.attributes.position;
        this.faces.push({
            mesh: mesh,
            attr: attr,
            base: new Float32Array(attr.array),
            normal: normal,
            zSinal: zSinal,
            nu: nu,
            nv: nv,
            t: 0,
            amplitude: 0,
            activa: false
        });
    },

    /*
    A bola bateu nesta baliza. Reinicia o relógio e fica com a MAIOR das
    amplitudes, em vez de as somar: somar deixava a rede a crescer sem limite
    numa sequência de remates.
    */
    bater: function (zSinal, velocidadeNormal) {
        const a = this.amplitudeDoImpacto(velocidadeNormal);
        if (a <= 0) return;

        for (const f of this.faces) {
            if (f.zSinal !== zSinal) continue;
            f.amplitude = f.activa ? Math.max(f.amplitude, a) : a;
            f.t = 0;
            f.activa = true;
        }
    },

    /*
    Sai IMEDIATAMENTE se nenhuma face está a abanar: em repouso o custo é uma
    comparação por frame, e a malha mais densa não pesa nada enquanto ninguém
    marcar.
    */
    update: function (dt) {
        if (!this.faces.length) return;

        let algumaActiva = false;
        for (const f of this.faces) { if (f.activa) { algumaActiva = true; break; } }
        if (!algumaActiva) return;

        const dur = GoalNet.duracaoOnda;

        for (const f of this.faces) {
            if (!f.activa) continue;

            f.t += dt;
            const acabou = f.t >= dur;

            const base = f.base, arr = f.attr.array;
            const largura = f.nu + 1;

            for (let i = 0; i < largura * (f.nv + 1); i++) {
                const iu = i % largura, iv = (i / largura) | 0;
                const u = iu / f.nu, v = iv / f.nv;

                const d = acabou ? 0 : this.deslocamento(f.t, u, v, f.amplitude);

                arr[i * 3] = base[i * 3] + f.normal.x * d;
                arr[i * 3 + 1] = base[i * 3 + 1] + f.normal.y * d;
                arr[i * 3 + 2] = base[i * 3 + 2] + f.normal.z * d;
            }

            f.attr.needsUpdate = true;
            // Uma última passagem já pôs tudo no repouso exacto: pode parar.
            if (acabou) { f.activa = false; f.amplitude = 0; }
        }
    }
};

/*
Grelha de (nu+1) x (nv+1) vértices, por interpolação bilinear dos quatro cantos:

    P(u, v) = (1-u)(1-v)·p1 + u(1-v)·p2 + (1-u)v·p3 + uv·p4

Bilinear e não um PlaneGeometry transformado: as faces da rede são trapézios e
planos inclinados (ver os cantos em criarFaceRede, match.js), não rectângulos, e
a interpolação dos cantos reproduz qualquer um deles.

A ordem dos cantos é a que o código já usava: p1 em (0,0), p2 em (1,0), p3 em
(0,1), p4 em (1,1) — o que os índices antigos [0,1,2, 1,3,2] implicavam.

Pura e sem THREE: quem chama monta o BufferGeometry com o que isto devolve.
*/
function gerarGrelhaRede(p1, p2, p3, p4, repX, repY, nu, nv) {
    const nVertices = (nu + 1) * (nv + 1);
    const posicoes = new Float32Array(nVertices * 3);
    const uvs = new Float32Array(nVertices * 2);
    const indices = [];

    for (let iv = 0; iv <= nv; iv++) {
        const v = iv / nv;
        for (let iu = 0; iu <= nu; iu++) {
            const u = iu / nu;
            const i = iv * (nu + 1) + iu;

            const a = (1 - u) * (1 - v), b = u * (1 - v);
            const c = (1 - u) * v, d = u * v;

            for (let k = 0; k < 3; k++) {
                posicoes[i * 3 + k] = a * p1[k] + b * p2[k] + c * p3[k] + d * p4[k];
            }

            uvs[i * 2] = u * repX;
            uvs[i * 2 + 1] = v * repY;
        }
    }

    for (let iv = 0; iv < nv; iv++) {
        for (let iu = 0; iu < nu; iu++) {
            const i0 = iv * (nu + 1) + iu;
            const i1 = i0 + 1;
            const i2 = i0 + (nu + 1);
            const i3 = i2 + 1;
            // Mesma orientação dos dois triângulos do quad antigo.
            indices.push(i0, i1, i2, i1, i3, i2);
        }
    }

    return { posicoes: posicoes, uvs: uvs, indices: indices };
}
