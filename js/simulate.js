/*
=============================================================================
SIMULAÇÃO EM LOTE — correr jogos sem ecrã, medir em vez de ver
=============================================================================
Conduz Match.update(dt) directamente, sem passar por requestAnimationFrame
nem por renderer.render(). Corre dentro da mesma página (não em Node): o
jogo já está cheio de document.createElement/getElementById espalhados por
match.js/player.js, e replicar isso num DOM falso seria muito mais trabalho
do que aproveitar o browser que já lá está.

Enquanto Sim.running é true, main.js->animate() salta o Match.update() e o
render() (ver a guarda lá) para não haver dois "donos" do tick ao mesmo
tempo nem gasto de GPU à toa.

Uso (consola do browser, ou o botão "Simulação rápida" do painel):
    Sim.run({ jogos: 10, duracaoSeg: 120 })

No fim, descarrega um .json com o resumo de MatchStats de cada jogo e um
heatmap de posições (grelha 2m) por equipa.
=============================================================================
*/

function criarHeatmap(cellSize) {
    cellSize = cellSize || 2;
    const nx = Math.ceil(CAMPO_LARG / cellSize) + 2;
    const nz = Math.ceil(CAMPO_COMP / cellSize) + 2;
    return {
        cellSize: cellSize,
        nx: nx,
        nz: nz,
        TeamA: new Array(nx * nz).fill(0),
        TeamB: new Array(nx * nz).fill(0)
    };
}

function heatmapIndex(hm, x, z) {
    const ix = Math.round((x + CAMPO_LARG / 2) / hm.cellSize);
    const iz = Math.round((z + CAMPO_COMP / 2) / hm.cellSize);
    if (ix < 0 || ix >= hm.nx || iz < 0 || iz >= hm.nz) return -1;
    return iz * hm.nx + ix;
}

function registarHeatmap(hm) {
    const registar = (lista, key) => {
        for (const p of lista) {
            const idx = heatmapIndex(hm, p.model.position.x, p.model.position.z);
            if (idx >= 0) hm[key][idx]++;
        }
    };
    registar(Match.players, 'TeamA');
    registar(Match.opponents, 'TeamB');
}

// Devolve uma promessa que resolve no próximo "tick" do browser — usado
// para ceder o controlo entre lotes de passos e a página não gelar.
function cederAoBrowser() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/*
DESVIO DO ALVO POR ESTADO — quão longe do slot do bloco está o ponto para
onde cada jogador está mesmo a ir (`dynamicTarget` contra `slotTarget`, os
anéis maior e médio do debug).

Existe por causa das linhas enormes vistas no ecrã: um desvio de 10 m tem
explicação (marcação, estilo), um de 30 m não tem, e sem separar por estado
não se sabe se vem do chaser a ir à bola — onde é normal — ou de quem devia
estar quieto na posição.
*/
function criarDesvioStats() { return {}; }

function registarDesvios(stats, lista) {
    for (const p of lista) {
        if (!p || !p.slotTarget || !p.dynamicTarget || !p.fsm) continue;
        const estado = p.fsm.currentState;
        let st = stats[estado];
        if (!st) st = stats[estado] = { n: 0, soma: 0, soma2: 0, max: 0, maxPos: null };

        const d = Math.hypot(
            p.dynamicTarget.x - p.slotTarget.x,
            p.dynamicTarget.z - p.slotTarget.z);

        st.n++;
        st.soma += d;
        st.soma2 += d * d;
        if (d > st.max) {
            st.max = d;
            st.maxPos = p.pos;
        }
    }
}

function resumirDesvios(stats) {
    const linhas = [];
    for (const estado in stats) {
        const st = stats[estado];
        if (!st.n) continue;
        linhas.push({
            estado: estado,
            frames: st.n,
            desvioMedioM: +(st.soma / st.n).toFixed(2),
            desvioRmsM: +Math.sqrt(st.soma2 / st.n).toFixed(2),
            desvioMaxM: +st.max.toFixed(2),
            posicaoDoMax: st.maxPos
        });
    }
    linhas.sort((a, b) => b.desvioMaxM - a.desvioMaxM);
    return linhas;
}

/*
=============================================================================
CALIBRAÇÃO DE PLAYING STYLES — dispara mesmo? move de forma coerente?
=============================================================================
Uma chave por (estilo, posição) — o mesmo estilo calibra diferente consoante
a posição que o usa (ex.: creative_playmaker em SS não é o mesmo problema que
em RM). Em vez de guardar cada amostra (centenas de milhares de frames por
jogo), acumula-se soma e soma-dos-quadrados de dx/dz — dá média e desvio
padrão no fim sem gastar memória com o histórico completo.

desvio-padrão ~0 com ativações > 0 = SUSPEITO: o estilo liga mas o alvo não
sai do sítio (caso encontrado do `juntaSeAoAtaque`, que só emite evento e não
mexe em commit()).
=============================================================================
*/
function criarEstiloStats() {
    return {};
}

function chaveEstilo(p) {
    return p.playingStyle + '|' + p.pos;
}

function registarEstilos(stats, lista) {
    for (const p of lista) {
        if (p.role === 'gk' || !p.playingStyle || !p.slotTarget || !p.dynamicTarget) continue;

        const key = chaveEstilo(p);
        let st = stats[key];
        if (!st) {
            st = stats[key] = {
                style: p.playingStyle, pos: p.pos,
                framesAtivo: 0, framesTotal: 0, ativacoes: 0,
                dxSum: 0, dzSum: 0, dx2Sum: 0, dz2Sum: 0,
                offMax: 0,
                totX2Sum: 0, totZ2Sum: 0, totMax: 0
            };
        }

        st.framesTotal++;
        const ativo = !!p.styleAtivo && !p.playingStyleDesligado;
        // Estado anterior por JOGADOR, não pela chave partilhada — dois
        // jogadores (um por equipa) caem na mesma chave (estilo+posição) e,
        // se o "anterior" vivesse na chave, o segundo jogador processado no
        // frame pisava o estado do primeiro: toda leitura parecia transição.
        if (ativo && !p._estiloStatsPrevAtivo) st.ativacoes++;
        p._estiloStatsPrevAtivo = ativo;
        if (!ativo) continue;

        st.framesAtivo++;

        /*
        DOIS deslocamentos, e a diferença entre eles é o ponto todo.

        `styleTarget` é o posto DEPOIS do estilo e ANTES da marcação (o
        postoBase do PosicionamentoAI); `dynamicTarget` é o alvo final, com
        marcação, inquietação, tecto e alisamento por cima. Enquanto se media
        só o final contra o slot, um estilo que não fizesse nada aparecia com
        metros de deslocamento — os metros eram da marcação — e o `semEfeito`
        nunca disparava. O estilo mede-se pelo styleTarget.
        */
        const alvoEstilo = p.styleTarget || p.dynamicTarget;
        const dx = alvoEstilo.x - p.slotTarget.x;
        const dz = alvoEstilo.z - p.slotTarget.z;
        st.dxSum += dx; st.dzSum += dz;
        st.dx2Sum += dx * dx; st.dz2Sum += dz * dz;
        const off = Math.hypot(dx, dz);
        if (off > st.offMax) st.offMax = off;

        const tdx = p.dynamicTarget.x - p.slotTarget.x;
        const tdz = p.dynamicTarget.z - p.slotTarget.z;
        st.totX2Sum += tdx * tdx; st.totZ2Sum += tdz * tdz;
        const tot = Math.hypot(tdx, tdz);
        if (tot > st.totMax) st.totMax = tot;
    }
}

// Liga o estilo em toda a gente (o padrão vem desligado — match.js
// aplicarPlayingStyle) e devolve os valores antigos, para repor no fim.
function forcarEstilosLigados() {
    const anteriores = [];
    const todos = [].concat(Match.players || [], Match.opponents || []);
    for (const p of todos) {
        anteriores.push([p, p.playingStyleDesligado]);
        p.playingStyleDesligado = false;
    }
    return anteriores;
}

function restaurarEstilos(anteriores) {
    for (const [p, valor] of anteriores) p.playingStyleDesligado = valor;
}

/*
=============================================================================
COBERTURA FORÇADA — os 21 estilos, independente da formação do painel
=============================================================================
Nenhuma formação sozinha (442/433/4231, ver FormationsData) tem as 12
posições de campo distintas ao mesmo tempo (só cabem 10 jogadores fora o
GR) — logo nenhuma tem espaço para os 21 estilos de uma vez. A solução é
GIRAR as 3 formações ao longo do lote de jogos e, para cada uma, forçar
`playingStyleFixo` nos jogadores da posição certa (respeitado por
aplicarPlayingStyle em match.js — só cai no omisso se o fixo for inválido).

`SS` nunca aparece em nenhuma FormationsData, mas nenhum estilo depende
SÓ de SS (todos que a listam também servem AM/CM/LM/RM/LW/RW) — por isso
os 19 estilos de campo (exclui offensive_gk/defensive_gk, que não passam
por aqui — o GR tem ciclo de posicionamento próprio) são sempre alcançáveis
nalguma das 3 formações.

Se `filas` não esvaziar dentro de `opts.jogos`, o styles que sobrarem
ficam por testar nesta corrida — o aviso final (Sim.run) já assinala quem
nunca ativou.
=============================================================================
*/
const FORM_CYCLE = ['442', '433', '4231'];

function construirPlanoCobertura() {
    const planosPorFormacao = {};
    for (const forma of FORM_CYCLE) {
        const fData = FormationsData[forma];
        if (!fData) continue;
        const contagem = {};
        const porPos = {};
        fData.forEach((f, idx) => {
            if (f.role === 'gk') return;
            const idxPos = contagem[f.pos] || 0;
            contagem[f.pos] = idxPos + 1;
            (porPos[f.pos] = porPos[f.pos] || []).push(idx);
        });
        planosPorFormacao[forma] = porPos;
    }

    const filas = {}; // chave "forma|pos" -> fila de estilos por colocar
    const semFormacao = [];
    for (const chave in PlayingStyles) {
        if (chave.indexOf('_gk') >= 0) continue;
        const def = PlayingStyles[chave];
        let colocado = false;
        for (const pos of (def.posicoes || [])) {
            for (const forma of FORM_CYCLE) {
                if (planosPorFormacao[forma] && planosPorFormacao[forma][pos]) {
                    const key = forma + '|' + pos;
                    (filas[key] = filas[key] || []).push(chave);
                    colocado = true;
                    break;
                }
            }
            if (colocado) break;
        }
        if (!colocado) semFormacao.push(chave);
    }
    if (semFormacao.length) {
        console.warn('Sim: estilos sem posição em nenhuma formação, não calibráveis por rotação:', semFormacao.join(', '));
    }
    return { planosPorFormacao, filas };
}

// Aplica, para a formação escolhida NESTE jogo, um estilo pendente da fila
// a cada slot disponível daquela posição (nas duas equipas). `originais`
// guarda o valor de playingStyleFixo de cada jogador ANTES da primeira vez
// que esta calibração lhe mexeu — para repor no fim, mesmo que o mesmo
// jogador seja reescrito em vários jogos do lote.
function aplicarCoberturaNoJogo(plano, forma, originais) {
    const porPos = plano.planosPorFormacao[forma];
    if (!porPos) return;

    for (const pos in porPos) {
        const fila = plano.filas[forma + '|' + pos];
        if (!fila || !fila.length) continue;
        for (const idx of porPos[pos]) {
            if (!fila.length) break;
            const estilo = fila.shift();
            for (const p of [Match.players[idx], Match.opponents[idx]]) {
                if (!p) continue;
                if (!originais.has(p)) originais.set(p, p.playingStyleFixo);
                p.playingStyleFixo = estilo;
            }
        }
    }
}

// Resumo final: desvio padrão de dx/dz (mede se o alvo varia ou fica preso
// no mesmo desvio) e RMS do deslocamento (mede se o estilo desloca alguma
// coisa). Marca `semEfeito` quando ativa mas não desloca (>0 ativações, RMS
// desprezável) — sinal de flag sem código de posicionamento por trás.
function resumirEstilos(stats) {
    const linhas = [];
    for (const key in stats) {
        const st = stats[key];
        const n = st.framesAtivo || 1;
        const meanDx = st.dxSum / n, meanDz = st.dzSum / n;
        const stdDx = Math.sqrt(Math.max(0, st.dx2Sum / n - meanDx * meanDx));
        const stdDz = Math.sqrt(Math.max(0, st.dz2Sum / n - meanDz * meanDz));
        const rms = Math.sqrt((st.dx2Sum + st.dz2Sum) / n);
        linhas.push({
            estilo: st.style,
            posicao: st.pos,
            ativacoes: st.ativacoes,
            pctTempoAtivo: st.framesTotal ? +(100 * st.framesAtivo / st.framesTotal).toFixed(1) : 0,
            deslocamentoEstiloM: +rms.toFixed(2),
            deslocamentoEstiloMaxM: +st.offMax.toFixed(2),
            deslocamentoTotalM: +Math.sqrt((st.totX2Sum + st.totZ2Sum) / n).toFixed(2),
            deslocamentoTotalMaxM: +st.totMax.toFixed(2),
            desvioPadraoXM: +stdDx.toFixed(2),
            desvioPadraoZM: +stdDz.toFixed(2),
            semEfeito: st.ativacoes > 0 && rms < 0.3
        });
    }
    linhas.sort((a, b) => (a.semEfeito === b.semEfeito) ? (a.estilo < b.estilo ? -1 : 1) : (a.semEfeito ? -1 : 1));
    return linhas;
}


/*
=============================================================================
VIGIA DE JOGO ENCRAVADO
=============================================================================
Num lote de 5 jogos, um deles passou ~33 minutos com a bola parada no
meio-campo: 47 passes contra ~200 dos outros, 61 km percorridos contra 160 km,
e 2042 s de posse a somar sem nada acontecer. O relatório dá o SINTOMA e não o
momento, portanto não houve como saber onde começou.

Isto vigia a bola: se ela não se mexer mais do que `raio` durante `segundos`
seguidos de jogo, regista UMA vez o estado completo no momento — quem tem a
bola, em que estado está o Match, o que a FSM de cada jogador está a fazer.

É diagnóstico, não correcção: da próxima vez que acontecer, o relatório traz o
retrato do encrave em vez de só as suas consequências.
=============================================================================
*/
function criarVigia() {
    return {
        raio: 1.5,          // metros que a bola tem de percorrer para "contar"
        segundos: 25,       // tempo parada até se considerar encravada
        pos: null,
        parada: 0,
        registos: []
    };
}

function vigiarEncrave(v, jogo, tempoDeJogo, dt) {
    if (!v || typeof Match === 'undefined' || !Match.ball) return;

    const b = Match.ball.position;
    if (!v.pos) { v.pos = { x: b.x, z: b.z }; return; }

    const d = Math.hypot(b.x - v.pos.x, b.z - v.pos.z);
    if (d > v.raio) {
        v.pos = { x: b.x, z: b.z };
        v.parada = 0;
        v.jaRegistou = false;
        return;
    }

    v.parada += dt;
    if (v.parada < v.segundos || v.jaRegistou) return;
    v.jaRegistou = true;

    // Quem está a fazer o quê, agregado por estado da FSM.
    const porEstado = {};
    for (const p of [...Match.players, ...Match.opponents]) {
        const e = (p.fsm && p.fsm.currentState) || '?';
        porEstado[e] = (porEstado[e] || 0) + 1;
    }

    const reg = {
        jogo: jogo,
        aosSegundos: Math.round(tempoDeJogo),
        estadoDoMatch: Match.state,
        bola: { x: +b.x.toFixed(1), z: +b.z.toFixed(1) },
        portador: Match.ballCarrier ? `${Match.ballCarrier.team} ${Match.ballCarrier.pos}` : null,
        posse: Match.possessionTeam,
        setPieceTimer: +(Match.setPieceTimer || 0).toFixed(1),
        setPieceTaker: Match.setPieceTaker
            ? `${Match.setPieceTaker.team} ${Match.setPieceTaker.pos}` : null,
        emCampo: { TeamA: Match.players.length, TeamB: Match.opponents.length },
        estadosFSM: porEstado
    };
    v.registos.push(reg);
    console.warn(`Sim: JOGO ENCRAVADO — bola parada ${v.segundos}s ` +
        `no jogo ${jogo}, aos ${reg.aosSegundos}s.`, reg);
}

const Sim = {
    running: false,
    resultados: [],
    heatmap: null,

    /*
    opts.jogos       quantos jogos seguidos correr (default 10)
    opts.duracaoSeg  duração de jogo simulado por jogo, em segundos de
                      relógio interno — não é tempo real (default 300 = 5 min)
    opts.dt          passo fixo de cada Match.update() (default 1/60)
    opts.passosPorLote  quantos passos por lote antes de ceder ao browser
    opts.calibrarEstilos  força todos os playing styles ligados e mede
                      ativações/deslocamento por (estilo, posição) — ver
                      resumirEstilos (default true)
    opts.rotacionarFormacoes  gira 442/433/4231 entre jogos e força
                      playingStyleFixo para cobrir os 21 estilos numa
                      corrida só, mesmo que o painel tenha outra formação
                      escolhida — ver construirPlanoCobertura
                      (default = mesmo valor de calibrarEstilos)
    */
    run: async function (opts) {
        opts = opts || {};
        if (this.running) { console.warn('Sim já está a correr.'); return null; }
        if (typeof Match === 'undefined' || typeof MatchStats === 'undefined') {
            console.error('Sim: Match/MatchStats ainda não estão prontos.');
            return null;
        }

        const nJogos = opts.jogos || 10;
        const duracaoSeg = opts.duracaoSeg || 300;
        const dt = opts.dt || 1 / 60;
        const passosPorLote = opts.passosPorLote || 300;
        const calibrarEstilos = opts.calibrarEstilos !== false;
        const rotacionarFormacoes = calibrarEstilos && opts.rotacionarFormacoes !== false;

        this.running = true;
        this.resultados = [];
        this.heatmap = criarHeatmap(opts.cellSize);
        window.isPaused = false;

        // Telemetria do passe: acumula o LOTE inteiro (o MatchStats.reset
        // entre jogos não lhe toca), por isso limpa-se aqui no arranque.
        if (typeof MatchStats !== 'undefined') {
            MatchStats.amostrasPasse = [];
            MatchStats.relogio = 0;
        }

        const desvioStats = criarDesvioStats();
        const vigia = criarVigia();
        const estiloStats = calibrarEstilos ? criarEstiloStats() : null;
        const estilosAnteriores = calibrarEstilos ? forcarEstilosLigados() : null;

        const planoCobertura = rotacionarFormacoes ? construirPlanoCobertura() : null;
        const formacaoOriginal = rotacionarFormacoes ? Tatics.formacao : null;
        const fixoOriginais = rotacionarFormacoes ? new Map() : null;

        const inicio = performance.now();

        for (let jogo = 0; jogo < nJogos; jogo++) {
            /*
            Antes de qualquer coisa que indexe as listas: quem foi expulso no
            jogo anterior volta ao plantel. O `aplicarCoberturaNoJogo` abaixo
            indexa `Match.players[idx]` por posicao na lista, portanto com uma
            equipa reduzida a dez atribuia o estilo ao jogador errado — sem se
            queixar, que e o pior modo de falha possivel numa calibracao.
            */
            Match.reporExpulsos();

            if (planoCobertura) {
                const forma = FORM_CYCLE[jogo % FORM_CYCLE.length];
                Tatics.formacao = forma;
                aplicarCoberturaNoJogo(planoCobertura, forma, fixoOriginais);
                Match.assignFormations();
            }

            Match.resetPlay();
            MatchStats.reset();
            vigia.pos = null; vigia.parada = 0; vigia.jaRegistou = false;

            const totalPassos = Math.round(duracaoSeg / dt);
            let passosFeitos = 0;

            /*
            PROGRESSO. Um jogo de 25 minutos leva ~30 s reais e nao dizia nada
            ate acabar: o botao ficava em "A simular..." e a consola em
            silencio, o que se le como bloqueado. `opts.aoProgresso` recebe o
            jogo, o total e a fraccao feita deste jogo.
            */
            const aoProgresso = opts.aoProgresso;

            while (passosFeitos < totalPassos) {
                const lote = Math.min(passosPorLote, totalPassos - passosFeitos);
                for (let i = 0; i < lote; i++) {
                    Match.update(dt);
                    vigiarEncrave(vigia, jogo + 1, passosFeitos * dt, dt);
                    registarHeatmap(this.heatmap);
                    /*
                    Só com o nível 2 a correr. Ele é que escreve o slotTarget
                    contra o qual se mede o desvio do estilo; parado (golo,
                    bola fora, canto) o slot fica congelado no último frame de
                    jogo corrido, e o desvio medido é a distância a um ponto
                    velho — ruído somado aos números do relatório.
                    */
                    if (estiloStats && Match.nivel2Activo()) {
                        registarEstilos(estiloStats, Match.players);
                        registarEstilos(estiloStats, Match.opponents);
                    }
                    // O desvio por estado mede-se sempre (não depende dos
                    // estilos estarem a ser calibrados), pela mesma razão só
                    // com o nível 2 a correr.
                    if (Match.nivel2Activo()) {
                        registarDesvios(desvioStats, Match.players);
                        registarDesvios(desvioStats, Match.opponents);
                    }
                }
                passosFeitos += lote;
                if (aoProgresso) aoProgresso(jogo + 1, nJogos, passosFeitos / totalPassos);
                await cederAoBrowser();
            }

            const resumo = MatchStats.resumo();
            this.resultados.push({ jogo: jogo + 1, TeamA: resumo.TeamA, TeamB: resumo.TeamB });
            console.log(`Sim: jogo ${jogo + 1}/${nJogos} concluído.`, resumo);
        }

        const duracaoReal = ((performance.now() - inicio) / 1000).toFixed(1);
        console.log(`Sim: ${nJogos} jogos concluídos em ${duracaoReal}s reais.`);

        this.running = false;

        if (planoCobertura) {
            Tatics.formacao = formacaoOriginal;
            for (const [p, valor] of fixoOriginais) p.playingStyleFixo = valor;
            Match.assignFormations();

            const sobrou = [];
            for (const key in planoCobertura.filas) {
                if (planoCobertura.filas[key].length) sobrou.push(...planoCobertura.filas[key].map(e => `${e} (${key})`));
            }
            if (sobrou.length) {
                console.warn(`Sim: ${sobrou.length} estilo(s) não couberam nos ${nJogos} jogos deste lote (aumente opts.jogos para cobrir todos):`, sobrou.join(', '));
            }
        }

        const relatorioDesvios = resumirDesvios(desvioStats);
        if (relatorioDesvios.length) {
            console.log('Sim: desvio do alvo (dynamicTarget) ao slot do bloco, por estado');
            console.table(relatorioDesvios);
        }

        const relatorioPasses = (typeof MatchStats !== 'undefined') ? MatchStats.resumoPasses() : null;
        if (relatorioPasses && relatorioPasses.length) {
            console.log('Sim: passes por faixa de distância');
            console.table(relatorioPasses);
        }

        const relatorioEstilos = estiloStats ? resumirEstilos(estiloStats) : null;
        if (estilosAnteriores) restaurarEstilos(estilosAnteriores);
        if (relatorioEstilos) {
            console.table(relatorioEstilos);
            const semEfeito = relatorioEstilos.filter(l => l.semEfeito);
            if (semEfeito.length) {
                console.warn('Sim: estilos que ATIVAM mas não deslocam o alvo (sem código de posicionamento por trás):',
                    semEfeito.map(l => `${l.estilo} (${l.posicao})`).join(', '));
            }
            const nuncaAtivou = relatorioEstilos.filter(l => l.ativacoes === 0);
            if (nuncaAtivou.length) {
                console.warn('Sim: estilos que NUNCA ativaram nesta simulação (gatilho não alcançado ou posição não usada na formação):',
                    nuncaAtivou.map(l => `${l.estilo} (${l.posicao})`).join(', '));
            }
        }

        const relatorio = {
            geradoEm: new Date().toISOString(),
            parametros: { jogos: nJogos, duracaoSeg, dt, calibrarEstilos, rotacionarFormacoes },
            duracaoRealSeg: Number(duracaoReal),
            resultados: this.resultados,
            heatmap: this.heatmap,
            estilos: relatorioEstilos,
            passes: relatorioPasses,
            desvios: relatorioDesvios,
            /*
            Amostras cruas só a pedido (`opts.exportarAmostras`): são
            milhares, e enchiam o JSON exportado sem que a tabela resumo
            precise delas. Ficam sempre em MatchStats.amostrasPasse para
            quem as quiser cruzar na consola.
            */
            amostrasPasse: (opts.exportarAmostras && typeof MatchStats !== 'undefined')
                ? MatchStats.amostrasPasse : null,
            /*
            Retratos de jogo encravado, se houve algum. Vazio é o que se quer
            ver; com conteúdo, cada entrada diz o estado do Match, quem tinha
            a bola e o que os 22 jogadores estavam a fazer no momento.
            */
            encraves: vigia.registos
        };
        this.exportar(relatorio);
        return relatorio;
    },

    // Descarrega o relatório como .json.
    exportar: function (relatorio) {
        try {
            const blob = new Blob([JSON.stringify(relatorio)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'soccer-sim-results.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.warn('Sim: não consegui descarregar o ficheiro, resultado disponível em Sim.resultados / Sim.heatmap.', e);
        }
    }
};
