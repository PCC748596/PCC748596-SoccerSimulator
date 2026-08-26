/*
=============================================================================
PlayerPassTarget — pontos candidatos para passe
=============================================================================
Implementa o algoritmo clássico de geração de pontos candidatos ao redor de
cada companheiro de equipa (sem bola) do jogador com a posse, filtrando os
que seriam facilmente interceptados.

O leque é consumido pelo PassTypes (ver pontosPorMate em pass_types.js): é
dele que saem os pontos de mira `space` / `leading` / `direct` de cada passe.
A visualização de debug que existia aqui foi removida — nada disto desenha.

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
    raioAdversario: 2.0,   // adversário a menos disto do ponto -> ponto descartado

    /*
    ALCANCE DO RECEPTOR — o filtro que faltava.

    Os sete arcos põem pontos até 21 m à frente do companheiro, e nenhum dos
    filtros perguntava se ele CHEGA LÁ: nem o do campo, nem o do adversário em
    cima do ponto, nem o da linha de passe. O `leading` escolhe de propósito o
    ponto vivo mais adiantado, portanto ia buscar o arco de fora sempre que o
    campo estivesse limpo — e o passe saía para onde nunca ninguém ia. Pior:
    ficava mais longo justamente quando a defesa estava organizada e não havia
    lá ninguém para invalidar os pontos de fora.

    O limite é físico. O companheiro só apanha o ponto se lá chegar no tempo
    que a bola demora a percorrer o caminho:

        tempo de voo = distância(bola -> ponto) / velocidadeMediaDaBola
        alcance      = velocidade dele * tempo de voo * margem

    `velocidadeMediaBola` é a mesma média do lead do initiatePass (player.js) —
    a de saída é maior, mas o arrasto e o atrito travam a bola ao longo do
    percurso, e é a média que conta para saber quem lá chega.

    `margemAlcance` abaixo de 1 porque ele não parte na direcção certa nem
    acelera de repente: pedir-lhe o alcance teórico completo é pedir-lhe uma
    corrida perfeita.

    `alcanceMinimo` garante que o primeiro arco sobrevive sempre. Sem isso um
    jogador parado ficava sem passe no vazio nenhum, e trocava-se "longe de
    mais" por "nunca" — que é o mesmo defeito ao contrário.
    */
    velocidadeMediaBola: 11.0,
    margemAlcance: 0.8,
    alcanceMinimo: 3.0,

    /*
    Até onde vale a pena pôr pontos à frente DESTE companheiro, dado onde a
    bola está agora.

    Resolve-se por arco em vez de fechar uma fórmula: o tempo de voo depende da
    distância da BOLA ao ponto, que muda com o raio. Percorrer os arcos de fora
    para dentro (é a ordem do gerador) e ficar pelo primeiro que ele alcança dá
    o mesmo resultado sem resolver equação nenhuma.
    */
    alcancaOPonto: function (mate, raio, distBolaAoPonto) {
        if (raio <= this.alcanceMinimo) return true;
        const vMate = (mate && mate.speedMult) ? mate.speedMult : 3.5;
        const tVoo = distBolaAoPonto / this.velocidadeMediaBola;
        return raio <= vMate * tVoo * this.margemAlcance;
    },

    /*
    Gera a lista de candidatos sobreviventes para o `carrier` — pura, sem
    THREE (ver pontosPorMate em pass_types.js e findGridPassTarget em
    player_bt.js). Devolve [{x, z, mate}, ...].
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
            FRENTE = direcção do movimento, ou direcção de ataque se parado.

            A versão anterior usava `mate.model.quaternion`, mas o `steerArrive` 
            agora roda o corpo do jogador para olhar para a bola quando está em 
            AFT_SUPPORT. Isso fazia o leque apontar a 90 graus (para a bola) 
            e os passes no vazio iam de lado!
            */
            let fx, fz;
            const velLen = Math.hypot(mate.velocity.x, mate.velocity.z);
            if (velLen > 0.5) {
                fx = mate.velocity.x;
                fz = mate.velocity.z;
            } else {
                fx = 0;
                fz = mate.dirZ;
            }
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

                    // O companheiro chega lá dentro do tempo de voo? Ver
                    // alcancaOPonto: sem isto o leading ia buscar o arco de
                    // fora e o passe saía para o vazio.
                    const distBola = Math.hypot(px - carrier.model.position.x,
                        pz - carrier.model.position.z);
                    if (!this.alcancaOPonto(mate, raio, distBola)) continue;

                    out.push({ x: px, z: pz, mate: mate });
                }
            }
        }

        return out;
    },

    // `teammates` saiu da assinatura com a regra do "mais próximo": nenhuma
    // das regras que restam olha para os colegas.
    pontoValido: function (px, pz, carrier, opponents) {
        const margem = (typeof PassModel !== 'undefined' && PassModel.margemSegurancaLinha) ? PassModel.margemSegurancaLinha : 2.5;
        if (Math.abs(px) > (CAMPO_LARG / 2) - margem || Math.abs(pz) > (CAMPO_COMP / 2) - margem) return false;

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
