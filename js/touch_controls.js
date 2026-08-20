/**
 * Soccer Simulator - Touch Controls Module
 * Gerenciador de controles touch para dispositivos móveis, tablets e telas sensíveis ao toque.
 */
const TouchControls = {
    enabled: true,
    zoomInterval: null,
    cameraSelectorOpen: false,

    init: function () {
        this.createDOM();
        this.bindEvents();
        this.updateButtonsState();

        /*
        Auto-detectar dispositivo touch.

        `ontouchstart`/`maxTouchPoints` dão TRUE em qualquer portátil Windows
        com ecrã táctil, mesmo quando se joga com rato — e era por isso que a
        barra aparecia ligada no PC. O que distingue um dispositivo em que o
        toque é o ponteiro PRINCIPAL é `pointer: coarse`; um portátil táctil
        com rato continua a ser `fine`.

        O ecrã estreito continua a contar: aí a barra ajuda mesmo com rato.
        */
        const ponteiroGrosso = window.matchMedia
            ? window.matchMedia('(pointer: coarse)').matches
            : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
        const isTouchDevice = ponteiroGrosso || (window.innerWidth <= 850);
        if (isTouchDevice) {
            // Em telas menores, inicia com painéis minimizados para focar no jogo
            if (window.innerWidth <= 768) {
                if (typeof toggleTodosPaineis === 'function') {
                    toggleTodosPaineis(true);
                }
            }
        }
        this.setVisible(isTouchDevice);
    },

    createDOM: function () {
        if (document.getElementById('touch-controls-root')) return;

        const root = document.createElement('div');
        root.id = 'touch-controls-root';
        root.innerHTML = `
            <!-- Barra Flutuante Inferior de Controles Touch -->
            <div id="touch-toolbar" class="touch-toolbar">
                <button type="button" id="btn-touch-pause" class="touch-btn touch-btn-primary" title="Pausar / Continuar">
                    <span class="touch-icon">⏸</span>
                    <span class="touch-label">Pausa</span>
                </button>

                <button type="button" id="btn-touch-speed" class="touch-btn" title="Alternar Velocidade">
                    <span class="touch-icon">⏩</span>
                    <span class="touch-label" id="touch-speed-label">1.0x</span>
                </button>

                <button type="button" id="btn-touch-camera" class="touch-btn" title="Mudar Câmera">
                    <span class="touch-icon">📹</span>
                    <span class="touch-label" id="touch-cam-label">TV Centro</span>
                </button>

                <div class="touch-btn-group">
                    <button type="button" id="btn-touch-zoom-out" class="touch-btn touch-btn-small" title="Diminuir Zoom">
                        <span class="touch-icon">🔍-</span>
                    </button>
                    <button type="button" id="btn-touch-zoom-in" class="touch-btn touch-btn-small" title="Aumentar Zoom">
                        <span class="touch-icon">🔍+</span>
                    </button>
                </div>

                <button type="button" id="btn-touch-reset" class="touch-btn" title="Reiniciar Kickoff">
                    <span class="touch-icon">🔄</span>
                    <span class="touch-label">Kickoff</span>
                </button>

                <button type="button" id="btn-touch-panels" class="touch-btn" title="Ocultar / Exibir Painéis">
                    <span class="touch-icon">👁️</span>
                    <span class="touch-label">Painéis</span>
                </button>
            </div>

            <!-- Seletor Rápido de Câmera (Menu Popup Touch) -->
            <div id="touch-camera-popup" class="touch-camera-popup oculto">
                <div class="touch-popup-header">
                    <span>Modos de Câmera</span>
                    <button type="button" id="btn-close-cam-popup" class="touch-popup-close">&times;</button>
                </div>
                <div class="touch-camera-grid">
                    <button type="button" class="touch-cam-opt active" data-cam="center">
                        <span class="touch-cam-icon">📺</span>
                        <span>TV Centro (4)</span>
                    </button>
                    <button type="button" class="touch-cam-opt" data-cam="sideline">
                        <span class="touch-cam-icon">🎥</span>
                        <span>Lateral Móvel (5)</span>
                    </button>
                    <button type="button" class="touch-cam-opt" data-cam="lateraltv">
                        <span class="touch-cam-icon">🏟️</span>
                        <span>Lateral TV (7)</span>
                    </button>
                    <button type="button" class="touch-cam-opt" data-cam="topdown">
                        <span class="touch-cam-icon">📐</span>
                        <span>Tática Cima (6)</span>
                    </button>
                    <button type="button" class="touch-cam-opt" data-cam="orbit">
                        <span class="touch-cam-icon">🌐</span>
                        <span>Órbita Livre (3D)</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(root);
    },

    bindEvents: function () {
        // Botão Pause
        const btnPause = document.getElementById('btn-touch-pause');
        if (btnPause) {
            btnPause.addEventListener('click', () => {
                if (typeof Match !== 'undefined') {
                    Match.togglePause();
                    this.updateButtonsState();
                }
            });
        }

        // Botão Speed
        const btnSpeed = document.getElementById('btn-touch-speed');
        if (btnSpeed) {
            btnSpeed.addEventListener('click', () => {
                const speeds = [0.5, 1.0, 1.3];
                const current = window.speedMultiplier || 1.0;
                let nextIdx = (speeds.indexOf(current) + 1) % speeds.length;
                if (nextIdx < 0) nextIdx = 1;
                const nextSpeed = speeds[nextIdx];
                if (typeof Match !== 'undefined') {
                    Match.setSpeed(nextSpeed);
                    this.updateButtonsState();
                }
            });
        }

        // Botão Camera Popup
        const btnCamera = document.getElementById('btn-touch-camera');
        const camPopup = document.getElementById('touch-camera-popup');
        const closeCamPopup = document.getElementById('btn-close-cam-popup');

        if (btnCamera && camPopup) {
            btnCamera.addEventListener('click', (e) => {
                e.stopPropagation();
                this.cameraSelectorOpen = !this.cameraSelectorOpen;
                camPopup.classList.toggle('oculto', !this.cameraSelectorOpen);
            });
        }
        if (closeCamPopup && camPopup) {
            closeCamPopup.addEventListener('click', () => {
                this.cameraSelectorOpen = false;
                camPopup.classList.add('oculto');
            });
        }

        // Opções de Câmera no popup
        document.querySelectorAll('.touch-cam-opt').forEach(opt => {
            opt.addEventListener('click', () => {
                const cam = opt.getAttribute('data-cam');
                if (cam && typeof Match !== 'undefined') {
                    Match.setCameraMode(cam);
                    document.querySelectorAll('.touch-cam-opt').forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                    this.cameraSelectorOpen = false;
                    if (camPopup) camPopup.classList.add('oculto');
                    this.updateButtonsState();

                    // Se escolheu órbita, abre o joystick automaticamente para facilitar
                    if (cam === 'orbit') {
                        // Joystick removido
                    }
                }
            });
        });

        // Fechar popup de câmera ao clicar fora
        document.addEventListener('click', (e) => {
            if (this.cameraSelectorOpen && !e.target.closest('#touch-camera-popup') && !e.target.closest('#btn-touch-camera')) {
                this.cameraSelectorOpen = false;
                if (camPopup) camPopup.classList.add('oculto');
            }
        });

        // Zoom Controles (com suporte a toque rápido e toque contínuo / hold)
        this.setupHoldButton('btn-touch-zoom-in', () => this.applyZoom(-0.06));
        this.setupHoldButton('btn-touch-zoom-out', () => this.applyZoom(0.06));

        // Reset Kickoff
        const btnReset = document.getElementById('btn-touch-reset');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                if (typeof Match !== 'undefined') {
                    Match.resetPlay();
                }
            });
        }

        // Toggle Painéis / Cinema View
        const btnPanels = document.getElementById('btn-touch-panels');
        if (btnPanels) {
            btnPanels.addEventListener('click', () => {
                const painelCmd = document.getElementById('painel-comandos');
                const isMin = painelCmd ? painelCmd.classList.contains('minimizado') : false;
                if (typeof toggleTodosPaineis === 'function') {
                    toggleTodosPaineis(!isMin);
                }
                this.updateButtonsState();
            });
        }

        // Botões de rotação de órbita rápida
        const btnRotL = document.getElementById('btn-orbit-rot-left');
        const btnRotR = document.getElementById('btn-orbit-rot-right');
        const btnCenterBall = document.getElementById('btn-orbit-center-ball');

        if (btnRotL) {
            this.setupHoldButton('btn-orbit-rot-left', () => {
                if (window.cameraMode !== 'orbit' && typeof Match !== 'undefined') {
                    Match.setCameraMode('orbit');
                }
                if (typeof orbitControls !== 'undefined' && orbitControls) {
                    orbitControls.rotateBy(-0.08, 0);
                }
            });
        }

        if (btnRotR) {
            this.setupHoldButton('btn-orbit-rot-right', () => {
                if (window.cameraMode !== 'orbit' && typeof Match !== 'undefined') {
                    Match.setCameraMode('orbit');
                }
                if (typeof orbitControls !== 'undefined' && orbitControls) {
                    orbitControls.rotateBy(0.08, 0);
                }
            });
        }

        if (btnCenterBall) {
            btnCenterBall.addEventListener('click', () => {
                if (typeof Match !== 'undefined' && Match.ball) {
                    if (window.cameraMode === 'orbit' && typeof orbitControls !== 'undefined') {
                        orbitControls.target.copy(Match.ball.position);
                        orbitControls.updateCameraPosition();
                    } else {
                        Match.currentLookTarget.copy(Match.ball.position);
                    }
                }
            });
        }

    },

    setupHoldButton: function (btnId, callback) {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        let holdTimer = null;
        let repeatInterval = null;

        const start = (e) => {
            if (e) e.preventDefault();
            callback();
            holdTimer = setTimeout(() => {
                repeatInterval = setInterval(callback, 50);
            }, 250);
        };

        const stop = () => {
            if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
            if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = null; }
        };

        btn.addEventListener('mousedown', start);
        window.addEventListener('mouseup', stop);
        btn.addEventListener('touchstart', start, { passive: false });
        window.addEventListener('touchend', stop);
        window.addEventListener('touchcancel', stop);
    },

    applyZoom: function (delta) {
        if (typeof orbitControls !== 'undefined' && orbitControls && window.cameraMode === 'orbit') {
            orbitControls.zoomBy(delta);
        } else {
            window.cameraZoom = THREE.MathUtils.clamp((window.cameraZoom || 1.0) + delta, 0.24, 2.5);
            if (typeof orbitControls !== 'undefined' && orbitControls) {
                orbitControls.radius = 80 * window.cameraZoom;
            }
        }
    },

    updateButtonsState: function () {
        // Atualiza botão de Pause
        const btnPause = document.getElementById('btn-touch-pause');
        if (btnPause) {
            const isPaused = !!window.isPaused;
            btnPause.querySelector('.touch-icon').textContent = isPaused ? '▶' : '⏸';
            btnPause.querySelector('.touch-label').textContent = isPaused ? 'Jogar' : 'Pausa';
            btnPause.classList.toggle('touch-btn-paused', isPaused);
        }

        // Atualiza botão de Speed
        const speedLabel = document.getElementById('touch-speed-label');
        if (speedLabel) {
            const spd = window.speedMultiplier || 1.0;
            speedLabel.textContent = spd.toFixed(1) + 'x';
        }

        // Atualiza nome da câmera
        const camLabel = document.getElementById('touch-cam-label');
        if (camLabel) {
            const names = {
                'center': 'TV Centro',
                'sideline': 'Lateral',
                'lateraltv': 'Lateral TV',
                'topdown': 'Tática',
                'orbit': 'Órbita 3D'
            };
            camLabel.textContent = names[window.cameraMode] || 'Câmera';
        }

        // Atualiza status do popup de câmera
        document.querySelectorAll('.touch-cam-opt').forEach(opt => {
            const cam = opt.getAttribute('data-cam');
            opt.classList.toggle('active', cam === window.cameraMode);
        });

        // Atualiza botão de painéis
        const btnPanels = document.getElementById('btn-touch-panels');
        if (btnPanels) {
            const painelCmd = document.getElementById('painel-comandos');
            const isMin = painelCmd ? painelCmd.classList.contains('minimizado') : false;
            btnPanels.classList.toggle('active', !isMin);
            btnPanels.querySelector('.touch-label').textContent = isMin ? 'Painéis' : 'Cinema';
        }
    },

    setVisible: function (visible) {
        this.enabled = visible;
        const root = document.getElementById('touch-controls-root');
        if (root) {
            root.style.display = visible ? 'block' : 'none';
        }
        /*
        O botão do painel tinha o rótulo "Touch Controls: ON" escrito à mão no
        HTML e a classe `active` fixa: dizia ON mesmo quando a auto-detecção
        tinha desligado a barra. Sincronizar aqui cobre a arranque e os
        toggles todos, porque tudo passa por este ponto.
        */
        const btn = document.getElementById('btn-touch-toggle');
        if (btn) {
            btn.innerText = 'Touch Controls: ' + (visible ? 'ON' : 'OFF');
            btn.classList.toggle('active', visible);
        }
    },

    toggle: function () {
        this.setVisible(!this.enabled);
    }
};

// Inicialização automática após carregamento da página
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TouchControls.init());
} else {
    TouchControls.init();
}
