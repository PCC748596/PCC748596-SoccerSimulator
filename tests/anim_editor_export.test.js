/*
EXPORTADOR DO EDITOR DE ANIMAÇÃO.

Spec em docs/superpowers/specs/2026-08-25-editor-de-animacao-design.md.

De todo o editor, esta é a única parte que produz código para alguém colar por
cima de um ficheiro do projecto — e portanto a única que pode destruir
trabalho. Por isso é função pura e por isso tem teste.

O QUE ESTÁ EM JOGO: os clips do config.js não são só números. Têm um cabeçalho
que descreve as fases do gesto e um comentário por keyframe (`// 4 armação
máxima`, `// 8 CONTACTO`). Um exportador que cuspisse JSON destruía isso tudo
no momento em que se colasse.

Corre sobre o js/config.js A SÉRIO, não sobre um exemplo de brincar: é o
ficheiro real que vai ser colado.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

// Só a função pura: o resto do animEditor.js fala com o DOM e com o THREE.
const srcEditor = ler('js/animEditor.js');
const ini = srcEditor.indexOf('function reescreverClipNoTexto');
if (ini < 0) throw new Error('reescreverClipNoTexto não encontrada no js/animEditor.js');
const fimFn = srcEditor.indexOf(LF + '}', ini) + 2;
const reescreverClipNoTexto = new Function(
    `${srcEditor.slice(ini, fimFn)}; return reescreverClipNoTexto;`)();

const fonte = ler('js/config.js');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

// Lê os keyframes de um clip do config real, para os devolver alterados.
function framesDoConfig(nome) {
    const i = fonte.indexOf(`const ${nome} = {`);
    const fim = fonte.indexOf(LF + '};', i);
    const bloco = fonte.slice(i, fim);
    const linhas = bloco.split(LF).filter(l => /^\s*\{.*\},?\s*$/.test(l));
    return linhas.map(l => {
        const K = {};
        const corpo = l.trim().replace(/^\{|\},?$/g, '');
        corpo.split(',').forEach(par => {
            const [c, v] = par.split(':').map(x => x.trim());
            if (c) K[c] = parseFloat(v);
        });
        return K;
    });
}

const CLIPS = ['ShotClip', 'GoalkeeperKickClip', 'GoalkeeperGroundKickClip',
    'GoalkeeperThrowClip', 'ThrowInClip'];

/*
1 — OS COMENTÁRIOS SOBREVIVEM.
*/
console.log(String.fromCharCode(10) + '1 — os comentários sobrevivem à exportação');
for (const nome of CLIPS) {
    const frames = framesDoConfig(nome);
    if (!frames.length) { erro(`${nome}: não consegui ler keyframes do config`); continue; }

    const saida = reescreverClipNoTexto(fonte, nome, frames);
    if (!saida) { erro(`${nome}: o exportador devolveu null`); continue; }

    // Os comentários do bloco original têm de estar todos na saída.
    const i = fonte.indexOf(`const ${nome} = {`);
    const bloco = fonte.slice(i, fonte.indexOf(LF + '};', i));
    const comentarios = bloco.split(LF)
        .map(l => l.trim())
        .filter(l => l.startsWith('//'));
    const perdidos = comentarios.filter(c => saida.indexOf(c) === -1);

    if (perdidos.length) {
        erro(`${nome}: ${perdidos.length} comentário(s) perdidos, ex.: "${perdidos[0]}"`);
    } else {
        ok(`${nome}: ${comentarios.length} comentários preservados`);
    }
}

/*
2 — A SAÍDA É JAVASCRIPT VÁLIDO, e com os mesmos keyframes.

Colar código que não faz parse parte o jogo inteiro — o config.js é carregado
antes de tudo o resto.
*/
console.log(String.fromCharCode(10) + '2 — a saída faz parse e mantém os keyframes');
for (const nome of CLIPS) {
    const frames = framesDoConfig(nome);
    const saida = reescreverClipNoTexto(fonte, nome, frames);
    if (!saida) continue;

    try {
        // O bloco é `const X = {...};` — avalia-se e lê-se de volta.
        const lido = new Function(`${saida} return ${nome};`)();
        if (!lido || !lido.frames) {
            erro(`${nome}: a saída não define frames`);
        } else if (lido.frames.length !== frames.length) {
            erro(`${nome}: saíram ${lido.frames.length} keyframes, entraram ${frames.length}`);
        } else {
            ok(`${nome}: faz parse, com os ${frames.length} keyframes`);
        }
    } catch (e) {
        erro(`${nome}: a saída não faz parse — ${e.message}`);
    }
}

/*
3 — OS VALORES EDITADOS CHEGAM LÁ.
*/
console.log(String.fromCharCode(10) + '3 — os valores editados chegam à saída');
{
    const frames = framesDoConfig('ShotClip');
    const canal = Object.keys(frames[0])[0];
    frames[0][canal] = -1.23;
    frames[3][canal] = 0.99;

    const saida = reescreverClipNoTexto(fonte, 'ShotClip', frames);
    const lido = new Function(`${saida} return ShotClip;`)();

    if (lido.frames[0][canal] !== -1.23 || lido.frames[3][canal] !== 0.99) {
        erro(`o valor editado não chegou: ${lido.frames[0][canal]}, ${lido.frames[3][canal]}`);
    } else ok(`o valor editado de \`${canal}\` chega à saída nos dois keyframes`);

    // E o resto do clip não pode ter mudado.
    const original = framesDoConfig('ShotClip');
    let diferentes = 0;
    lido.frames.forEach((f, i) => {
        for (const c in f) {
            const esperado = (i === 0 && c === canal) ? -1.23
                : (i === 3 && c === canal) ? 0.99 : original[i][c];
            if (Math.abs(f[c] - esperado) > 1e-9) diferentes++;
        }
    });
    if (diferentes) erro(`${diferentes} valor(es) mudaram sem terem sido editados`);
    else ok('mais nenhum valor mudou');
}

/*
4 — FALHA EM SILÊNCIO É PROIBIDO.

Se o exportador não conseguir fazer o trabalho, tem de devolver `null` para
quem chama avisar — e não uma versão a fingir, que era o que estragava o
ficheiro sem ninguém dar por isso.
*/
console.log(String.fromCharCode(10) + '4 — devolve null em vez de inventar');
{
    const frames = framesDoConfig('ShotClip');

    const casos = [
        ['sem texto do config', () => reescreverClipNoTexto(null, 'ShotClip', frames)],
        ['clip que não existe', () => reescreverClipNoTexto(fonte, 'ClipInventado', frames)],
        ['sem keyframes', () => reescreverClipNoTexto(fonte, 'ShotClip', [])],
        ['keyframes a menos', () => reescreverClipNoTexto(fonte, 'ShotClip', frames.slice(0, 3))]
    ];
    for (const [nome, correr] of casos) {
        const r = correr();
        if (r !== null) erro(`${nome}: devia devolver null, devolveu ${typeof r}`);
    }
    ok('os quatro casos impossíveis devolvem null');
}

/*
5 — O EXPORTADOR DO GAITMODEL.

Mesma história do outro, com um agravante: quase TODAS as linhas do GaitModel
têm comentário (`anca: 0.40,  // amplitude da coxa (rad)`). Perdê-los seria
perder a explicação do modelo de locomoção inteiro.
*/
console.log(String.fromCharCode(10) + '5 — o exportador do GaitModel');
{
    const iniG = srcEditor.indexOf('function reescreverGaitNoTexto');
    if (iniG < 0) {
        erro('reescreverGaitNoTexto não encontrada no js/animEditor.js');
    } else {
        const fimG = srcEditor.indexOf(LF + '}', iniG) + 2;
        const reescreverGait = new Function(
            `${srcEditor.slice(iniG, fimG)}; return reescreverGaitNoTexto;`)();

        // Lê o GaitModel real do config.
        const gait = new Function(
            `${fonte.slice(fonte.indexOf('const GaitModel = {'),
                fonte.indexOf(LF + '};', fonte.indexOf('const GaitModel = {')) + 3)}
             return GaitModel;`)();

        gait.trote.anca = 0.812;
        const saida = reescreverGait(fonte, gait);

        if (!saida) {
            erro('o exportador do GaitModel devolveu null');
        } else {
            // Comentários preservados
            const i = fonte.indexOf('const GaitModel = {');
            const bloco = fonte.slice(i, fonte.indexOf(LF + '};', i));
            const comentarios = bloco.split(LF).map(l => {
                const m = l.match(/\/\/.*$/);
                return m ? m[0].trim() : null;
            }).filter(Boolean);
            const perdidos = comentarios.filter(c => saida.indexOf(c) === -1);
            if (perdidos.length) {
                erro(`${perdidos.length} comentário(s) do GaitModel perdidos, ex.: "${perdidos[0]}"`);
            } else ok(`${comentarios.length} comentários do GaitModel preservados`);

            // Faz parse e traz o valor editado
            try {
                const lido = new Function(`${saida} return GaitModel;`)();
                if (Math.abs(lido.trote.anca - 0.812) > 1e-9) {
                    erro(`o valor editado não chegou: trote.anca = ${lido.trote.anca}`);
                } else ok('o valor editado chega à saída');

                if (Math.abs(lido.andar.anca - gait.andar.anca) > 1e-9 ||
                    Math.abs(lido.correr.passada - gait.correr.passada) > 1e-9) {
                    erro('outros andamentos foram alterados');
                } else ok('os outros andamentos ficam intactos');
            } catch (e) {
                erro(`a saída do GaitModel não faz parse — ${e.message}`);
            }
        }

        if (reescreverGait(null, {}) !== null) erro('sem texto, devia devolver null');
        else ok('sem o texto do config, devolve null');
    }
}

console.log('');
if (falhas) {
    console.error(`FALHOU: ${falhas} problema(s).`);
    process.exit(1);
}
console.log('OK: o exportador preserva os comentários e não inventa saídas.');
