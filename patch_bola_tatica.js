const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

const target = `            let tex = new THREE.CanvasTexture(cvs);

            this.discoBola = new THREE.Mesh(
                new THREE.CircleGeometry(0.4675, 20),
                new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
            );
            this.discoBola.rotation.x = -Math.PI / 2;
            this.discoBola.visible = false;
            this.scene.add(this.discoBola);
        }

        this.discoBola.visible = tatico;
        // Ligeiramente acima dos discos dos jogadores: a bola nunca fica
        // escondida por baixo de quem a tem.
        this.discoBola.position.set(this.ball.position.x, 0.06, this.ball.position.z);
        this.ball.visible = !tatico;`;

const replacement = `            let tex = new THREE.CanvasTexture(cvs);

            this.discoBola = new THREE.Group();

            this.discoIcon = new THREE.Mesh(
                new THREE.CircleGeometry(0.4675, 20),
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
                new THREE.PlaneGeometry(1.0, 1.0),
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
        }`;

if(code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('js/match.js', code);
    console.log("Patched match.js successfully!");
} else {
    console.log("Target not found in match.js!");
}
