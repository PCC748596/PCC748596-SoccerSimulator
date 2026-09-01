/*
=============================================================================
CAMPOS ORFAOS — quem escreve sem ninguem ler, quem le sem ninguem escrever
=============================================================================
Tres defeitos de uma so sessao vieram da mesma origem: o position_bt.js foi
apagado e levou os produtores, deixando os consumidores orfaos.

    buildOutBias     escrito por 3 listeners do EventBus, lido por ninguem
    markingTarget    lido pela FSM (estado MARKING), escrito por ninguem
    isCovering       limpo em dois sitios, lido pela FSM, escrito por ninguem

Os tres apareceram por acaso. Isto procura os restantes de proposito.

Nao e um analisador de sintaxe: e uma varredura por expressoes regulares
sobre `qualquercoisa.campo`. Da falsos positivos (campos de objectos que nao
sao jogadores) e falsos negativos (acesso por `obj[nome]`). Serve para
apontar sitios a olhar, nao para decidir sozinho.

Uso:  node tools/campos_orfaos.js
=============================================================================
*/
const fs = require('fs');
const path = require('path');

/*
Campos que o THREE.js e o DOM ja definem: escritos e lidos fora do nosso
codigo, por isso apareceriam sempre como orfaos.
*/
const CONHECIDOS = new Set([
    'position', 'quaternion', 'rotation', 'scale', 'visible', 'material',
    'geometry', 'children', 'parent', 'up', 'matrix', 'matrixWorld', 'name',
    'length', 'x', 'y', 'z', 'w', 'value', 'needsUpdate', 'textContent',
    'style', 'className', 'classList', 'innerText', 'innerHTML', 'checked',
    'id', 'type', 'width', 'height', 'currentState', 'prototype'
]);

// Tira comentarios e strings, para o que la dentro nao contar como codigo.
function limpar(fonte) {
    return fonte
        .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ' '))
        .replace(/'(?:[^'\\\n]|\\.)*'/g, m => m.replace(/[^\n]/g, ' '))
        .replace(/"(?:[^"\\\n]|\\.)*"/g, m => m.replace(/[^\n]/g, ' '))
        .replace(/`(?:[^`\\]|\\.)*`/g, m => m.replace(/[^\n]/g, ' '));
}

function analisar(ficheiros) {
    const escritas = new Map();   // campo -> [ocorrencias]
    const leituras = new Map();

    const juntar = (mapa, campo, ocorrencia) => {
        if (!mapa.has(campo)) mapa.set(campo, []);
        mapa.get(campo).push(ocorrencia);
    };

    for (const f of ficheiros) {
        const linhas = limpar(f.fonte).split('\n');
        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            const num = i + 1;

            /*
            Escrita simples: `.campo =` sem ser `==`, `===`, `>=`, `<=`, `!=`.
            Escrita composta (`+=`, `-=`, `*=`, `||=`) conta TAMBEM como
            leitura: o valor anterior e usado.
            */
            const reEscrita = /\.([A-Za-z_$][\w$]*)\s*(\+=|-=|\*=|\/=|\|\|=|&&=|\?\?=|=)(?!=)/g;
            let m;
            while ((m = reEscrita.exec(linha)) !== null) {
                const campo = m[1];
                if (CONHECIDOS.has(campo)) continue;
                juntar(escritas, campo, { ficheiro: f.nome, linha: num, tipo: 'escrita' });
                if (m[2] !== '=') {
                    juntar(leituras, campo, { ficheiro: f.nome, linha: num, tipo: 'leitura' });
                }
            }

            // Leitura: qualquer `.campo` que nao seja seguido de `=` simples
            // nem de `(` (chamada de metodo).
            const reLeitura = /\.([A-Za-z_$][\w$]*)(?![\w$]|\s*(?:\+=|-=|\*=|\/=|\|\|=|&&=|\?\?=|=(?!=)|\())/g;
            while ((m = reLeitura.exec(linha)) !== null) {
                const campo = m[1];
                if (CONHECIDOS.has(campo)) continue;
                juntar(leituras, campo, { ficheiro: f.nome, linha: num, tipo: 'leitura' });
            }
        }
    }

    const lista = (mapa, outro) => {
        const saida = [];
        for (const [campo, ocorrencias] of mapa) {
            if (outro.has(campo)) continue;
            saida.push({ campo: campo, ocorrencias: ocorrencias });
        }
        return saida.sort((a, b) => a.campo.localeCompare(b.campo));
    };

    return {
        escritosNuncaLidos: lista(escritas, leituras),
        lidosNuncaEscritos: lista(leituras, escritas)
    };
}

function ficheirosDoJogo() {
    const raiz = path.join(__dirname, '..');
    const dirs = [path.join(raiz, 'js'), path.join(raiz, 'js', 'bt')];
    const out = [];
    for (const dir of dirs) {
        for (const nome of fs.readdirSync(dir)) {
            const completo = path.join(dir, nome);
            if (!nome.endsWith('.js') || !fs.statSync(completo).isFile()) continue;
            out.push({ nome: path.relative(raiz, completo), fonte: fs.readFileSync(completo, 'utf8') });
        }
    }
    return out;
}

if (require.main === module) {
    const r = analisar(ficheirosDoJogo());
    const imprimir = (titulo, lista) => {
        console.log('\n=== ' + titulo + ' (' + lista.length + ') ===');
        for (const item of lista) {
            const onde = item.ocorrencias.slice(0, 3)
                .map(o => o.ficheiro + ':' + o.linha).join(', ');
            console.log('  ' + item.campo.padEnd(28) + onde +
                (item.ocorrencias.length > 3 ? ' (+' + (item.ocorrencias.length - 3) + ')' : ''));
        }
    };
    imprimir('ESCRITOS E NUNCA LIDOS', r.escritosNuncaLidos);
    imprimir('LIDOS E NUNCA ESCRITOS', r.lidosNuncaEscritos);
}

module.exports = { analisar, ficheirosDoJogo };
