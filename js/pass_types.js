/*
=============================================================================
PassTypes — escolhe o TIPO de passe, o ponto que ele mira, e quem o recebe
=============================================================================
Até aqui todo o passe normal ia aos pés do companheiro: `findPassTarget`
escolhia a pessoa e `alvoDePasse` mirava onde ela estaria. O leque de pontos
do PlayerPassTarget (pass_candidates.js) existia mas não alimentava decisão
nenhuma.

Este módulo liga as duas coisas. Para cada companheiro possível:

    1. vê de que sector/corredor sai o passe e para onde vai;
    2. sorteia o tipo com a mistura dessa combinação (PassTypeModel.regras);
    3. resolve o PONTO que esse tipo manda mirar;
    4. pontua o companheiro — e é aqui que o tipo mexe em QUEM recebe: num
       passe para o espaço pesa mais quem tem espaço à frente.

O ponto sai sempre do leque já filtrado (sem adversários a menos de 2m, sem
linha de passe tapada, sem fora-de-jogo), por isso "espaço" aqui é espaço a
sério, não uma coordenada no vazio.

`direct` devolve ponto nulo de propósito: quem consome trata isso como "aos
pés", que é o caminho antigo do initiatePass.
=============================================================================
*/
const PassTypes = {
    DIRECT: 'direct',
    SPACE: 'space',
    LEADING: 'leading',

    /* ---------------------------------------------------------------
       Zonas
       --------------------------------------------------------------- */

    /*
    Sector pelo terço do campo, no referencial de ataque de quem passa
    (z * dirZ) — mesma convenção do MarkingModel.distanciaPara e das stats
    de posse por terço.
    */
    sectorDe: function (zAtk) {
        const terco = CAMPO_COMP / 6;
        if (zAtk < -terco) return 'def';
        if (zAtk > terco) return 'atk';
        return 'mid';
    },

    // Corredor central ou lateral. Não distingue esquerda de direita: a
    // tabela de misturas trata os dois lados por igual.
    corredorDe: function (x) {
        return (Math.abs(x) < PassTypeModel.larguraCentro) ? 'centro' : 'lado';
    },

    zonaDe: function (x, zAtk) {
        return { sector: this.sectorDe(zAtk), corredor: this.corredorDe(x) };
    },

    /*
    Primeira regra que casa manda; nenhuma casa -> mistura padrão.
    */
    misturaPara: function (origem, destino) {
        for (const r of PassTypeModel.regras) {
            if (r.quando(origem, destino)) return r.mistura;
        }
        return PassTypeModel.misturaPadrao;
    },

    /*
    Sorteia um tipo a partir da mistura. `rnd` injectável para os testes
    poderem varrer o intervalo [0,1) em vez de esperar pela sorte.
    */
    sortear: function (mistura, rnd) {
        const r = (rnd === undefined ? Math.random() : rnd);
        let acc = 0;
        for (const tipo of [this.DIRECT, this.SPACE, this.LEADING]) {
            const peso = mistura[tipo] || 0;
            if (peso <= 0) continue;
            acc += peso;
            if (r < acc) return tipo;
        }
        // Só chega aqui por arredondamento numa mistura que soma <1.
        return this.DIRECT;
    },

    /* ---------------------------------------------------------------
       Pontos
       --------------------------------------------------------------- */

    /*
    Mediana em PROFUNDIDADE: ordena os pontos vivos pela distância ao
    companheiro e devolve o do meio. Metade do leque fica aquém, metade
    além.

    Mediana e não média das coordenadas: a média dá um ponto que pode não
    existir no leque — e, com os pontos de um dos lados cortados por um
    adversário, cai enviesada para o lado livre, longe de qualquer
    candidato validado. A mediana devolve sempre um ponto real, já filtrado.
    */
    pontoMediano: function (pontos, mate) {
        if (!pontos.length) return null;
        const mx = mate.model.position.x, mz = mate.model.position.z;
        const ord = pontos.slice().sort((a, b) =>
            Math.hypot(a.x - mx, a.z - mz) - Math.hypot(b.x - mx, b.z - mz));
        return ord[Math.floor(ord.length / 2)];
    },

    /*
    Leading: o ponto vivo mais perto da baliza que se ataca.

    Só entram pontos que ADIANTEM mesmo a bola — mais perto do golo do que o
    próprio companheiro. Sem esta condição, um companheiro virado para trás
    (a recuar a dar linha, coisa banal) tinha o leque todo atrás dele, e o
    "mais perto do golo" era um ponto 2 m NAS COSTAS DELE: um leading pass
    para a própria baliza. Se nenhum ponto adianta, não há leading — quem
    chama trata isso como passe aos pés.
    */
    pontoMaisPertoDoGolo: function (pontos, golZ, mate) {
        const dGolo = (x, z) => Math.hypot(x, z - golZ);
        const dMate = mate
            ? dGolo(mate.model.position.x, mate.model.position.z)
            : Infinity;

        let melhor = null, melhorD = Infinity;
        for (const pt of pontos) {
            const d = dGolo(pt.x, pt.z);
            if (d >= dMate) continue;
            if (d < melhorD) { melhorD = d; melhor = pt; }
        }
        return melhor;
    },

    /*
    Resolve o ponto de mira do tipo pedido. Sem pontos vivos que sirvam,
    cai para `direct` — um passe para o espaço sem espaço nenhum é uma bola
    atirada fora.
    */
    pontoPara: function (tipo, pontos, mate, golZ) {
        if (tipo === this.SPACE) {
            const pt = this.pontoMediano(pontos, mate);
            return pt ? { tipo: tipo, ponto: pt } : { tipo: this.DIRECT, ponto: null };
        }
        if (tipo === this.LEADING) {
            const pt = this.pontoMaisPertoDoGolo(pontos, golZ, mate);
            return pt ? { tipo: tipo, ponto: pt } : { tipo: this.DIRECT, ponto: null };
        }
        return { tipo: this.DIRECT, ponto: null };
    },

    /* ---------------------------------------------------------------
       Escolha do receptor
       --------------------------------------------------------------- */

    // Agrupa o leque por companheiro: { idDoMate: [pontos...] }.
    pontosPorMate: function (carrier) {
        const mapa = {};
        if (typeof PassCandidates === 'undefined') return mapa;
        for (const c of PassCandidates.gerarCandidatos(carrier)) {
            const k = c.mate.id;
            (mapa[k] = mapa[k] || []).push(c);
        }
        return mapa;
    },

    /*
    Tipo e ponto para um companheiro JÁ escolhido — usado quando quem chama
    não quer que o receptor seja trocado (a saída do guarda-redes pelos
    laterais, por exemplo).
    */
    paraMate: function (carrier, mate, rnd) {
        if (!carrier || !mate || typeof PassTypeModel === 'undefined') {
            return { tipo: this.DIRECT, ponto: null };
        }
        const dirZ = carrier.dirZ;
        const origem = this.zonaDe(carrier.model.position.x, carrier.model.position.z * dirZ);
        const destino = this.zonaDe(mate.model.position.x, mate.model.position.z * dirZ);
        const pontos = (this.pontosPorMate(carrier)[mate.id]) || [];
        const tipo = this.sortear(this.misturaPara(origem, destino), rnd);
        return this.pontoPara(tipo, pontos, mate, carrier.targetGoalZ);
    },

    /*
    Devolve { mate, tipo, ponto } ou null (nada melhor do que o caminho
    antigo). `sugerido` é o companheiro que o BT já tinha escolhido: entra
    na corrida com `bonusSugerido` de avanço, por isso só é trocado por uma
    alternativa claramente melhor.
    */
    escolher: function (carrier, sugerido, rnd) {
        if (!carrier || typeof PassTypeModel === 'undefined') return null;

        const E = PassTypeModel.escolha;
        const dirZ = carrier.dirZ;
        const golZ = carrier.targetGoalZ;
        const cx = carrier.model.position.x, cz = carrier.model.position.z;
        const origem = this.zonaDe(cx, cz * dirZ);

        const mapa = this.pontosPorMate(carrier);
        const teammates = (carrier.team === 'TeamA') ? Match.players : Match.opponents;

        let melhor = null, melhorNota = -Infinity;

        for (const mate of teammates) {
            if (mate === carrier || mate.role === 'gk') continue;

            const mx = mate.model.position.x, mz = mate.model.position.z;
            const dist = Math.hypot(mx - cx, mz - cz);
            if (dist > E.distanciaMax) continue;

            const destino = this.zonaDe(mx, mz * dirZ);
            const pontos = mapa[mate.id] || [];

            const tipoSorteado = this.sortear(this.misturaPara(origem, destino), rnd);
            const res = this.pontoPara(tipoSorteado, pontos, mate, golZ);

            // Progresso: quanto o PONTO DE MIRA adianta a bola para a
            // baliza. Num passe directo o ponto é o próprio companheiro.
            const alvoZ = res.ponto ? res.ponto.z : mz;
            const progresso = (alvoZ - cz) * dirZ;

            let nota = progresso * E.pesoProgresso
                + pontos.length * E.pesoEspaco
                - dist * E.pesoDistancia;
            if (mate === sugerido) nota += E.bonusSugerido;

            if (nota > melhorNota) {
                melhorNota = nota;
                melhor = { mate: mate, tipo: res.tipo, ponto: res.ponto };
            }
        }

        return melhor;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PassTypes };
}
