/*
=============================================================================
MULTIBOLA — bolas de reserva em cones à volta do campo
=============================================================================

O QUE É

Como num estádio a sério (e como na imagem de referência): bolas pousadas em
cones à volta das linhas. Quando a bola sai, **não volta teleportada** para a
marca: fica onde caiu, é retirada 3 s depois, e quem vai bater o lateral, o
canto ou o tiro de meta vai buscar a bola de reserva MAIS PERTO, leva-a à
marca e repõe o jogo. Ninguém pára — o resto da equipa reorganiza-se enquanto
isso acontece.

COMO SE LIGA AO RESTO

    MultiBall.init(scene)                  cria cones e bolas
    MultiBall.maisProxima(x, z)            a reserva livre mais perto
    MultiBall.retirar(reserva)             tira-a do cone (fica com o batedor)
    MultiBall.repor(reserva)               devolve-a ao cone
    MultiBall.largarBolaMorta(pos)         a bola que saiu fica ali 3 s
    MultiBall.update(dt)                   conta os 3 s e limpa

A reposição em si — quem vai buscar, o caminho, o pousar na marca — vive no
`Match.reposicao` (match_loop.js), porque é lá que o lance parado é conduzido.
Este ficheiro é só o material: onde estão as bolas, quais estão livres, e o
prop da bola morta.

POSIÇÕES

`MultiBallModel.pontos` são fracções do meio-campo e da meia-largura, para o
mesmo desenho servir qualquer dimensão de campo. Seguem a imagem: quatro atrás
de cada baliza (duas de cada lado do poste), e uma fila ao longo de cada linha
lateral, com os bancos no meio de uma delas.
*/

const MultiBallModel = {
    /*
    Cone: cilindro achatado, cor de treino. Pedido: mais pequenos — 0.22/0.34
    passaram a 0.13/0.20, que é a proporção de um cone de treino ao lado de
    uma bola (0.11 de raio).
    */
    coneRaio: 0.13,
    coneAltura: 0.20,
    coneCor: 0xff7a1a,

    /*
    A bola assenta ENCAIXADA no cone, nao pousada em cima dele: baixa
    `encaixeNoCone` (pedido — 10 cm) em relacao ao topo mais o raio.
    */
    encaixeNoCone: 0.10,

    // A que distância da linha ficam os cones, em metros.
    recuoLateral: 2.2,
    recuoFundo: 2.6,

    /*
    Quantos cones ao longo de cada linha lateral e atrás de cada baliza. Os da
    lateral saltam o meio-campo do lado dos bancos (ver `saltarBancos`), como
    na imagem.
    */
    porLateral: 6,
    porFundo: 4,
    saltarBancos: true,

    // Segundos que a bola que saiu fica no relvado antes de desaparecer.
    // Contam a partir do momento em que ela PARA, não de quando saiu — ver
    // largarBolaMorta.
    prazoBolaMorta: 3.0,

    /*
    A BOLA QUE SAI CONTINUA O MOVIMENTO (pedido).

    Ela não pára em cima da linha: sai com a velocidade que trazia, ressalta,
    rola e só então se apaga. É física simplificada — gravidade, arrasto,
    ressalto e atrito de rolamento — porque esta bola já não joga: não precisa
    de colidir com ninguém nem de ser interceptada.
    */
    restituicao: 0.45,      // quanto sobra da velocidade vertical ao ressaltar
    atritoSolo: 1.4,        // travagem a rolar, m/s por segundo
    arrasto: 0.06,          // arrasto do ar, simplificado
    velocidadeParada: 0.4,  // abaixo disto considera-se parada

    // Quanto tempo uma reserva usada demora a voltar ao cone.
    prazoRegresso: 25.0
};

const MultiBall = {
    reservas: [],
    _mortas: [],
    _scene: null,
    _geomBola: null,
    _matBola: null,

    init: function (scene) {
        this._scene = scene;
        this.reservas.length = 0;
        this._mortas.length = 0;
        if (!scene || typeof THREE === 'undefined') return;

        const M = MultiBallModel;
        const meiaLarg = CAMPO_LARG / 2;
        const meioComp = CAMPO_COMP / 2;

        /*
        AS BOLAS DE RESERVA SÃO IGUAIS ÀS DO JOGO (pedido).

        Usam o mesmo `Match.criarBola` — a malha do assets/Ball.obj, com os
        mesmos materiais. A esfera lisa fica como recurso para quando isso não
        existir (testes, harness sem Match).
        */
        this._geomBola = new THREE.SphereGeometry(BallPhysics.raio, 12, 10);
        this._matBola = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const geomCone = new THREE.ConeGeometry(M.coneRaio, M.coneAltura, 10);
        const matCone = new THREE.MeshLambertMaterial({ color: M.coneCor });

        const pontos = [];

        // Linhas laterais: uma fila de cada lado.
        for (let lado = -1; lado <= 1; lado += 2) {
            for (let i = 0; i < M.porLateral; i++) {
                const t = (i + 0.5) / M.porLateral;              // 0..1 ao longo do campo
                const z = -meioComp + t * CAMPO_COMP;
                /*
                O lado dos bancos não leva cones ao centro: é onde estão os
                suplentes e o quarto árbitro (as duas caixas da imagem).
                */
                if (M.saltarBancos && lado < 0 && Math.abs(z) < meioComp * 0.35) continue;
                pontos.push({ x: lado * (meiaLarg + M.recuoLateral), z: z });
            }
        }

        // Atrás de cada baliza, duas de cada lado do poste.
        for (let fundo = -1; fundo <= 1; fundo += 2) {
            for (let i = 0; i < M.porFundo; i++) {
                const t = (i + 0.5) / M.porFundo;
                const x = -meiaLarg * 0.75 + t * (meiaLarg * 1.5);
                // Nada mesmo atrás da baliza: é onde ela está.
                if (Math.abs(x) < LARGURA_BALIZA / 2 + 1.5) continue;
                pontos.push({ x: x, z: fundo * (meioComp + M.recuoFundo) });
            }
        }

        for (const pt of pontos) {
            const cone = new THREE.Mesh(geomCone, matCone);
            cone.position.set(pt.x, M.coneAltura / 2, pt.z);
            cone.castShadow = true;
            scene.add(cone);

            const bola = this._novaBola();
            bola.position.set(pt.x, M.coneAltura + BallPhysics.raio - (M.encaixeNoCone || 0), pt.z);
            scene.add(bola);

            this.reservas.push({
                x: pt.x, z: pt.z,
                y: M.coneAltura + BallPhysics.raio - (M.encaixeNoCone || 0),
                cone: cone, mesh: bola,
                disponivel: true, regresso: 0
            });
        }
    },

    /*
    Uma bola igual à do jogo. `Match.criarBola` devolve a malha do OBJ (um
    Group com um mesh por material); sem ela, uma esfera lisa serve — é o que
    corre nos testes.
    */
    _novaBola: function () {
        if (typeof Match !== 'undefined' && typeof Match.criarBola === 'function') {
            const m = Match.criarBola(BallPhysics.raio * (BallPhysics.escalaVisual || 1));
            if (m) {
                m.traverse && m.traverse(o => { if (o.isMesh) o.castShadow = true; });
                return m;
            }
        }
        const esfera = new THREE.Mesh(this._geomBola, this._matBola);
        esfera.castShadow = true;
        return esfera;
    },

    /*
    A reserva livre mais perto de um ponto. Devolve null se não houver nenhuma
    — e aí quem chama repõe como sempre se fez (bola na marca), que é a rede de
    segurança para o jogo nunca ficar preso por falta de material.
    */
    maisProxima: function (x, z) {
        let melhor = null, melhorD = Infinity;
        for (const r of this.reservas) {
            if (!r.disponivel) continue;
            const d = Math.hypot(r.x - x, r.z - z);
            if (d < melhorD) { melhorD = d; melhor = r; }
        }
        return melhor;
    },

    retirar: function (reserva) {
        if (!reserva) return;
        reserva.disponivel = false;
        reserva.regresso = MultiBallModel.prazoRegresso;
        if (reserva.mesh) reserva.mesh.visible = false;
    },

    repor: function (reserva) {
        if (!reserva) return;
        reserva.disponivel = true;
        reserva.regresso = 0;
        if (reserva.mesh) reserva.mesh.visible = true;
    },

    /*
    A BOLA QUE SAIU FICA ONDE CAIU.

    Um prop, não a bola do jogo: a do jogo segue para a marca com o batedor.
    Desaparece ao fim de `prazoBolaMorta` — pedido explícito.
    */
    largarBolaMorta: function (pos, vel) {
        if (!this._scene) return;
        const m = this._novaBola();
        m.position.set(pos.x, Math.max(BallPhysics.raio, pos.y || BallPhysics.raio), pos.z);
        this._scene.add(m);
        this._mortas.push({
            mesh: m,
            vx: vel ? vel.x : 0, vy: vel ? vel.y : 0, vz: vel ? vel.z : 0,
            timer: MultiBallModel.prazoBolaMorta,
            parada: false
        });
    },

    update: function (dt) {
        const M = MultiBallModel;
        const g = BallPhysics.gravidade;

        for (let i = this._mortas.length - 1; i >= 0; i--) {
            const m = this._mortas[i];

            /*
            ELA CONTINUA O MOVIMENTO. Só quando pára é que os 3 s começam a
            contar — uma bola que sai a 20 m/s ainda tem 15 m de campo fora
            para percorrer, e parar em cima da linha era o que se via.
            */
            if (!m.parada && m.mesh) {
                const s = Math.hypot(m.vx, m.vy, m.vz);
                if (s > 0.001) {
                    const k = M.arrasto * s * dt;
                    m.vx -= m.vx * k; m.vy -= m.vy * k; m.vz -= m.vz * k;
                }
                m.vy -= g * dt;
                m.mesh.position.x += m.vx * dt;
                m.mesh.position.y += m.vy * dt;
                m.mesh.position.z += m.vz * dt;

                if (m.mesh.position.y <= BallPhysics.raio) {
                    m.mesh.position.y = BallPhysics.raio;
                    if (m.vy < 0) m.vy = -m.vy * M.restituicao;
                    if (Math.abs(m.vy) < 0.6) m.vy = 0;
                    // A rolar: atrito do relvado.
                    const horiz = Math.hypot(m.vx, m.vz);
                    if (horiz > 0.001) {
                        const trava = Math.min(horiz, M.atritoSolo * dt);
                        m.vx -= (m.vx / horiz) * trava;
                        m.vz -= (m.vz / horiz) * trava;
                    }
                }
                if (Math.hypot(m.vx, m.vy, m.vz) < M.velocidadeParada &&
                    m.mesh.position.y <= BallPhysics.raio + 0.01) {
                    m.parada = true;
                    m.vx = m.vy = m.vz = 0;
                }
            }

            if (m.parada) m.timer -= dt;
            if (m.timer <= 0) {
                if (this._scene && m.mesh) this._scene.remove(m.mesh);
                this._mortas.splice(i, 1);
            }
        }
        for (const r of this.reservas) {
            if (r.disponivel) continue;
            r.regresso -= dt;
            if (r.regresso <= 0) this.repor(r);
        }
    },

    // Para os testes e para o arranque de um jogo novo.
    reporTodas: function () {
        for (const r of this.reservas) this.repor(r);
        for (const m of this._mortas) { if (this._scene && m.mesh) this._scene.remove(m.mesh); }
        this._mortas.length = 0;
    }
};

if (typeof window !== 'undefined') {
    window.MultiBall = MultiBall;
    window.MultiBallModel = MultiBallModel;
}
