const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

const target = `        if (!this.discoBola) {
            this.discoBola = new THREE.Mesh(
                new THREE.CircleGeometry(0.55, 20),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            this.discoBola.rotation.x = -Math.PI / 2;
            this.discoBola.visible = false;
            this.scene.add(this.discoBola);
        }`;

const replacement = `        if (!this.discoBola) {
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

            this.discoBola = new THREE.Mesh(
                new THREE.CircleGeometry(0.55, 20),
                new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
            );
            this.discoBola.rotation.x = -Math.PI / 2;
            this.discoBola.visible = false;
            this.scene.add(this.discoBola);
        }`;

if(code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('js/match.js', code);
    console.log("Patched match.js successfully!");
} else {
    console.log("Target not found!");
}
