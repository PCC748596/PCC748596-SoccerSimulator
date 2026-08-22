const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

// Add constructor properties
const constructorMatch = `        this.labelSprite.visible = false;
    }`;
const constructorReplace = `        this.labelSprite.visible = false;

        // Action Banner
        this.actionCanvas = document.createElement('canvas');
        this.actionCanvas.width = 512;
        this.actionCanvas.height = 128;
        this.actionCtx = this.actionCanvas.getContext('2d');
        this.actionTex = new THREE.CanvasTexture(this.actionCanvas);
        this.actionTex.generateMipmaps = false;
        this.actionTex.minFilter = THREE.LinearFilter;
        this.actionMat = new THREE.SpriteMaterial({ map: this.actionTex, transparent: true, depthWrite: false });
        this.actionSprite = new THREE.Sprite(this.actionMat);
        this.actionSprite.scale.set(12, 3, 1);
        this.actionSprite.position.set(0, 11.5, 0); 
        this.model.add(this.actionSprite);
        this.actionSprite.visible = false;
        this.actionBannerTimer = 0;
    }`;
code = code.replace(constructorMatch, constructorReplace);

// Add method
const methodMatch = `    executeHeader() {`;
const methodReplace = `    showActionBanner(text) {
        this.actionBannerTimer = 1.2; 
        this.actionSprite.visible = true;
        
        this.actionCtx.clearRect(0, 0, 512, 128);
        this.actionCtx.font = 'bold 52px "Segoe UI", Arial, sans-serif';
        this.actionCtx.textAlign = 'center';
        this.actionCtx.textBaseline = 'middle';
        
        let textWidth = this.actionCtx.measureText(text).width;
        let bgWidth = textWidth + 40;
        let bgHeight = 70;
        let startX = 256 - (bgWidth / 2);
        let startY = 64 - (bgHeight / 2);
        
        this.actionCtx.fillStyle = '#FFD700'; 
        this.actionCtx.beginPath();
        if (this.actionCtx.roundRect) {
            this.actionCtx.roundRect(startX, startY, bgWidth, bgHeight, 12);
        } else {
            this.actionCtx.rect(startX, startY, bgWidth, bgHeight);
        }
        this.actionCtx.fill();
        
        this.actionCtx.lineWidth = 3;
        this.actionCtx.strokeStyle = '#000000';
        this.actionCtx.stroke();
        
        this.actionCtx.fillStyle = '#000000';
        this.actionCtx.fillText(text, 256, 64 + 4); // +4 for slight vertical optical alignment
        
        this.actionTex.needsUpdate = true;
    }

    executeHeader() {`;
code = code.replace(methodMatch, methodReplace);

// Update in update(dt)
const updateMatch = `        // Atualização da UI flutuante (PlayerNumber, PlayerBT, PlayerPOS e PlayerPlayingStyle)`;
const updateReplace = `        // Update Action Banner
        if (this.actionBannerTimer > 0) {
            this.actionBannerTimer -= dt;
            if (this.actionBannerTimer <= 0) {
                this.actionSprite.visible = false;
            }
        }

        // Atualização da UI flutuante (PlayerNumber, PlayerBT, PlayerPOS e PlayerPlayingStyle)`;
code = code.replace(updateMatch, updateReplace);

fs.writeFileSync('js/player.js', code);
console.log("Patched player.js for action banner");
