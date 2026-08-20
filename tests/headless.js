/*
Carrega o jogo inteiro num contexto vm com jsdom por baixo, na MESMA ordem de
scripts do index.html (a ordem nao pode mudar: os ficheiros partilham scope
global e contam uns com os outros).

Nao e um mock: e o codigo de producao a correr. O que esta aqui a mais sao so
os buracos do browser que o jogo toca de passagem — canvas 2D (texturas de
camisola, relva, rede) e getElementById (HUD).

main.js e touch_controls.js ficam de fora de proposito: montam
requestAnimationFrame e listeners de toque, e o dono do tick nos testes tem de
ser o teste.
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const raiz = path.join(__dirname, '..');

const dom = new JSDOM('<!doctype html><html><body><canvas id="c"></canvas></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.requestAnimationFrame = () => 0;

// Canvas 2D falso: devolve uma funcao vazia para qualquer metodo e aceita
// qualquer propriedade (fillStyle, lineWidth, ...). Enumerar os metodos um a um
// dava sempre outro em falta a cada ficheiro novo.
w.HTMLCanvasElement.prototype.getContext = function () {
    const vazio = () => {};
    const base = {
        measureText: () => ({ width: 0 }),
        getImageData: () => ({ data: [] }),
        createImageData: () => [],
        createLinearGradient: () => ({ addColorStop: vazio }),
        createRadialGradient: () => ({ addColorStop: vazio }),
        createPattern: () => null
    };
    return new Proxy(base, {
        get(alvo, chave) { return (chave in alvo) ? alvo[chave] : vazio; },
        set() { return true; }
    });
};

// O HUD e lido com getElementById e escrito com .style/.textContent. Sem
// elemento, rebenta em resetPlay. Cria a pedido.
const getReal = w.document.getElementById.bind(w.document);
w.document.getElementById = function (id) {
    let el = getReal(id);
    if (!el) {
        el = w.document.createElement('div');
        el.id = id;
        w.document.body.appendChild(el);
    }
    return el;
};

const ctx = vm.createContext(w);

function run(rel) {
    vm.runInContext(fs.readFileSync(path.join(raiz, rel), 'utf8'), ctx, { filename: rel });
}

run('node_modules/three/build/three.min.js');

// A lista de scripts vem do index.html, nao de uma copia a mao.
fs.readFileSync(path.join(raiz, 'index.html'), 'utf8')
    .split('\n')
    .map(linha => linha.match(/<script src="((?!http)[^"]+)"/))
    .filter(Boolean)
    .map(m => m[1])
    .filter(f => !f.endsWith('main.js') && !f.endsWith('touch_controls.js'))
    .forEach(run);

function novoJogo() {
    vm.runInContext(`
        // Sem const: o novoJogo pode ser chamado varias vezes no mesmo
        // contexto (um teste por cenario) e const rebentava a segunda.
        Match.init(new THREE.Scene());
        Match.delta = 0.016;
        for (let i = 0; i < 120; i++) Match.update(0.016);
    `, ctx);
}

module.exports = { w, ctx, run, novoJogo };
