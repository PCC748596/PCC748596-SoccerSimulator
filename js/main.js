let scene, rendererCore, cameraCore, orbitControls;
let lastTime = 0;
let fpsFrames = 0;
let fpsLastTime = 0;

/*
Shift+click em qualquer botão de minimizar/maximizar aplica o mesmo estado a
TODOS os painéis/modais de uma vez (painel de comandos, direito, jogadores,
e os sub-painéis BLUE/RED AVERAGE) — em vez de ter de clicar um por um.
*/
function toggleTodosPaineis(minimizar) {
    togglePainel(minimizar);
    togglePainelDireito(minimizar);
    togglePainelJogadores(minimizar);
    toggleSkillsTeam('a', minimizar);
    toggleSkillsTeam('b', minimizar);
}

// Minimiza/maximiza o painel de comandos. Também ligado à tecla X
// (ver Match.setupKeyboardListeners).
function togglePainel(forcarMinimizado, evt) {
    const painel = document.getElementById('painel-comandos');
    if (!painel) return;

    const minimizar = (forcarMinimizado === undefined)
        ? !painel.classList.contains('minimizado')
        : forcarMinimizado;

    if (evt && evt.shiftKey) { toggleTodosPaineis(minimizar); return; }

    painel.classList.toggle('minimizado', minimizar);

    const btn = document.getElementById('btn-painel');
    if (btn) btn.innerHTML = minimizar ? '&plus;' : '&minus;';
    if (typeof TouchControls !== 'undefined' && TouchControls.updateButtonsState) {
        TouchControls.updateButtonsState();
    }
}

function toggleSkillsTeam(letra, forcarMinimizado, evt) {
    const conteudo = document.getElementById('skills-conteudo-' + letra);
    const btn = document.getElementById('btn-skills-' + letra);
    if (!conteudo) return;

    const minimizar = (forcarMinimizado === undefined)
        ? !conteudo.classList.contains('oculto')
        : forcarMinimizado;

    if (evt && evt.shiftKey) { toggleTodosPaineis(minimizar); return; }

    conteudo.classList.toggle('oculto', minimizar);
    if (btn) btn.innerHTML = minimizar ? '&plus;' : '&minus;';
}

function togglePainelDireito(forcarMinimizado, evt) {
    const painel = document.getElementById('painel-direito');
    if (!painel) return;

    const minimizar = (forcarMinimizado === undefined)
        ? !painel.classList.contains('minimizado')
        : forcarMinimizado;

    if (evt && evt.shiftKey) { toggleTodosPaineis(minimizar); return; }

    painel.classList.toggle('minimizado', minimizar);

    const btn = document.getElementById('btn-painel-direito');
    if (btn) btn.innerHTML = minimizar ? '&plus;' : '&minus;';
}

function toggleOffside() {
    Match.showOffsideLines = !Match.showOffsideLines;
    Match.offsideLineA.visible = Match.showOffsideLines;
    Match.offsideLineB.visible = Match.showOffsideLines;
    document.getElementById('btn-offside').innerText = 'OffSide: ' + (Match.showOffsideLines ? 'ON' : 'OFF');
    document.getElementById('btn-offside').classList.toggle('active', Match.showOffsideLines);
}

function togglePlayingStyles() {
    if (typeof Config === 'undefined') return;
    Config.usePlayingStyles = !Config.usePlayingStyles;
    const btn = document.getElementById('btn-global-playingstyles');
    if (Config.usePlayingStyles) { btn.classList.add('active'); btn.innerText = "PlayingStyles: ON"; }
    else { btn.classList.remove('active'); btn.innerText = "PlayingStyles: OFF"; }
}

// Stubs for future features (PlayerNumber, PlayerBT)
function togglePlayerNumber() {
    window.showPlayerNumber = !window.showPlayerNumber;
    document.getElementById('btn-playernumber').innerText = 'PlayerNumber: ' + (window.showPlayerNumber ? 'ON' : 'OFF');
    document.getElementById('btn-playernumber').classList.toggle('active', window.showPlayerNumber);
}
function togglePlayerPoints() {
    window.showPlayerPoints = !window.showPlayerPoints;
    document.getElementById('btn-playerpoints').innerText = 'PlayerPoints: ' + (window.showPlayerPoints ? 'ON' : 'OFF');
    document.getElementById('btn-playerpoints').classList.toggle('active', window.showPlayerPoints);
}

function togglePlayerBT() {
    window.showPlayerBT = !window.showPlayerBT;
    document.getElementById('btn-playerbt').innerText = 'PlayerBT: ' + (window.showPlayerBT ? 'ON' : 'OFF');
    document.getElementById('btn-playerbt').classList.toggle('active', window.showPlayerBT);
}

function togglePlayerPOS() {
    window.showPlayerPOS = !window.showPlayerPOS;
    document.getElementById('btn-playerpos').innerText = 'PlayerPOS: ' + (window.showPlayerPOS ? 'ON' : 'OFF');
    document.getElementById('btn-playerpos').classList.toggle('active', window.showPlayerPOS);
}

function togglePlayerPlayingStyle() {
    window.showPlayerPlayingStyle = !window.showPlayerPlayingStyle;
    document.getElementById('btn-playerplayingstyle').innerText = 'Player Playing Style: ' + (window.showPlayerPlayingStyle ? 'ON' : 'OFF');
    document.getElementById('btn-playerplayingstyle').classList.toggle('active', window.showPlayerPlayingStyle);
}

window.teamBTPosState = 'OFF';
function toggleTeamBTPos() {
    if (window.teamBTPosState === 'OFF') window.teamBTPosState = 'TeamA';
    else if (window.teamBTPosState === 'TeamA') window.teamBTPosState = 'TeamB';
    else if (window.teamBTPosState === 'TeamB') window.teamBTPosState = 'Both';
    else window.teamBTPosState = 'OFF';

    let uiLabel = window.teamBTPosState;
    if (uiLabel === 'TeamA') uiLabel = 'TeamBlue';
    else if (uiLabel === 'TeamB') uiLabel = 'TeamRed';
    else if (uiLabel === 'Both') uiLabel = 'Both';

    document.getElementById('btn-teambtpos').innerText = 'Team BT POS: ' + uiLabel;
    document.getElementById('btn-teambtpos').classList.toggle('active', window.teamBTPosState !== 'OFF');
    if (typeof Match !== 'undefined') {
        if (Match.passTargetVisual) Match.passTargetVisual.visible = (window.teamBTPosState !== 'OFF' || window.playingStyleBTToggleState !== 'OFF');
        if (Match.passLineVisual) Match.passLineVisual.visible = (window.teamBTPosState !== 'OFF' || window.playingStyleBTToggleState !== 'OFF');
    }
}

/*
O anel do "Position BT" desapareceu com o nivel 2. Sobram dois:

    Team BT POS      o slot no bloco, do TeamBT
    PlayingStyleBT   o mesmo slot ja inclinado pelo estilo do jogador
*/
window.playingStyleBTToggleState = 'OFF';
function togglePlayingStyleBT() {
    if (window.playingStyleBTToggleState === 'OFF') window.playingStyleBTToggleState = 'TeamA';
    else if (window.playingStyleBTToggleState === 'TeamA') window.playingStyleBTToggleState = 'TeamB';
    else if (window.playingStyleBTToggleState === 'TeamB') window.playingStyleBTToggleState = 'Both';
    else window.playingStyleBTToggleState = 'OFF';

    let uiLabel = window.playingStyleBTToggleState;
    if (uiLabel === 'TeamA') uiLabel = 'TeamBlue';
    else if (uiLabel === 'TeamB') uiLabel = 'TeamRed';
    else if (uiLabel === 'Both') uiLabel = 'Both';

    document.getElementById('btn-playingstylebt').innerText = 'PlayingStyleBT: ' + uiLabel;
    document.getElementById('btn-playingstylebt').classList.toggle('active', window.playingStyleBTToggleState !== 'OFF');
    if (typeof Match !== 'undefined') {
        if (Match.passTargetVisual) Match.passTargetVisual.visible = (window.teamBTPosState !== 'OFF' || window.playingStyleBTToggleState !== 'OFF');
        if (Match.passLineVisual) Match.passLineVisual.visible = (window.teamBTPosState !== 'OFF' || window.playingStyleBTToggleState !== 'OFF');
    }
}

function toggleSpatialGrid() {
    if (typeof SpatialGrid === 'undefined') return;
    SpatialGrid.setDebug(!SpatialGrid.debug);
    document.getElementById('btn-spatialgrid').innerText = 'SG PASS/MARKING: ' + (SpatialGrid.debug ? 'ON' : 'OFF');
    document.getElementById('btn-spatialgrid').classList.toggle('active', SpatialGrid.debug);
}

function togglePassCandidates() {
    if (typeof PassCandidates === 'undefined') return;
    PassCandidates.setDebug(!PassCandidates.debug);
    document.getElementById('btn-passcandidates').innerText = 'PlayerPassTarget: ' + (PassCandidates.debug ? 'ON' : 'OFF');
    document.getElementById('btn-passcandidates').classList.toggle('active', PassCandidates.debug);
}

function toggleUsarPasseGrid() {
    window.usarPasseGrid = !window.usarPasseGrid;
    document.getElementById('btn-passgrid').innerText = 'PassGrid (decisão): ' + (window.usarPasseGrid ? 'ON' : 'OFF');
    document.getElementById('btn-passgrid').classList.toggle('active', window.usarPasseGrid);
}

window.allPlayingStylesEnabled = true;
function toggleAllPlayingStyles() {
    window.allPlayingStylesEnabled = !window.allPlayingStylesEnabled;
    const btn = document.getElementById('btn-all-playing-styles');
    if (btn) {
        btn.innerText = 'All Playing Styles: ' + (window.allPlayingStylesEnabled ? 'ON' : 'OFF');
        btn.classList.toggle('active', window.allPlayingStylesEnabled);
    }
    
    if (typeof Match !== 'undefined' && Match.players && Match.opponents) {
        const all = Match.players.concat(Match.opponents);
        all.forEach(p => {
            p.playingStyleDesligado = !window.allPlayingStylesEnabled;
        });
        popularPainelJogadores();
        
        // Se o modal estiver aberto, atualiza visualmente o estilo dentro dele
        const modal = document.getElementById('modal-skills');
        if (modal && !modal.classList.contains('oculto')) {
            const linhaEstilo = modal.querySelector('.skill-linha-estilo b');
            if (linhaEstilo) {
                const text = linhaEstilo.textContent;
                if (text.includes('ON') || text.includes('OFF')) {
                    linhaEstilo.textContent = text.replace(/\(O(N|FF)\)/, window.allPlayingStylesEnabled ? '(ON)' : '(OFF)');
                    linhaEstilo.style.color = window.allPlayingStylesEnabled ? '#16a34a' : '#94a3b8';
                }
            }
        }
    }
}

function togglePainelJogadores(forcarMinimizado, evt) {
    const painel = document.getElementById('painel-jogadores');
    if (!painel) return;

    const minimizar = (forcarMinimizado === undefined)
        ? !painel.classList.contains('minimizado')
        : forcarMinimizado;

    if (evt && evt.shiftKey) { toggleTodosPaineis(minimizar); return; }

    painel.classList.toggle('minimizado', minimizar);

    const btn = document.getElementById('btn-painel-jogadores');
    if (btn) btn.innerHTML = minimizar ? '&plus;' : '&minus;';
}

/*
Preenche a lista compacta (nome + fitness + Playing Style) do painel "Player
Skills" — só uma vez, no arranque, já que as skills são fixas
(data/player_skills.js).

Clicar no nome abre o modal com o detalhe completo do jogador. Clicar no
estilo liga/desliga (p.playingStyleDesligado — ver estiloAtivoDe em
playing_styles.js): desligado, o jogador usa só o PositionBT puro, sem nenhum
desvio de estilo, pra dar pra regular o nível 2 isolado do nível 3.
*/
function popularPainelJogadores() {
    const buildLista = (elId, jogadores) => {
        const el = document.getElementById(elId);
        if (!el || !jogadores) return;
        el.innerHTML = '';
        jogadores.forEach(p => {
            if (!p.skills) return;
            const linha = document.createElement('div');
            linha.className = 'linha-jogador';

            const nomeSpan = document.createElement('span');
            nomeSpan.textContent = p.skills.nome;
            nomeSpan.onclick = () => abrirModalSkills(p);
            linha.appendChild(nomeSpan);

            const estiloSpan = document.createElement('span');
            estiloSpan.className = 'lj-estilo';
            estiloSpan.title = 'Playing Style — clicar para ligar/desligar';
            const atualizarEstiloSpan = () => {
                estiloSpan.textContent = p.playingStyleDesligado ? 'OFF' : 'ON';
                estiloSpan.classList.toggle('lj-estilo-off', !!p.playingStyleDesligado);
                estiloSpan.classList.toggle('lj-estilo-on', !p.playingStyleDesligado);
            };
            atualizarEstiloSpan();
            estiloSpan.onclick = (ev) => {
                ev.stopPropagation();
                p.playingStyleDesligado = !p.playingStyleDesligado;
                atualizarEstiloSpan();
            };
            linha.appendChild(estiloSpan);


            el.appendChild(linha);
        });
    };
    buildLista('lista-jogadores-a', Match.players);
    buildLista('lista-jogadores-b', Match.opponents);
}

function abrirModalSkills(p) {
    const skills = p.skills;
    const modal = document.getElementById('modal-skills');
    const titulo = document.getElementById('modal-skills-titulo');
    const corpo = document.getElementById('modal-skills-corpo');
    if (!modal || !titulo || !corpo) return;

    titulo.textContent = skills.nome;

    const campos = [
        ['ID', skills.id],
        ['Posição', skills.pos],
        ['Fitness', skills.fitness],
        ['Stamina', skills.stamina],
        ['GK', skills.gk],
        ['Técnica', skills.tec],
        ['Marcação', skills.marking],
        ['Velocidade', skills.speed],
        ['Força', skills.strength],
        ['Passe', skills.pass],
        ['Interceptação', skills.intercept]
    ];

    corpo.innerHTML = campos.map(([nome, val]) =>
        '<div class="skill-linha"><span>' + nome + '</span><b>' + val + '</b></div>'
    ).join('');

    /*
    Playing Style — linha própria, clicável: liga/desliga o estilo (ver
    estiloAtivoDe em playing_styles.js). Mesmo toggle da lista compacta
    (lj-estilo em popularPainelJogadores), só que aqui dentro do modal.
    */
    const linhaEstilo = document.createElement('div');
    linhaEstilo.className = 'skill-linha skill-linha-estilo';
    const nomeEstilo = document.createElement('span');
    nomeEstilo.textContent = 'Playing Style';
    const valEstilo = document.createElement('b');
    const atualizarValEstilo = () => {
        const defEstilo = (typeof PlayingStyles !== 'undefined' && p.playingStyle)
            ? PlayingStyles[p.playingStyle] : null;
        valEstilo.textContent = (defEstilo ? defEstilo.nome : '-') +
            (p.playingStyleDesligado ? ' (OFF)' : ' (ON)');
        valEstilo.style.color = p.playingStyleDesligado ? '#94a3b8' : '#16a34a';
    };
    atualizarValEstilo();
    linhaEstilo.style.cursor = 'pointer';
    linhaEstilo.title = 'Clicar para ligar/desligar o Playing Style';
    linhaEstilo.onclick = () => {
        p.playingStyleDesligado = !p.playingStyleDesligado;
        atualizarValEstilo();
    };
    linhaEstilo.appendChild(nomeEstilo);
    linhaEstilo.appendChild(valEstilo);
    corpo.appendChild(linhaEstilo);

    modal.classList.remove('oculto');
}

function fecharModalSkills() {
    const modal = document.getElementById('modal-skills');
    if (modal) modal.classList.add('oculto');
}

// Dispara a simulação em lote a partir do botão do painel — parâmetros
// modestos por omissão para não prender a página por muito tempo; para
// lotes maiores, usar Sim.run({...}) directamente na consola.
function runFastSim() {
    if (typeof Sim === 'undefined') return;
    if (Sim.running) { console.warn('Sim já está a correr.'); return; }

    const btn = document.getElementById('btn-fastsim');
    if (btn) { btn.innerText = 'A simular...'; btn.disabled = true; }

    // calibrarEstilos desligado aqui de propósito: com só 2 jogos não dá pra
    // esvaziar as filas de cobertura (ver simulate.js), e a rotação de
    // formação ia trocar a formação escolhida no painel sem aviso. Pra
    // calibrar os 21 estilos, usar Sim.run({jogos:15,...}) na consola.
    Sim.run({ jogos: 2, duracaoSeg: 1500, calibrarEstilos: false }).then(() => {
        if (btn) { btn.innerText = 'Simulação rápida (2×25min)'; btn.disabled = false; }
    });
}

/*
HUD com o portador da bola (esquerda) e o adversário mais próximo dele
(direita) — troca de lado sozinho conforme quem tem a bola muda de equipa.
Stamina mostrada é a fixa de data/player_skills.js (skills.stamina), não
tem desgaste ao longo do jogo — é "no início do jogo" como pedido.
*/
function preencherHudJogador(elId, p) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!p || !p.skills) { el.classList.add('oculto'); return; }

    const cor = (p.team === 'TeamA') ? '#3498db' : '#e74c3c';
    el.querySelector('.hud-jog-logo').style.background = cor;
    el.querySelector('.hud-jog-nome').textContent = p.skills.nome;

    /*
    Barra em 5 segmentos de 20 pontos, TODOS acesos na mesma cor — a cor
    depende de quantos segmentos estão cheios: 5 = green, 4 = yellow,
    3 = orange, 2 ou 1 = red.
    */
    const acesos = Math.ceil(THREE.MathUtils.clamp(p.skills.stamina, 0, 100) / 20);
    const corPorAcesos = { 5: 'on-green', 4: 'on-yellow', 3: 'on-orange', 2: 'on-red', 1: 'on-red', 0: 'on-red' };
    const corStamina = corPorAcesos[acesos];
    const segs = el.querySelectorAll('.hud-jog-stamina-bar .seg');
    segs.forEach((seg, i) => {
        seg.className = 'seg' + (i < acesos ? ' ' + corStamina : '');
    });
    el.querySelector('.hud-jog-stamina-bar').title = 'Stamina ' + p.skills.stamina;

    el.classList.remove('oculto');
}

function updateHudJogadores() {
    const carrier = Match.ballCarrier;
    if (!carrier) {
        preencherHudJogador('hud-jogador-esq', null);
        preencherHudJogador('hud-jogador-dir', null);
        return;
    }

    const adversarios = (carrier.team === 'TeamA') ? Match.opponents : Match.players;
    let marcador = null, melhorDist = Infinity;
    for (const opp of adversarios) {
        const d = opp.model.position.distanceTo(carrier.model.position);
        if (d < melhorDist) { melhorDist = d; marcador = opp; }
    }

    preencherHudJogador('hud-jogador-esq', carrier);
    preencherHudJogador('hud-jogador-dir', marcador);
}

window.cameraFrustum = new THREE.Frustum();
window.cameraProjMatrix = new THREE.Matrix4();

function updateCameraFrustum() {
    if (!window.cameraCore) return;
    window.cameraCore.updateMatrixWorld();
    window.cameraProjMatrix.multiplyMatrices(window.cameraCore.projectionMatrix, window.cameraCore.matrixWorldInverse);
    window.cameraFrustum.setFromProjectionMatrix(window.cameraProjMatrix);
}

function animate(time) {
    requestAnimationFrame(animate);

    // A simulação em lote (js/simulate.js) conduz o Match.update() e não
    // desenha nada — enquanto ela corre, este loop fica de fora por
    // completo, para não haver dois donos do tick nem gasto de GPU à toa.
    if (typeof Sim !== 'undefined' && Sim.running) return;

    let delta = (time - lastTime) / 1000;
    if (isNaN(delta) || delta > 0.1) delta = 0.016;
    lastTime = time;

    fpsFrames++;
    if (time - fpsLastTime >= 1000) {
        let fps = Math.round((fpsFrames * 1000) / (time - fpsLastTime));
        let titleEl = document.getElementById('app-title');
        if (titleEl) titleEl.innerText = 'SOCCER SIM | FPS: ' + fps;
        fpsFrames = 0;
        fpsLastTime = time;
    }

    if (window.cameraMode === 'orbit') {
        if (orbitControls) orbitControls.update();
    } else {
        Match.updateCamera();
    }
    // Discos em vez de bonecos na câmara de cima — ver atualizarVistaTatica.
    Match.atualizarVistaTatica();
    updateCameraFrustum();

    if (!window.isPaused) {
        // GAME_SPEED é o ritmo base da partida (config.js); o speedMultiplier
        // continua a ser só o controlo 0.5x/1.0x/1.3x do painel.
        Match.update(delta * window.speedMultiplier * GAME_SPEED);
    }

    if (TeamAI && TeamAI.blackboards) {
        const bbA = TeamAI.blackboards['TeamA'];
        if (bbA && bbA.state) document.getElementById('hud-state-a').innerText = bbA.state;
        const bbB = TeamAI.blackboards['TeamB'];
        if (bbB && bbB.state) document.getElementById('hud-state-b').innerText = bbB.state;


        // Alimenta a aba do fluxograma do TeamBT (teamBtView.html), se aberta.
        // BroadcastChannel: nada acontece se ninguém estiver a ouvir do outro lado.
        if (!window._teamBtChannel) window._teamBtChannel = new BroadcastChannel('teamBtTrace');
        window._teamBtChannel.postMessage({
            TeamA: bbA ? { trace: bbA.trace, posture: bbA.posture } : null,
            TeamB: bbB ? { trace: bbB.trace, posture: bbB.posture } : null
        });
    }

    if (!window._hudJogadoresLast || time - window._hudJogadoresLast > 200) {
        window._hudJogadoresLast = time;
        updateHudJogadores();
    }

    rendererCore.render(scene, cameraCore);
}

document.addEventListener("DOMContentLoaded", () => {
    try {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB);

        cameraCore = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
        window.cameraCore = cameraCore;

        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 850);
        rendererCore = new THREE.WebGLRenderer({ antialias: !isTouchDevice, powerPreference: "high-performance" });
        rendererCore.setSize(window.innerWidth, window.innerHeight);
        rendererCore.shadowMap.enabled = true;
        rendererCore.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(rendererCore.domElement);
        window.rendererCore = rendererCore;

        orbitControls = new SimpleOrbitControls(cameraCore, rendererCore.domElement);
        window.orbitControls = orbitControls;

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 100, 40);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        
        const d = 80;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.camera.near = 10;
        dirLight.shadow.camera.far = 250;
        dirLight.shadow.bias = -0.0005; 

        scene.add(dirLight);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(ambientLight);

        Match.init(scene);
        Tatics.updateSkills();
        popularPainelJogadores();
        requestAnimationFrame(animate);
    } catch (err) {
        console.error("Erro crítico de inicialização:", err);
        const hud = document.getElementById('hud-state');
        if (hud) {
            hud.innerText = "Erro: " + err.message;
            hud.style.color = "#ff4757";
        }
    }
});

window.addEventListener('resize', () => {
    if (window.cameraCore && window.rendererCore) {
        window.cameraCore.aspect = window.innerWidth / window.innerHeight;
        window.cameraCore.updateProjectionMatrix();
        window.rendererCore.setSize(window.innerWidth, window.innerHeight);
    }
});
