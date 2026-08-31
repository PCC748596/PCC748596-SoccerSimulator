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

    /*
    `avanco` é o zAtk cru, em metros. Sem ele a tabela de misturas só sabia
    em que terço cada ponta está, e um passe para trás dentro do mesmo terço
    era indistinguível de um passe para a frente — caía na misturaPadrao e
    era jogado no espaço, à frente de quem recebe.
    */
    zonaDe: function (x, zAtk) {
        return { sector: this.sectorDe(zAtk), corredor: this.corredorDe(x), avanco: zAtk };
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
    Frente do companheiro: para onde o CORPO dele aponta, no plano.

    Mesma convenção do leque em pass_candidates.js — frente local é +Z — mas
    calculada à mão em vez de com applyQuaternion: este ficheiro é importado
    directamente pelos testes em Node, onde o THREE não existe.

    Rodar (0,0,1) por um quaternião (x,y,z,w) dá, nas componentes do plano:
        fx = 2*(x*z + w*y)
        fz = 1 - 2*(x*x + y*y)

    Sem quaternião (ou com um degenerado) fica o eixo de ataque da equipa, que
    é o mesmo recurso que o leque usa.
    */
    frenteDe: function (mate) {
        const q = mate.model && mate.model.quaternion;
        if (q) {
            const fx = 2 * (q.x * q.z + q.w * q.y);
            const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
            const len = Math.hypot(fx, fz);
            if (len > 0.001) return { fx: fx / len, fz: fz / len };
        }
        return { fx: 0, fz: mate.dirZ || 1 };
    },

    /*
    Ponto de mira alguns metros à frente do companheiro, SEM passar pelo leque
    de candidatos nem pelos filtros dele.

    É o que impede o passe de cair aos pés sempre que o leque vem vazio — num
    bloco compacto, a maior parte das vezes. Encurta perante um adversário em
    vez de desistir; só devolve null se nem à distância mínima houver espaço,
    ou se o ponto sair do campo.

    O `curto: true` distingue-o de um ponto do leque: quem consome usa-o para
    escolher a balística (ver aplicarMiraDoPasse em bt/player_bt.js) — uma bola
    de 4 m não se joga com a lentidão de um lançamento de 20.
    */
    pontoLiderancaCurta: function (mate, opponents) {
        if (!mate || !mate.model || typeof PassTypeModel === 'undefined') return null;

        const M = PassTypeModel;
        const raio = (typeof PassCandidates !== 'undefined')
            ? PassCandidates.raioAdversario : 2.0;

        const f = this.frenteDe(mate);
        const mx = mate.model.position.x, mz = mate.model.position.z;
        const margem = (typeof PassModel !== 'undefined' && PassModel.margemSegurancaLinha) ? PassModel.margemSegurancaLinha : 2.5;
        const meiaLarg = (CAMPO_LARG / 2) - margem, meioComp = (CAMPO_COMP / 2) - margem;
        const lista = opponents || [];

        for (let d = M.liderancaCurta; d >= M.liderancaMin - 1e-9; d -= M.liderancaPasso) {
            const px = mx + f.fx * d;
            const pz = mz + f.fz * d;

            if (Math.abs(px) > meiaLarg || Math.abs(pz) > meioComp) continue;

            let livre = true;
            for (const o of lista) {
                if (!o || o.role === 'gk' || !o.model) continue;
                if (Math.hypot(o.model.position.x - px, o.model.position.z - pz) < raio) {
                    livre = false;
                    break;
                }
            }
            if (livre) return { x: px, z: pz, curto: true };
        }

        return null;
    },

    /*
    Resolve o ponto de mira do tipo pedido.

    Ordem: primeiro o leque (pontos já validados contra adversários e linhas de
    passe), depois o ponto curto à frente. Só quando nem esse existe é que a
    bola vai aos pés.

    Era só a primeira metade: sem ponto no leque, `direct`. Como o leque vem
    vazio sempre que há gente à volta — e é aí que se joga a maior parte do
    tempo — o jogo travava a cada passe.

    `opponents` é opcional: sem ele não há como validar o ponto curto, e o
    comportamento é o antigo.
    */
    pontoPara: function (tipo, pontos, mate, golZ, opponents) {
        let pt = null;
        if (tipo === this.SPACE) pt = this.pontoMediano(pontos, mate);
        else if (tipo === this.LEADING) pt = this.pontoMaisPertoDoGolo(pontos, golZ, mate);
        else return { tipo: this.DIRECT, ponto: null };

        if (!pt && opponents) pt = this.pontoLiderancaCurta(mate, opponents);

        return pt ? { tipo: tipo, ponto: pt } : { tipo: this.DIRECT, ponto: null };
    },

    /*
    A BALÍSTICA PARA UM DESTINO JÁ DECIDIDO.

    O `escolher` faz duas coisas ao mesmo tempo: escolhe QUEM recebe e COMO a
    bola lá vai. Há decisões em que o "quem" já está tomado por cima — a saída
    de jogo para os defesas é uma delas — e nessas o `escolher` não serve: o
    alvo entra lá como SUGESTÃO, vale um `bonusSugerido` e concorre com todos
    os outros numa nota dominada pelo progresso para a baliza. Um passe para
    trás tem progresso negativo por definição, portanto perdia quase sempre e a
    bola saía para a frente.

    Isto é a segunda metade sozinha: mesmo leque, mesma mistura de tipos por
    zona, mesmo sorteio — só sem votação nenhuma sobre o destino.
    */
    paraCompanheiro: function (carrier, mate, rnd) {
        if (!carrier || !mate || typeof PassTypeModel === 'undefined') return null;

        const dirZ = carrier.dirZ;
        const golZ = carrier.targetGoalZ;
        const opponents = (carrier.team === 'TeamA') ? Match.opponents : Match.players;

        const origem = this.zonaDe(carrier.model.position.x, carrier.model.position.z * dirZ);
        const destino = this.zonaDe(mate.model.position.x, mate.model.position.z * dirZ);

        const pontos = this.pontosPorMate(carrier)[mate.id] || [];
        const tipo = this.sortear(this.misturaPara(origem, destino), rnd);
        const res = this.pontoPara(tipo, pontos, mate, golZ, opponents);

        return { mate: mate, tipo: res.tipo, ponto: res.ponto };
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
        const opponents = (carrier.team === 'TeamA') ? Match.opponents : Match.players;
        return this.pontoPara(tipo, pontos, mate, carrier.targetGoalZ, opponents);
    },

    /*
    Quantos pontos tem o leque de UM companheiro, no máximo. Sai do
    PassCandidates e não de um 49 escrito à mão: mexer na densidade do leque não
    pode voltar a desequilibrar a escolha em silêncio.
    */
    maxPontosLeque: function () {
        if (typeof PassCandidates === 'undefined') return 49;
        return PassCandidates.arcos * PassCandidates.pontosPorArco;
    },

    /*
    Quão pressionado está o portador, de 0 (ninguém por perto) a 1 (adversário
    em cima). `distMaisPerto` é a distância ao adversário mais próximo dele.
    */
    pressaoSobrePortador: function (distMaisPerto, raio) {
        if (!isFinite(distMaisPerto)) return 0;
        const t = Math.max(0, Math.min(1, distMaisPerto / raio));
        return 1 - t;
    },

    /*
    Interpola entre os dois conjuntos de pesos conforme a pressão.
    */
    pesosPorPressao: function (pressao, carrier) {
        const E = PassTypeModel.escolha;
        const t = Math.max(0, Math.min(1, pressao));
        const a = E.pesosSemPressao, b = E.pesosSobPressao;

        let progresso = a.progresso + (b.progresso - a.progresso) * t;

        /*
        O defesa pressionado desvaloriza ainda mais o progresso — ver
        escolha.progressoDefesaSobPressao. Interpolado pela própria pressão:
        sem ninguém por perto o defesa escolhe como toda a gente.
        */
        if (carrier && carrier.role === 'def' &&
            typeof E.progressoDefesaSobPressao === 'number') {
            const f = 1 + (E.progressoDefesaSobPressao - 1) * t;
            progresso *= f;
        }

        return {
            progresso: progresso,
            espaco: a.espaco + (b.espaco - a.espaco) * t,
            distancia: a.distancia + (b.distancia - a.distancia) * t,
            linha: a.linha + (b.linha - a.linha) * t
        };
    },

    /*
    QUALIDADE DA LINHA DE PASSE, de 0 (alguém em cima da recta) a 1 (corredor
    limpo), para a distância deste passe.

    É a mesma conta do `findPassTarget` (player.js), e é a mesma de propósito:
    ali a linha era medida e pesada, aqui — onde o receptor é mesmo decidido —
    não era medida de todo, e as duas camadas julgavam a mesma linha por
    réguas diferentes. O corredor cresce com a distância porque um defesa a
    3 m da recta não chega a uma bola de 8 m e chega de sobra a uma de 35 m.

    `alvoDirZ` é o avanço do PONTO DE MIRA no referencial de ataque: perto da
    baliza o `factorUltimoTerco` perdoa a linha apertada, porque a área é o
    sítio mais congestionado do campo e exigir linha limpa ali é exigir que
    nunca se jogue para dentro dela.
    */
    qualidadeDaLinha: function (folga, dist, alvoDirZ) {
        if (typeof PassLineModel === 'undefined') return 1;
        const PL = PassLineModel;
        const corredor = Math.min(PL.corredorMax,
            PL.corredorBase + dist * PL.corredorPorMetro);

        let q = (folga - PL.bloqueioDuro) / Math.max(0.001, corredor - PL.bloqueioDuro);
        q = Math.max(0, Math.min(1, q));

        if (alvoDirZ > PL.ultimoTercoZ) q = 1 - (1 - q) * PL.factorUltimoTerco;
        return q;
    },

    /*
    Nota de um candidato a receber. Os quatro argumentos vêm normalizados a
    0..1 por quem chama — o progresso pode ser negativo num passe para trás.
    */
    notaCandidato: function (progressoNorm, espacoNorm, distNorm, linhaNorm, pesos) {
        return progressoNorm * pesos.progresso
            + espacoNorm * pesos.espaco
            - distNorm * pesos.distancia
            + linhaNorm * pesos.linha;
    },

    // Distância do portador ao adversário mais próximo. Infinity se não houver.
    distAdversarioMaisPerto: function (carrier) {
        if (typeof Match === 'undefined') return Infinity;
        const opps = (carrier.team === 'TeamA') ? Match.opponents : Match.players;
        const cx = carrier.model.position.x, cz = carrier.model.position.z;

        let melhor = Infinity;
        for (const o of opps) {
            if (!o || !o.model) continue;
            const d = Math.hypot(o.model.position.x - cx, o.model.position.z - cz);
            if (d < melhor) melhor = d;
        }
        return melhor;
    },

    /*
    Melhor companheiro para atrasar a bola: atrás da linha do portador e a menos
    de `raioRecuo`. Entre os que servem, o mais perto.

    O raio é o que interessa aqui. Sem ele, um médio sob pressão atrasava para o
    guarda-redes a quarenta metros, e isso não é reiniciar a jogada — é fugir
    dela. Qualquer jogador serve, guarda-redes incluído: não é o papel que
    exclui, é a distância.
    */
    melhorRecuo: function (carrier) {
        if (typeof Match === 'undefined' || typeof PassTypeModel === 'undefined') return null;

        const raio = PassTypeModel.escolha.raioRecuo;
        const mates = (carrier.team === 'TeamA') ? Match.players : Match.opponents;
        const cx = carrier.model.position.x, cz = carrier.model.position.z;
        const dirZ = carrier.dirZ;

        let melhor = null, melhorD = Infinity;
        for (const m of mates) {
            if (m === carrier || !m.model) continue;

            // Atrás no referencial de ataque do portador.
            const avanco = (m.model.position.z - cz) * dirZ;
            if (avanco >= 0) continue;

            const d = Math.hypot(m.model.position.x - cx, m.model.position.z - cz);
            if (d > raio) continue;

            let bloqueado = false;
            const opponents = (carrier.team === 'TeamA') ? Match.opponents : Match.players;
            for (const opp of opponents) {
                if (opp.role === 'gk') continue;
                const dx = m.model.position.x - cx;
                const dz = m.model.position.z - cz;
                const l2 = dx * dx + dz * dz;
                if (l2 === 0) continue;
                
                let t = ((opp.model.position.x - cx) * dx + (opp.model.position.z - cz) * dz) / l2;
                
                // Só considera adversários que estão efetivamente entre o portador e o alvo
                if (t >= -0.1 && t <= 1.1) {
                    const px = cx + t * dx;
                    const pz = cz + t * dz;
                    const distOppToLine = Math.hypot(opp.model.position.x - px, opp.model.position.z - pz);
                    
                    // Impede o passe se o adversário estiver bloqueando a linha de passe
                    if (distOppToLine < 1.2) {
                        bloqueado = true;
                        break;
                    }
                }
            }
            if (bloqueado) continue;

            if (d < melhorD) { melhorD = d; melhor = m; }
        }
        return melhor;
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
        const opponents = (carrier.team === 'TeamA') ? Match.opponents : Match.players;

        // Os pesos dependem de quão pressionado está QUEM PASSA, e por isso
        // calculam-se uma vez, fora do laço dos candidatos.
        const pressao = this.pressaoSobrePortador(
            this.distAdversarioMaisPerto(carrier), E.raioPressao);
        const pesos = this.pesosPorPressao(pressao, carrier);

        let melhor = null, melhorNota = -Infinity;

        for (const mate of teammates) {
            if (mate === carrier || mate.role === 'gk') continue;

            const mx = mate.model.position.x, mz = mate.model.position.z;
            const dist = Math.hypot(mx - cx, mz - cz);
            if (dist > E.distanciaMax) continue;

            const destino = this.zonaDe(mx, mz * dirZ);
            const pontos = mapa[mate.id] || [];

            const tipoSorteado = this.sortear(this.misturaPara(origem, destino), rnd);
            const res = this.pontoPara(tipoSorteado, pontos, mate, golZ, opponents);

            // Progresso: quanto o PONTO DE MIRA adianta a bola para a
            // baliza. Num passe directo o ponto é o próprio companheiro.
            const alvoZ = res.ponto ? res.ponto.z : mz;
            const progresso = (alvoZ - cz) * dirZ;

            /*
            Três termos normalizados a 0..1 e só depois pesados. O do espaço era
            a CONTAGEM de pontos vivos do leque (até 49), contra um progresso
            que raramente passava de 40: um companheiro isolado na lateral
            ganhava por estar isolado.

            O progresso pode ser negativo — um passe para trás perde terreno —
            e por isso o clamp é a -1, não a 0.
            */
            const progressoNorm = Math.max(-1, Math.min(1, progresso / E.progressoRef));
            const espacoNorm = Math.min(1, pontos.length / this.maxPontosLeque());
            const distNorm = Math.max(0, Math.min(1, dist / E.distanciaMax));

            /*
            A LINHA ATÉ AO PONTO DE MIRA — e não até ao companheiro: num passe
            para o espaço a bola vai ao ponto, e é esse o caminho que alguém
            corta. O guarda-redes fica de fora, como em todos os outros testes
            de linha: ele não sai da baliza a intercetar passes no meio-campo.
            */
            const alvoX = res.ponto ? res.ponto.x : mx;
            const folga = folgaDaLinha(cx, cz, alvoX, alvoZ,
                opponents.filter(o => o && o.role !== 'gk').map(o => o.model.position));

            /*
            Corte DURO, e não mais um peso: com alguém literalmente em cima da
            recta a bola não passa, e uma nota — por mais baixa que seja —
            continua a competir e a poder ganhar por não haver melhor. Descarta
            como o `findPassTarget` já descarta, com o mesmo `bloqueioDuro` e
            sem excepção para o último terço: o `factorUltimoTerco` é apetite
            de risco, e isto é geometria.

            Sem ninguém que sobreviva, o `escolher` devolve null e o `actPass`
            desce a cascata (atrasar a alguém perto, conduzir) — que é o que se
            faz quando não há linha nenhuma, em vez de pôr a bola no adversário.
            */
            if (typeof PassLineModel !== 'undefined' && folga < PassLineModel.bloqueioDuro) continue;

            const linhaNorm = this.qualidadeDaLinha(folga, dist, alvoZ * dirZ);

            /*
            DEFESA PRESSIONADO NÃO JOGA PARA A FRENTE POR LINHA APERTADA.
            Ver escolha.linhaMinDefesaFrente — o peso sozinho não mexeu no
            resultado, isto é um corte.
            */
            if (carrier.role === 'def' && pressao >= (E.pressaoMinDefesa ?? 0.45) &&
                typeof E.linhaMinDefesaFrente === 'number') {
                const paraAFrente = (alvoZ - cz) * dirZ > 0;
                if (paraAFrente && linhaNorm < E.linhaMinDefesaFrente) continue;
            }

            let nota = this.notaCandidato(progressoNorm, espacoNorm, distNorm,
                linhaNorm, pesos);
            if (mate === sugerido) nota += E.bonusSugerido;

            if (nota > melhorNota) {
                melhorNota = nota;
                melhor = { mate: mate, tipo: res.tipo, ponto: res.ponto, nota: nota };
            }
        }

        return melhor;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PassTypes };
}
