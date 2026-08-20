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
                offMax: 0
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
        const dx = p.dynamicTarget.x - p.slotTarget.x;
        const dz = p.dynamicTarget.z - p.slotTarget.z;
        st.dxSum += dx; st.dzSum += dz;
        st.dx2Sum += dx * dx; st.dz2Sum += dz * dz;
        const off = Math.hypot(dx, dz);
        if (off > st.offMax) st.offMax = off;
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
            deslocamentoMedioM: +rms.toFixed(2),
            deslocamentoMaxM: +st.offMax.toFixed(2),
            desvioPadraoXM: +stdDx.toFixed(2),
            desvioPadraoZM: +stdDz.toFixed(2),
            semEfeito: st.ativacoes > 0 && rms < 0.3
        });
    }
    linhas.sort((a, b) => (a.semEfeito === b.semEfeito) ? (a.estilo < b.estilo ? -1 : 1) : (a.semEfeito ? -1 : 1));
    return linhas;
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

        const estiloStats = calibrarEstilos ? criarEstiloStats() : null;
        const estilosAnteriores = calibrarEstilos ? forcarEstilosLigados() : null;

        const planoCobertura = rotacionarFormacoes ? construirPlanoCobertura() : null;
        const formacaoOriginal = rotacionarFormacoes ? Tatics.formacao : null;
        const fixoOriginais = rotacionarFormacoes ? new Map() : null;

        const inicio = performance.now();

        for (let jogo = 0; jogo < nJogos; jogo++) {
            if (planoCobertura) {
                const forma = FORM_CYCLE[jogo % FORM_CYCLE.length];
                Tatics.formacao = forma;
                aplicarCoberturaNoJogo(planoCobertura, forma, fixoOriginais);
                Match.assignFormations();
            }

            Match.resetPlay();
            MatchStats.reset();

            const totalPassos = Math.round(duracaoSeg / dt);
            let passosFeitos = 0;

            while (passosFeitos < totalPassos) {
                const lote = Math.min(passosPorLote, totalPassos - passosFeitos);
                for (let i = 0; i < lote; i++) {
                    Match.update(dt);
                    registarHeatmap(this.heatmap);
                    if (estiloStats) {
                        registarEstilos(estiloStats, Match.players);
                        registarEstilos(estiloStats, Match.opponents);
                    }
                }
                passosFeitos += lote;
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
            estilos: relatorioEstilos
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
