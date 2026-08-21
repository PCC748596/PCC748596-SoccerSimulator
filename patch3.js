const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

const target = `        let dtCanvas = document.createElement('canvas');
        dtCanvas.width = 128; dtCanvas.height = 128;
        let dtCtx = dtCanvas.getContext('2d');
        
        let isTeamA = (this.team === 'TeamA');
        let borderColor = isTeamA ? '#000000' : '#ffffff';
        let textColor = isTeamA ? '#000000' : '#ffffff';
        
        dtCtx.fillStyle = this.corCamisa;
        dtCtx.beginPath();
        dtCtx.arc(64, 64, 58, 0, Math.PI * 2);
        dtCtx.fill();
        
        dtCtx.lineWidth = 6;
        dtCtx.strokeStyle = borderColor;
        dtCtx.stroke();
        
        dtCtx.fillStyle = textColor;
        dtCtx.font = 'bold 54px sans-serif';
        dtCtx.textAlign = 'center';
        dtCtx.textBaseline = 'middle';
        dtCtx.fillText(num, 64, 64);
        
        let dtTex = new THREE.CanvasTexture(dtCanvas);
        this.discoTatico.material.map = dtTex;
        this.discoTatico.material.needsUpdate = true;`;

const replacement = `        if (this.discoTaticoTexNum !== num || this.discoTaticoTexTeam !== this.team) {
            let dtCanvas = document.createElement('canvas');
            dtCanvas.width = 128; dtCanvas.height = 128;
            let dtCtx = dtCanvas.getContext('2d');
            
            let isTeamA = (this.team === 'TeamA');
            let borderColor = isTeamA ? '#000000' : '#ffffff';
            let textColor = isTeamA ? '#000000' : '#ffffff';
            
            dtCtx.fillStyle = this.corCamisa;
            dtCtx.beginPath();
            dtCtx.arc(64, 64, 58, 0, Math.PI * 2);
            dtCtx.fill();
            
            dtCtx.lineWidth = 8;
            dtCtx.strokeStyle = borderColor;
            dtCtx.stroke();
            
            dtCtx.fillStyle = textColor;
            dtCtx.font = 'bold 54px sans-serif';
            dtCtx.textAlign = 'center';
            dtCtx.textBaseline = 'middle';
            dtCtx.fillText(num, 64, 64);
            
            let dtTex = new THREE.CanvasTexture(dtCanvas);
            this.discoTatico.material.map = dtTex;
            this.discoTatico.material.needsUpdate = true;
            this.discoTaticoTexNum = num;
            this.discoTaticoTexTeam = this.team;
        }`;

if(code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('js/player.js', code);
    console.log("Patched player.js successfully again!");
} else {
    console.log("Target not found!");
}
