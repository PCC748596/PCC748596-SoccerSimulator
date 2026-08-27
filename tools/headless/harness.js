/*
Harness headless: corre o jogo real em jsdom + three (r128 do node_modules),
sem renderer. Serve para medir um tempo de jogo sem abrir o browser.
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const RAIZ = process.env.RAIZ || path.resolve(__dirname, '..', '..');

/*
O BODY REAL do index.html, sem os <script>. O jogo lê dezenas de elementos por
id (`alerta-golo`, `hud-state`, os selects das tácticas...) e escreve-lhes
`style`/`innerText` sem verificar se existem — com um body vazio rebenta logo
no `Match.init`. Copiar o markup é mais barato e mais fiel do que espalhar
guardas pelo código de produção.
*/
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8')
    .replace(/<script[\s\S]*?<\/script>/g, '');

const dom = new JSDOM(html, {
    pretendToBeVisual: true, url: 'http://localhost/'
});
const win = dom.window;

// Canvas falso: o jogo cria labels/sprites com canvas 2d. Só precisa de não
// rebentar — nada disto é lido em modo headless.
const ctx2d = new Proxy({}, {
    get: (t, k) => {
        if (k === 'measureText') return () => ({ width: 10 });
        if (k === 'canvas') return { width: 1, height: 1 };
        if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        if (k === 'createLinearGradient' || k === 'createRadialGradient')
            return () => ({ addColorStop: () => { } });
        return () => { };
    }
});
const criarElemento = win.document.createElement.bind(win.document);
win.document.createElement = function (tag) {
    const el = criarElemento(tag);
    if (String(tag).toLowerCase() === 'canvas') {
        el.getContext = () => ctx2d;
        el.toDataURL = () => 'data:,';
    }
    return el;
};

global.window = win;
global.document = win.document;
global.navigator = win.navigator;
global.performance = win.performance;
global.requestAnimationFrame = () => 0;
global.Audio = function () { return { play: () => Promise.resolve(), pause: () => { }, addEventListener: () => { } }; };
global.THREE = require(path.join(RAIZ, 'node_modules/three/build/three.js'));
win.THREE = global.THREE;

const FICHEIROS = [
    'assets/ball_mesh.js', 'data/player_skills.js',
    'js/event_bus.js', 'js/joint_limits.js', 'js/config.js', 'js/stats.js',
    'js/utils.js', 'js/ik.js', 'js/reach.js', 'js/gk_dive.js',
    'js/bt/action_state.js', 'js/perception.js', 'js/playing_styles.js',
    'js/spatial_grid.js', 'js/pass_candidates.js', 'js/pass_types.js',
    'js/bt/core.js', 'js/bt/team_bt.js', 'js/bt/player_bt.js',
    'js/goal_net.js', 'js/match.js', 'js/pose.js', 'js/player.js',
    'js/fsm.js', 'js/officials.js'
];

for (const f of FICHEIROS) {
    const src = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    try {
        vm.runInThisContext(src, { filename: f });
    } catch (e) {
        console.error('FALHOU a carregar ' + f + ': ' + e.message);
        process.exit(1);
    }
}

/*
Os ficheiros usam as duas convenções: `const Foo = {}` (global do vm) e
`window.Foo = {}` (propriedade do jsdom). O `Config` é dos segundos, e sem
esta ponte o `playing_styles.js` rebentava com "Config is not defined" ao
primeiro tick. Copia-se o que ficou só no `window`.
*/
for (const chave of Object.keys(win)) {
    if (!(chave in global)) {
        try { global[chave] = win[chave]; } catch (e) { /* getters do jsdom */ }
    }
}

module.exports = { win, RAIZ };
