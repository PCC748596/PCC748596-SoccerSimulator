class SimpleOrbitControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.target = new THREE.Vector3(0, 0, 0);
        this.theta = -Math.PI / 2;
        this.phi = Math.PI / 4;
        this.radius = 80;

        this.isDragging = false;
        this.isTwoFingerDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };
        this.previousTouchCenter = { x: 0, y: 0 };

        this.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', () => this.onMouseUp());
        this.domElement.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        this.domElement.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.domElement.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        window.addEventListener('touchend', (e) => this.onTouchEnd(e));
        window.addEventListener('touchcancel', (e) => this.onTouchEnd(e));

        this.initialPinchDistance = 0;
        this.initialRadius = this.radius;
        this.initialZoom = 1.0;
        this.lastTapTime = 0;

        this.keys = { a: false, d: false, w: false, s: false };
        window.addEventListener('keydown', (e) => {
            const k = e.key.toLowerCase();
            if (k === 'a') this.keys.a = true;
            if (k === 'd') this.keys.d = true;
            if (k === 'w') this.keys.w = true;
            if (k === 's') this.keys.s = true;
        });
        window.addEventListener('keyup', (e) => {
            const k = e.key.toLowerCase();
            if (k === 'a') this.keys.a = false;
            if (k === 'd') this.keys.d = false;
            if (k === 'w') this.keys.w = false;
            if (k === 's') this.keys.s = false;
        });

        this.updateCameraPosition();
    }

    update() {
        if (window.cameraMode === 'orbit') {
            if (this.keys.a || this.keys.d || this.keys.w || this.keys.s) {
                let forward = new THREE.Vector3();
                this.camera.getWorldDirection(forward);
                forward.y = 0;
                forward.normalize();

                let right = new THREE.Vector3();
                right.copy(forward).cross(new THREE.Vector3(0, 1, 0)).normalize();
                
                const speed = 1.0;
                if (this.keys.a) this.target.addScaledVector(right, -speed);
                if (this.keys.d) this.target.addScaledVector(right, speed);
                if (this.keys.w) this.target.addScaledVector(forward, speed);
                if (this.keys.s) this.target.addScaledVector(forward, -speed);
            }
            this.updateCameraPosition();
        }
    }

    onMouseDown(e) {
        if (window.cameraMode !== 'orbit') return;
        this.isDragging = true;
        this.previousMousePosition = { x: e.clientX, y: e.clientY };
    }

    onMouseMove(e) {
        if (!this.isDragging || window.cameraMode !== 'orbit') return;
        const deltaX = e.clientX - this.previousMousePosition.x;
        const deltaY = e.clientY - this.previousMousePosition.y;

        // Eixos invertidos para rotação natural
        this.theta += deltaX * 0.005;
        this.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.phi - deltaY * 0.005));

        this.previousMousePosition = { x: e.clientX, y: e.clientY };
    }

    onMouseUp() {
        this.isDragging = false;
        this.isTwoFingerDragging = false;
    }

    onWheel(e) {
        window.cameraZoom = THREE.MathUtils.clamp((window.cameraZoom || 1.0) + e.deltaY * 0.001, 0.24, 2.5);
        this.radius = 80 * window.cameraZoom;
        e.preventDefault();
    }

    onTouchStart(e) {
        // Ignora toques que começaram dentro dos painéis de UI
        if (e.target.closest('#painel-comandos, #coluna-direita, #painel-direito, #painel-jogadores, #modal-skills, #touch-controls-root')) {
            return;
        }

        const now = Date.now();
        if (e.touches.length === 1) {
            // Double tap para resetar zoom ou centralizar
            if (now - this.lastTapTime < 300) {
                window.cameraZoom = 1.0;
                this.radius = 80;
                if (typeof Match !== 'undefined' && Match.ball) {
                    this.target.copy(Match.ball.position);
                }
                this.updateCameraPosition();
            }
            this.lastTapTime = now;

            if (window.cameraMode === 'orbit') {
                this.isDragging = true;
                this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        } else if (e.touches.length === 2) {
            this.isDragging = false;
            this.isTwoFingerDragging = true;
            this.initialPinchDistance = this.getPinchDistance(e);
            this.initialRadius = this.radius;
            this.initialZoom = window.cameraZoom || 1.0;
            this.previousTouchCenter = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2
            };
        }
    }

    onTouchMove(e) {
        if (e.target.closest('#painel-comandos, #coluna-direita, #painel-direito, #painel-jogadores, #modal-skills, #touch-controls-root')) {
            return;
        }

        if (e.touches.length === 1 && this.isDragging && window.cameraMode === 'orbit') {
            const deltaX = e.touches[0].clientX - this.previousMousePosition.x;
            const deltaY = e.touches[0].clientY - this.previousMousePosition.y;

            this.theta += deltaX * 0.008;
            this.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.phi - deltaY * 0.008));

            this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            e.preventDefault();
        } else if (e.touches.length === 2) {
            const currentDistance = this.getPinchDistance(e);
            if (currentDistance > 0 && this.initialPinchDistance > 0) {
                const scale = this.initialPinchDistance / currentDistance;
                window.cameraZoom = THREE.MathUtils.clamp(this.initialZoom * scale, 0.24, 2.5);
                this.radius = 80 * window.cameraZoom;
            }

            // Pan com 2 dedos no modo órbita
            if (window.cameraMode === 'orbit' && this.isTwoFingerDragging) {
                const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const dx = currentCenterX - this.previousTouchCenter.x;
                const dy = currentCenterY - this.previousTouchCenter.y;

                let right = new THREE.Vector3();
                this.camera.getWorldDirection(right);
                right.y = 0;
                right.normalize();
                right.cross(new THREE.Vector3(0, 1, 0)).normalize();

                let forward = new THREE.Vector3();
                this.camera.getWorldDirection(forward);
                forward.y = 0;
                forward.normalize();

                this.target.addScaledVector(right, -dx * 0.1);
                this.target.addScaledVector(forward, dy * 0.1);

                this.previousTouchCenter = { x: currentCenterX, y: currentCenterY };
            }

            e.preventDefault();
        }
    }

    onTouchEnd(e) {
        if (e.touches.length === 0) {
            this.isDragging = false;
            this.isTwoFingerDragging = false;
        } else if (e.touches.length === 1) {
            this.isTwoFingerDragging = false;
            if (window.cameraMode === 'orbit') {
                this.isDragging = true;
                this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        }
    }

    getPinchDistance(e) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Funções utilitárias para os controles touch virtuais
    rotateBy(dTheta, dPhi) {
        this.theta += dTheta;
        this.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.phi + dPhi));
        this.updateCameraPosition();
    }

    panBy(dx, dz) {
        let forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        let right = new THREE.Vector3();
        right.copy(forward).cross(new THREE.Vector3(0, 1, 0)).normalize();

        this.target.addScaledVector(right, dx);
        this.target.addScaledVector(forward, dz);
        this.updateCameraPosition();
    }

    zoomBy(delta) {
        window.cameraZoom = THREE.MathUtils.clamp((window.cameraZoom || 1.0) + delta, 0.24, 2.5);
        this.radius = 80 * window.cameraZoom;
        this.updateCameraPosition();
    }

    updateCameraPosition() {
        const x = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
        const y = this.radius * Math.cos(this.phi);
        const z = this.radius * Math.sin(this.phi) * Math.sin(this.theta);

        this.camera.position.set(x, y, z).add(this.target);
        this.camera.lookAt(this.target);
    }

    syncFromCamera(camera, lookTarget) {
        if (!lookTarget) return;
        this.target.copy(lookTarget);
        
        let offset = new THREE.Vector3().subVectors(camera.position, lookTarget);
        this.radius = offset.length();
        if (this.radius < 0.1) this.radius = 0.1;
        
        this.phi = Math.acos(THREE.MathUtils.clamp(offset.y / this.radius, -1, 1));
        this.theta = Math.atan2(offset.z, offset.x);
        
        this.updateCameraPosition();
    }
}
