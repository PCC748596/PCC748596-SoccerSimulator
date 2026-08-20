/*
=============================================================================
PlayerPassTarget — pontos candidatos para passe (debug visual)
=============================================================================
Implementa o algoritmo clássico de geração de pontos candidatos ao redor de
cada companheiro de equipa (sem bola) do jogador com a posse, filtrando os
que seriam facilmente interceptados. Só visualização — não decide nada (ver
findPassTarget em player.js para a decisão real).

Geração (por companheiro, "referencial de ataque": frente = dirZ, lateral = X):
    j de 1 a `arcos` (raio = j*`espacamento` -> arcos a 3, 6, 9 ... 21 m)
    k de 1 a `pontosPorArco` (ângulo = 120 + 15*k -> desvio de -45° a +45°
                em torno da direcção de ataque do companheiro)

    Os arcos passaram de 2 em 2 m (5 arcos, até 10 m) para 3 em 3 m (7
    arcos, até 21 m): pontos menos amontoados uns em cima dos outros e um
    leque que chega ao espaço onde o passe vale a pena, não só à roda do
    companheiro.

    O leque é SEMPRE à frente do companheiro, e "à frente" é para onde o
    CORPO dele aponta (±45° em torno disso) — a correr, é a direcção da
    corrida. Um ponto atrás dele seria um passe para onde ele já esteve —
    não existe e não deve existir.

Descarte de um ponto candidato:
    - fora do campo;
    - há um adversário a menos de `raioAdversario` do ponto;
    - a mais de 30m da bola;
    - o companheiro está em impedimento (offsideLimitDir do TeamAI) -> descarta
      TODOS os pontos desse companheiro;
    - há adversário na linha de passe: dentro de ±20° do ângulo bola->ponto
      E mais perto da bola do que o próprio ponto.
=============================================================================
*/
// Reutilizado no cálculo da frente de cada companheiro — evita alocar um
// Vector3 por ponto, e isto corre todos os frames.
const _vFwd = new THREE.Vector3();

const PassCandidates = {
    // Geometria do leque de candidatos, por companheiro.
    pontosPorArco: 7,      // ângulos, de 15° em 15° (-45° a +45°)
    passoAngular: 15,      // graus entre pontos do mesmo arco
    arcos: 7,              // quantos arcos concêntricos (3, 6, 9 ... 21 m)
    espacamento: 3.0,      // metros entre arcos (o 1º fica a esta distância)
    raioPonto: 0.15,       // raio do disco desenhado, em metros
    raioAdversario: 2.0,   // adversário a menos disto do ponto -> ponto descartado

    debug: false,
    _group: null,
    _pool: [],
    _usados: 0,
    _geo: null,

    ensureGroup: function () {
        if (this._group) return;
        this._group = new THREE.Group();
        Match.scene.add(this._group);
        // Círculo achatado sobre o gramado, não uma esfera flutuando no ar.
        this._geo = new THREE.CircleGeometry(this.raioPonto, 10);
        this._mat = new THREE.MeshBasicMaterial({ color: 0xff8c1a, side: THREE.DoubleSide });
    },

    getDot: function () {
        if (this._usados < this._pool.length) {
            const m = this._pool[this._usados++];
            m.visible = true;
            return m;
        }
        const mesh = new THREE.Mesh(this._geo, this._mat);
        mesh.rotation.x = -Math.PI / 2;
        this._group.add(mesh);
        this._pool.push(mesh);
        this._usados++;
        return mesh;
    },

    esconderResto: function () {
        for (let i = this._usados; i < this._pool.length; i++) this._pool[i].visible = false;
    },

    setDebug: function (on) {
        this.debug = on;
        this.ensureGroup();
        this._group.visible = on;
        if (on) this.rebuild();
        else { this._usados = 0; this.esconderResto(); }
    },

    /*
    Todos os frames. Havia aqui um acumulador que só redesenhava de 0.2 em
    0.2s: entre redesenhos os jogadores continuavam a correr e os pontos
    ficavam para trás, pousados em relva vazia a vários metros do dono. A
    5 redesenhos por segundo o leque nunca coincidia com quem o gerou.

    O custo é o que já era — a mesma conta que corria a cada 0.2s — e é
    debug, só corre com o toggle ligado.
    */
    update: function () {
        if (!this.debug) return;
        this.rebuild();
    },

    /*
    Gera a lista de candidatos sobreviventes para o `carrier` — pura, sem
    THREE, usada tanto pelo desenho de debug como pela decisão de passe real
    (ver findGridPassTarget em player_bt.js). Devolve [{x, z, mate}, ...].
    */
    gerarCandidatos: function (carrier) {
        const out = [];
        if (!carrier) return out;

        const team = carrier.team;
        const teammates = (team === 'TeamA') ? Match.players : Match.opponents;
        const opponents = (team === 'TeamA') ? Match.opponents : Match.players;
        const bb = (typeof TeamAI !== 'undefined') ? TeamAI.get(team) : null;
        const offsideLimitDir = (bb && bb.offsideLimitDir !== undefined) ? bb.offsideLimitDir : null;

        for (const mate of teammates) {
            if (mate === carrier || mate.role === 'gk') continue;

            // Impedimento: descarta TODOS os pontos deste companheiro.
            if (offsideLimitDir !== null) {
                const mateAdv = mate.model.position.z * mate.dirZ;
                if (mateAdv > offsideLimitDir) continue;
            }

            const mx = mate.model.position.x, mz = mate.model.position.z;

            /*
            FRENTE = para onde o jogador está VIRADO.

            Duas versões erradas antes desta:

            1. `mate.dirZ` — o eixo de ataque da equipa (±Z). O leque
               apontava para a baliza adversária viesse o jogador de onde
               viesse, de través com a corrida dele.
            2. a velocidade — certa a correr, mas nula quem está parado, e
               aí caía outra vez no `dirZ`: corpo virado para um lado, os
               49 pontos para o outro.

            A orientação do modelo resolve os dois casos de uma vez. Não é
            um terceiro critério: o `steerArrive` roda o corpo para o alvo
            do movimento todos os frames, por isso a correr ela JÁ é a
            direcção da corrida — e parado continua a dizer alguma coisa
            (para onde ele olha), que é o que a velocidade não faz.

            Frente local do modelo é +Z: o steerArrive monta a rotação com
            `lookAt(pos, pos*2 - alvo)`, cujo eixo +Z fica a apontar ao
            alvo. Ver player.js.
            */
            _vFwd.set(0, 0, 1).applyQuaternion(mate.model.quaternion);
            _vFwd.y = 0;
            let fx = _vFwd.x, fz = _vFwd.z;
            const lenF = Math.hypot(fx, fz);
            if (lenF > 0.001) { fx /= lenF; fz /= lenF; } else { fx = 0; fz = mate.dirZ; }

            for (let j = this.arcos; j >= 1; j--) {
                const raio = j * this.espacamento;
                for (let k = 1; k <= this.pontosPorArco; k++) {
                    /*
                    Leque centrado na frente do companheiro: com 7 pontos de
                    15° dá -45°..+45°. O 180 de partida era escrito já somado
                    (`120 + 15*k`), o que só ficava centrado para esses dois
                    valores exactos — mexer num dos números torcia o leque
                    todo para um lado.
                    */
                    const meio = this.passoAngular * (this.pontosPorArco + 1) / 2;
                    const offsetRad = (this.passoAngular * k - meio) * Math.PI / 180;
                    const cosO = Math.cos(offsetRad), sinO = Math.sin(offsetRad);

                    // Vector da frente (fx,fz) rodado por offsetRad em torno de Y.
                    const px = mx + (fx * cosO + fz * sinO) * raio;
                    const pz = mz + (fz * cosO - fx * sinO) * raio;

                    if (!this.pontoValido(px, pz, carrier, opponents)) continue;
                    out.push({ x: px, z: pz, mate: mate });
                }
            }
        }

        return out;
    },

    rebuild: function () {
        this.ensureGroup();
        this._usados = 0;

        /*
        `ballCarrier` fica a null em cada toque da condução (touchLock) e
        durante todo o voo de um passe — ou seja, boa parte do tempo em que
        a bola está viva. Ler só esse campo apagava o leque inteiro nesses
        instantes, e o efeito no ecrã era um pisca-pisca.

        `lastTouchedPlayer` cobre essa janela: na condução é o próprio
        condutor, num passe é quem o fez. O leque continua a ser desenhado
        em torno da equipa que tem a bola.
        */
        const carrier = Match.ballCarrier || Match.lastTouchedPlayer;
        if (!carrier) { this.esconderResto(); return; }

        const cands = this.gerarCandidatos(carrier);
        for (const c of cands) {
            const dot = this.getDot();
            dot.position.set(c.x, 0.05, c.z);
        }

        this.esconderResto();
    },

    // `teammates` saiu da assinatura com a regra do "mais próximo": nenhuma
    // das regras que restam olha para os colegas.
    pontoValido: function (px, pz, carrier, opponents) {
        if (Math.abs(px) > CAMPO_LARG / 2 || Math.abs(pz) > CAMPO_COMP / 2) return false;

        const cx = carrier.model.position.x, cz = carrier.model.position.z;
        const distBola = Math.hypot(px - cx, pz - cz);
        if (distBola > 30) return false;

        /*
        Adversário em cima do ponto: dentro de `raioAdversario` metros, a
        bola chega-lhe ao pé — descarta.

        Era "o jogador mais próximo do ponto é um adversário". Medido num
        11v11 a meio-campo, essa versão cortava 61.5% dos pontos e deixava
        colegas com 2 pontos em 49: nos arcos de fora (12-21 m) o ponto
        está quase sempre mais perto de ALGUM adversário do que de qualquer
        colega, num bloco compacto, mesmo quando o receptor já corre para
        lá e o adversário está parado de costas. A regra media a densidade
        do bloco, não a hipótese de o passe chegar.

        Um raio fixo não depende de onde está o colega, por isso não
        penaliza os arcos longos — que são precisamente os que interessam
        para o passe em profundidade.
        */
        for (const o of opponents) {
            const d = Math.hypot(px - o.model.position.x, pz - o.model.position.z);
            if (d < this.raioAdversario) return false;
        }

        // Adversário na linha de passe: dentro de ±20° do ângulo bola->ponto
        // e mais perto da bola do que o próprio ponto candidato.
        const angPasse = Math.atan2(pz - cz, px - cx);
        for (const o of opponents) {
            if (o.role === 'gk') continue;
            const dO = Math.hypot(o.model.position.x - cx, o.model.position.z - cz);
            if (dO >= distBola) continue;
            const angO = Math.atan2(o.model.position.z - cz, o.model.position.x - cx);
            let diff = Math.abs(angO - angPasse);
            diff = Math.min(diff, Math.PI * 2 - diff);
            if (diff <= 20 * Math.PI / 180) return false;
        }

        return true;
    }
};
