const fs = require('fs');

// Patch config.js
let configCode = fs.readFileSync('js/config.js', 'utf8');
configCode = configCode.replace('touchPower: 11.0,     // força do toque lateral', 'touchPower: 8.25,     // força do toque lateral');
fs.writeFileSync('js/config.js', configCode);

// Patch player.js
let playerCode = fs.readFileSync('js/player.js', 'utf8');

const bannerOld = `    showActionBanner(text) {
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
    }`;

const bannerNew = `    showActionBanner(text) {
        this.actionBannerTimer = 1.2; 
        this.actionSprite.visible = true;
        
        this.actionCtx.clearRect(0, 0, 512, 128);
        this.actionCtx.font = 'bold 50px "Segoe UI", Arial, sans-serif'; // Reduced by 2px
        this.actionCtx.textAlign = 'center';
        this.actionCtx.textBaseline = 'middle';
        
        // Auto size using metrics
        let metrics = this.actionCtx.measureText(text);
        let textWidth = metrics.width;
        let fontHeight = (metrics.actualBoundingBoxAscent || 35) + (metrics.actualBoundingBoxDescent || 10);
        
        let paddingX = 30; // Auto tight padding
        let paddingY = 16;
        
        let bgWidth = textWidth + paddingX;
        let bgHeight = fontHeight + paddingY;
        let startX = 256 - (bgWidth / 2);
        let startY = 64 - (bgHeight / 2);
        
        this.actionCtx.fillStyle = '#FFD700'; 
        this.actionCtx.beginPath();
        if (this.actionCtx.roundRect) {
            this.actionCtx.roundRect(startX, startY, bgWidth, bgHeight, 10);
        } else {
            this.actionCtx.rect(startX, startY, bgWidth, bgHeight);
        }
        this.actionCtx.fill();
        
        this.actionCtx.lineWidth = 3;
        this.actionCtx.strokeStyle = '#000000';
        this.actionCtx.stroke();
        
        this.actionCtx.fillStyle = '#000000';
        // Adjust for vertical centering offset based on actual metrics if available
        let textOffsetY = (metrics.actualBoundingBoxAscent) ? (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent)/2 - fontHeight/2 + 4 : 4;
        this.actionCtx.fillText(text, 256, 64 + textOffsetY); 
        
        this.actionTex.needsUpdate = true;
    }`;

playerCode = playerCode.replace(bannerOld, bannerNew);
fs.writeFileSync('js/player.js', playerCode);

// Bump version
let indexCode = fs.readFileSync('index.html', 'utf8');
indexCode = indexCode.replace(/0\.0588/g, '0.0589');
fs.writeFileSync('index.html', indexCode);

console.log("Patches applied!");
