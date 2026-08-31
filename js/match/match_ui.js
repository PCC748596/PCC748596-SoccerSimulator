Object.assign(Match, {
    setupKeyboardListeners: function () {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'o' || e.key === 'O') {
                this.showOffsideLines = !this.showOffsideLines;
                this.offsideLineA.visible = this.showOffsideLines;
                this.offsideLineB.visible = this.showOffsideLines;
                if(this.defLineA) this.defLineA.visible = this.showOffsideLines;
                if(this.defLineB) this.defLineB.visible = this.showOffsideLines;
            }
            if (e.key === 'f' || e.key === 'F') this.setSpeed('frame');
            if (e.key === '1') this.setSpeed(0.9);
            if (e.key === '2') this.setSpeed(1.0);
            if (e.key === '3') this.setSpeed(1.2);
            if (e.key === '4') this.setSpeed(10);
            if (e.key === '4') this.setCameraMode('center');
            if (e.key === '5') this.setCameraMode('sideline');
            if (e.key === '6') this.setCameraMode('topdown');
            if (e.key === '7') this.setCameraMode('lateraltv');
            if (e.key === ' ' || e.code === 'Space') {
                this.togglePause();
                e.preventDefault();
            }
            if (e.key === 'x' || e.key === 'X') togglePainel();
            /*
            Ctrl+C: canto forçado, para se ver a jogada sem esperar que
            aconteça sozinha. Vai para a equipa que está a atacar (a posse, ou
            o último toque se ainda não houver posse), na quina do lado onde a
            bola está e na linha de fundo que essa equipa ataca.
            */
            if ((e.key === 'c' || e.key === 'C') && e.ctrlKey) {
                this.forcarCanto();
                e.preventDefault();
            }
        });
    },

    forcarCanto: function () {
        const equipa = this.possessionTeam || this.lastTouchedTeam || 'TeamA';
        const plantel = (equipa === 'TeamA') ? this.players : this.opponents;
        const attDir = (plantel[0] && plantel[0].dirZ) ? plantel[0].dirZ : 1;

        // A bola diz o LADO (o sinal do x); o setupSetPiece lê daqui.
        const ladoX = Math.sign(this.ball.position.x) || 1;
        this.ball.position.set(ladoX * 20, BallPhysics.raio, attDir * 50);
        this.ballVel.set(0, 0, 0);

        this.setupSetPiece('CORNER_KICK', equipa);
    },

    togglePause: function () {
        window.isPaused = !window.isPaused;
        const btn = document.getElementById('btn-pause');
        if (btn) btn.textContent = window.isPaused ? 'Continue' : 'Pause';
        if (typeof TouchControls !== 'undefined' && TouchControls.updateButtonsState) {
            TouchControls.updateButtonsState();
        }
    },

    setSpeed: function (speed) {
        if (speed === 'frame' && window.speedMultiplier === 'frame') {
            this.stepNextFrame = true;
        }
        window.speedMultiplier = speed;
        document.querySelectorAll('.btn-speed').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('spd-' + speed);
        if (btn) btn.classList.add('active');
        if (typeof TouchControls !== 'undefined' && TouchControls.updateButtonsState) {
            TouchControls.updateButtonsState();
        }
    },

    setCameraMode: function (mode) {
        if (mode === 'orbit' && window.cameraMode !== 'orbit' && typeof orbitControls !== 'undefined') {
            orbitControls.syncFromCamera(window.cameraCore, this.currentLookTarget);
        }

        window.cameraMode = mode;
        document.querySelectorAll('.btn-cam').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('cam-' + mode);
        if (btn) btn.classList.add('active');

        window.cameraCore.up.set(0, 1, 0);
        if (mode === 'topdown') {
            // Roda a câmara 90 graus: Vermelho (Z = +53) à esquerda, Azul (Z = -53) à direita
            window.cameraCore.up.set(-1, 0, 0);
        }
        if (typeof TouchControls !== 'undefined' && TouchControls.updateButtonsState) {
            TouchControls.updateButtonsState();
        }
    },

    atualizarVistaTatica: function () {
        if (!this.ball) return;
        const tatico = (window.cameraMode === 'topdown');

        if (!this.discoBola) {
            let cvs = document.createElement('canvas');
            cvs.width = 128; cvs.height = 128;
            let ctx = cvs.getContext('2d');
            
            // Desenha a bola (branco com pentágonos pretos)
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(64, 64, 60, 0, Math.PI*2);
            ctx.fill();
            
            ctx.fillStyle = '#1a1a1a';
            // Pentágono central
            ctx.beginPath();
            for (let i=0; i<5; i++) {
                let a = (Math.PI*2/5)*i - Math.PI/2;
                let px = 64 + 18*Math.cos(a);
                let py = 64 + 18*Math.sin(a);
                if (i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            // Pentágonos exteriores
            for (let i=0; i<5; i++) {
                let a = (Math.PI*2/5)*i - Math.PI/2;
                let cx = 64 + 44*Math.cos(a);
                let cy = 64 + 44*Math.sin(a);
                ctx.beginPath();
                for (let j=0; j<5; j++) {
                    let a2 = (Math.PI*2/5)*j + a;
                    let px = cx + 14*Math.cos(a2);
                    let py = cy + 14*Math.sin(a2);
                    if (j===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
            }
            
            // Borda exterior
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#cccccc';
            ctx.beginPath();
            ctx.arc(64, 64, 60, 0, Math.PI*2);
            ctx.stroke();

            let tex = new THREE.CanvasTexture(cvs);

            this.discoBola = new THREE.Group();

            this.discoIcon = new THREE.Mesh(
                new THREE.CircleGeometry(0.4675 * 0.75, 20),
                new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
            );
            this.discoIcon.rotation.x = -Math.PI / 2;
            this.discoBola.add(this.discoIcon);

            // Sombra
            let cvsS = document.createElement('canvas');
            cvsS.width = 64; cvsS.height = 64;
            let ctxS = cvsS.getContext('2d');
            let grad = ctxS.createRadialGradient(32, 32, 0, 32, 32, 32);
            grad.addColorStop(0, 'rgba(0,0,0,0.6)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctxS.fillStyle = grad;
            ctxS.fillRect(0,0,64,64);
            let texS = new THREE.CanvasTexture(cvsS);
            
            this.discoSombra = new THREE.Mesh(
                new THREE.PlaneGeometry(1.0 * 0.75, 1.0 * 0.75),
                new THREE.MeshBasicMaterial({ map: texS, transparent: true, depthWrite: false })
            );
            this.discoSombra.rotation.x = -Math.PI / 2;
            this.discoSombra.position.y = -0.01;
            this.discoBola.add(this.discoSombra);

            this.discoBola.visible = false;
            this.scene.add(this.discoBola);
        }

        this.discoBola.visible = tatico;
        this.ball.visible = !tatico;

        if (tatico) {
            // BallPhysics.raio approx 0.11
            let altura = Math.max(0, this.ball.position.y - 0.11); 
            
            // Aumenta o tamanho do ícone da bola em até 35% no ápice
            let escalaBola = 1.0 + Math.min(0.35, altura * 0.08); 
            this.discoIcon.scale.set(escalaBola, escalaBola, escalaBola);
            
            // Para dar ainda mais a sensação de 3D, a bola "sobe" um pouquinho para o Sul (Z+) no ecrã
            // simulando a perspectiva da câmara que não é 100% perfeitamente a pino ou apenas a paralaxe.
            this.discoIcon.position.z = altura * 0.3;

            // Suaviza a sombra conforme a bola sobe
            let opacidadeSombra = Math.max(0.15, 1.0 - altura * 0.15);
            this.discoSombra.material.opacity = opacidadeSombra;
            // E a sombra cresce ligeiramente e fica difusa
            let escalaSombra = 1.0 + Math.min(0.5, altura * 0.1);
            this.discoSombra.scale.set(escalaSombra, escalaSombra, escalaSombra);

            // Mantemos o grupo na vertical da sombra
            this.discoBola.position.set(this.ball.position.x, 0.06, this.ball.position.z);
        }
    },

    updateCamera: function () {
        if (window.cameraMode === 'orbit') return;

        if (!this.ball) return;
        const zoom = window.cameraZoom || 1.0;
        if (!this._cTPos) { this._cTPos = new THREE.Vector3(); this._cLTar = new THREE.Vector3(); this._cFwd = new THREE.Vector3(); } let targetPos = this._cTPos;
        let lookTarget = this._cLTar;

        if (window.cameraMode === 'center') {
            // Câmara de TV mais próxima da ação, na altura do último degrau
            targetPos.set(58 * zoom, 39 * zoom, 0);
            lookTarget.copy(this.ball.position);
        } else if (window.cameraMode === 'sideline') {
            // Câmara Lateral bem mais próxima, acompanhando a bola no eixo Z
            let bz = THREE.MathUtils.clamp(this.ball.position.z, -45, 45);
            targetPos.set(35 * zoom, 14 * zoom, bz);
            lookTarget.copy(this.ball.position);
        } else if (window.cameraMode === 'lateraltv') {
            // Mistura de TV Centro e Lateral Móvel
            // Acompanha até metade do meio-campo (|z| <= 26.5m), depois fixa a posição e gira focando o ataque
            let bz = THREE.MathUtils.clamp(this.ball.position.z, -26.5, 26.5);
            targetPos.set(48 * zoom, 23 * zoom, bz);
            lookTarget.copy(this.ball.position);

            // Quando a bola passa do ponto de corrida (|z| > 26.5m) e a câmera gira,
            // o enquadramento desloca o ponto focal à frente na direção do ataque:
            // 2/3 da visão voltada para o ataque e 1/3 para a defesa.
            const zReal = this.ball.position.z;
            if (Math.abs(zReal) > 26.5) {
                const dirAtaqueZ = (zReal > 0) ? 1 : -1;
                // Distância extra que a bola passou além do limite de corrida
                const excedenteZ = Math.abs(zReal) - 26.5;
                // Deslocamento de 2/3 para o ataque (avança o foco no eixo Z proporcional ao avanço do ataque)
                const offsetAtaqueZ = dirAtaqueZ * (excedenteZ * 0.65 + 4.5);
                lookTarget.z += offsetAtaqueZ;
            }

            if (typeof TeamAI !== 'undefined') {
                const teamA = TeamAI.get('TeamA');
                const teamB = TeamAI.get('TeamB');
                if (teamA && teamB) {
                    const defTeam = teamA.isAttacking ? teamB : teamA;
                    if (defTeam.bloco && defTeam.bloco.x1 !== undefined) {
                        // edgeX é a linha de baixo do bloco da defesa (lado +X)
                        const edgeX = defTeam.bloco.x1;
                        // O máximo normal seria o limite do campo (34)
                        const recuo = 34 - edgeX;
                        if (recuo > 0) {
                            // Aproxima a câmera na direção do seu próprio look target (frente/trás local)
                            let fwd = this._cFwd.subVectors(lookTarget, targetPos).normalize();
                            targetPos.addScaledVector(fwd, recuo * 0.5);
                        }
                    }
                }
            }
        } else if (window.cameraMode === 'topdown') {
            const aspect = window.innerWidth / window.innerHeight;
            // Campo deitado: precisamos caber (CAMPO_COMP + margem) na horizontal e (CAMPO_LARG + margem) na vertical
            const reqYForHeight = (CAMPO_LARG + 10) / 0.8284;
            const reqYForWidth = (CAMPO_COMP + 10) / (0.8284 * aspect);
            const optimalY = Math.max(reqYForHeight, reqYForWidth);
            targetPos.set(0, optimalY * zoom, 0);
            lookTarget.set(0, 0, 0);
        }

        // Interpolação de posição (suave)
        window.cameraCore.position.lerp(targetPos, 0.05);

        // Interpolação do ponto de foco
        if (!this.currentLookTarget) this.currentLookTarget = new THREE.Vector3();
        this.currentLookTarget.lerp(lookTarget, 0.08);

        // Usando lookAt direto evita que a câmara torça ou olhe para o céu ao alternar modos
        window.cameraCore.lookAt(this.currentLookTarget);
    },

    updatePlacar: function () {
        const elA = document.getElementById('placar-a');
        const elB = document.getElementById('placar-b');
        const elT = document.getElementById('placar-tempo');
        if (elA) elA.textContent = this.placarB;
        if (elB) elB.textContent = this.placarA;
        if (elT) {
            const total = Math.floor(this.tempoDeJogo);
            const mm = String(Math.floor(total / 60)).padStart(2, '0');
            const ss = String(total % 60).padStart(2, '0');
            elT.textContent = mm + ':' + ss;
        }
    },
});
