/*
AMOSTRAGEM DA TELEMETRIA DO LOTE — mais depressa sem mentir nos números.

O `Sim` paga telemetria para 22 jogadores em TODOS os frames: num lote de
5 × 90 min são 1,62 M frames, ou seja ~36 M chamadas de cada registador. O
`rapido: true` passa a medir de 6 em 6 frames (10 Hz a dt=1/60).

O QUE ESTE TESTE FIXA, e é a parte que se pode partir sem dar por isso:

1. O `frames` do relatório de desvios continua a querer dizer FRAMES. Com
   amostragem 6 há um sexto das leituras, e publicar `st.n` cru dividia o
   número por seis sem nada a dizê-lo — dois lotes com amostragens diferentes
   deixavam de ser comparáveis.
2. As médias e o RMS NÃO levam correcção nenhuma: são razões, e o factor de
   amostragem cancela-se. Corrigi-los seria o erro simétrico.
3. A amostragem é contínua ao longo do jogo e não reinicia a cada lote de
   passos — o contador é `passosFeitos + i` e não `i`. Com o `i` sozinho, o
   primeiro frame de CADA lote era medido, e com lotes de 2000 passos e
   amostragem 6 isso enviesava a contagem.

NÃO SÃO AMOSTRÁVEIS, e o teste também o fixa: `registarPermanencia` e
`registarEstilos` fazem detecção de flanco (episódios da FSM, activações de
estilo). Ver a nota no cabeçalho do `Sim.run`.

Corre com: node tests/sim_amostragem.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcSim = ler('js/simulate.js');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

function extrairFuncao(src, nome) {
    const i = src.indexOf(`function ${nome}(`);
    if (i < 0) throw new Error(`${nome}() não encontrada`);
    const f = src.indexOf(LF + '}', i);
    return src.slice(i, f + 2);
}

const resumirDesvios = new Function(
    `${extrairFuncao(srcSim, 'resumirDesvios')}; return resumirDesvios;`)();
const registarDesvios = new Function(
    `${extrairFuncao(srcSim, 'registarDesvios')}; return registarDesvios;`)();

// Um jogador de mentira, com o desvio que se quiser entre alvo e slot.
const jog = (pos, estado, desvio) => ({
    pos: pos,
    fsm: { currentState: estado },
    slotTarget: { x: 0, z: 0 },
    dynamicTarget: { x: desvio, z: 0 }
});

/* =====================================================================
   1 — O `frames` DO RELATÓRIO CONTINUA A SER FRAMES
   ===================================================================== */
console.log(LF + '1 — o `frames` publicado não encolhe com a amostragem');
{
    // 600 frames de jogo, um jogador sempre no mesmo estado e desvio.
    const TOTAL = 600;

    const correr = (amostragem) => {
        const stats = {};
        for (let i = 0; i < TOTAL; i++) {
            const medir = (amostragem === 1) || (i % amostragem === 0);
            if (medir) registarDesvios(stats, [jog('CM', 'MARKING', 4.0)]);
        }
        return resumirDesvios(stats, amostragem)[0];
    };

    const cheio = correr(1);
    const amostrado = correr(6);

    if (cheio.frames !== TOTAL) {
        erro(`sem amostragem deu frames=${cheio.frames}, esperava ${TOTAL}`);
    } else {
        ok(`sem amostragem: frames=${cheio.frames}`);
    }

    if (amostrado.frames !== TOTAL) {
        erro(`com amostragem 6 deu frames=${amostrado.frames}, esperava ${TOTAL} ` +
            `— o relatório está a publicar leituras e a chamar-lhes frames`);
    } else {
        ok(`com amostragem 6: frames=${amostrado.frames} (${amostrado.amostras} leituras)`);
    }

    if (amostrado.amostras !== TOTAL / 6) {
        erro(`esperava ${TOTAL / 6} leituras, deu ${amostrado.amostras}`);
    } else {
        ok('o campo amostras diz a verdade sobre quantas leituras houve');
    }
}

/* =====================================================================
   2 — MÉDIAS E RMS NÃO LEVAM CORRECÇÃO
   ===================================================================== */
console.log(LF + '2 — média e RMS são razões: a amostragem cancela-se');
{
    const TOTAL = 630;
    /*
    Período 7, e não 12: 12 é múltiplo do intervalo de amostragem (6), portanto
    amostrar de 6 em 6 só apanhava DUAS das doze fases e a média movia-se 26% —
    aliasing verdadeiro, não um factor pendurado, mas o suficiente para o teste
    acusar a coisa errada. Com 7 (primo com 6) as leituras percorrem todas as
    fases em 42 frames e a média converge para a mesma.
    */
    const desvioNoFrame = (i) => 2.0 + (i % 7) * 0.5;

    const correr = (amostragem) => {
        const stats = {};
        for (let i = 0; i < TOTAL; i++) {
            const medir = (amostragem === 1) || (i % amostragem === 0);
            if (medir) registarDesvios(stats, [jog('CM', 'MARKING', desvioNoFrame(i))]);
        }
        return resumirDesvios(stats, amostragem)[0];
    };

    const cheio = correr(1);
    const amostrado = correr(6);

    /*
    Não se pede igualdade exacta: amostrar de 6 em 6 apanha um subconjunto do
    ciclo de 12 valores, portanto a média move-se um pouco. Pede-se que fique
    perto — se levasse correcção a mais ou a menos, saltava por um factor de 6.
    */
    const razao = amostrado.desvioMedioM / cheio.desvioMedioM;
    if (razao < 0.8 || razao > 1.25) {
        erro(`média ${amostrado.desvioMedioM} contra ${cheio.desvioMedioM} ` +
            `(razão ${razao.toFixed(2)}) — parece ter levado o factor da amostragem`);
    } else {
        ok(`média ${amostrado.desvioMedioM} vs ${cheio.desvioMedioM} (razão ` +
            `${razao.toFixed(2)}): sem factor pendurado`);
    }

    const razaoRms = amostrado.desvioRmsM / cheio.desvioRmsM;
    if (razaoRms < 0.8 || razaoRms > 1.25) {
        erro(`RMS ${amostrado.desvioRmsM} contra ${cheio.desvioRmsM} ` +
            `(razão ${razaoRms.toFixed(2)})`);
    } else {
        ok(`RMS ${amostrado.desvioRmsM} vs ${cheio.desvioRmsM}`);
    }
}

/* =====================================================================
   3 — A AMOSTRAGEM NÃO REINICIA A CADA LOTE
   ===================================================================== */
console.log(LF + '3 — o contador é contínuo, não reinicia em cada lote de passos');
{
    /*
    O laço do Sim.run corre por lotes (`passosPorLote`), e cede ao browser
    entre eles. Se o teste da amostragem usasse o índice DENTRO do lote, o
    primeiro frame de cada lote era sempre medido — com lotes de 2000 e
    amostragem 6 dá 334 leituras por lote em vez de 333,33, e o primeiro frame
    depois de cada cedência ficava sobre-representado.
    */
    const TOTAL = 6000, LOTE = 2000, AMOSTRAGEM = 6;

    let comContadorGlobal = 0, comIndiceDoLote = 0;
    let passosFeitos = 0;
    while (passosFeitos < TOTAL) {
        const lote = Math.min(LOTE, TOTAL - passosFeitos);
        for (let i = 0; i < lote; i++) {
            if ((passosFeitos + i) % AMOSTRAGEM === 0) comContadorGlobal++;
            if (i % AMOSTRAGEM === 0) comIndiceDoLote++;
        }
        passosFeitos += lote;
    }

    if (comContadorGlobal !== TOTAL / AMOSTRAGEM) {
        erro(`contador global deu ${comContadorGlobal} leituras, esperava ` +
            `${TOTAL / AMOSTRAGEM}`);
    } else {
        ok(`contador global: ${comContadorGlobal} leituras em ${TOTAL} frames`);
    }

    // O teste só vale se as duas formas forem MESMO diferentes — senão não
    // estava a fixar nada.
    if (comIndiceDoLote === comContadorGlobal) {
        erro('o índice do lote deu o mesmo — escolhe um TOTAL/LOTE que os separe');
    } else {
        ok(`o índice do lote daria ${comIndiceDoLote}: é por isso que se usa ` +
            `passosFeitos + i`);
    }

    // E a fonte tem mesmo de usar o contador global.
    if (!srcSim.includes('(passosFeitos + i) % amostragem === 0')) {
        erro('o Sim.run não está a usar `(passosFeitos + i) % amostragem`');
    } else {
        ok('o Sim.run usa o contador global');
    }
}

/* =====================================================================
   4 — O QUE NÃO É AMOSTRÁVEL CONTINUA A 60 Hz
   ===================================================================== */
console.log(LF + '4 — permanência e estilos ficam fora da amostragem');
{
    /*
    Os dois fazem detecção de flanco. O `PASS` dura 0,07 s de média e o
    `DRIBBLE` 0,02 s — menos do que um intervalo de amostragem a 10 Hz — por
    isso amostrá-los apagava episódios inteiros do relatório em vez de os medir
    com menos resolução.
    */
    const corpoDoLaco = srcSim.slice(
        srcSim.indexOf('const lote = Math.min(passosPorLote'),
        srcSim.indexOf('passosFeitos += lote;'));

    /*
    Contagem de chavetas e não uma janela de N linhas atrás: a primeira versão
    deste teste olhava para as 6 linhas anteriores à chamada e apanhava o `if
    (medirAcumulados)` do bloco ANTERIOR, que já tinha fechado — acusava código
    correcto. Aqui segue-se a profundidade a sério.
    */
    const semComentarios = corpoDoLaco
        .split(LF)
        .map(l => l.replace(/\/\/.*$/, ''))
        .join(LF)
        .replace(/\/\*[\s\S]*?\*\//g, '');

    const dentroDaGuarda = (nomeDaChamada) => {
        const linhas = semComentarios.split(LF);
        let profundidadeDaGuarda = null;   // profundidade a que a guarda abriu
        let profundidade = 0;

        for (const linha of linhas) {
            const abreGuarda = /if\s*\(\s*medirAcumulados/.test(linha);

            // Guarda de uma linha só (`if (medirAcumulados) chamada();`).
            if (abreGuarda && !linha.includes('{')) {
                if (linha.includes(nomeDaChamada)) return true;
            }

            for (const ch of linha) {
                if (ch === '{') {
                    profundidade++;
                    if (abreGuarda && profundidadeDaGuarda === null) {
                        profundidadeDaGuarda = profundidade;
                    }
                } else if (ch === '}') {
                    if (profundidadeDaGuarda !== null && profundidade === profundidadeDaGuarda) {
                        profundidadeDaGuarda = null;
                    }
                    profundidade--;
                }
            }

            if (profundidadeDaGuarda !== null && linha.includes(nomeDaChamada)) return true;
        }
        return false;
    };

    for (const nome of ['registarPermanencia', 'registarEstilos', 'vigiarEncrave']) {
        if (!semComentarios.includes(nome)) {
            erro(`não encontrei a chamada a ${nome} no laço`);
        } else if (dentroDaGuarda(nome)) {
            erro(`${nome} está atrás da amostragem, e não pode estar`);
        } else {
            ok(`${nome} corre em todos os frames`);
        }
    }

    // E o contrário: os dois amostráveis TÊM de estar atrás da guarda, senão
    // o modo rápido não poupa nada.
    for (const nome of ['registarHeatmap', 'registarDesvios']) {
        if (!dentroDaGuarda(nome)) {
            erro(`${nome} não está atrás da amostragem — o rapido não poupa nada`);
        } else {
            ok(`${nome} é amostrado`);
        }
    }
}

console.log(LF + (falhas ? `FALHAS: ${falhas}` : 'TUDO OK'));
process.exit(falhas ? 1 : 0);
