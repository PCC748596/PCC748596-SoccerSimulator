const fs = require('fs');

let playerCode = fs.readFileSync('js/player.js', 'utf8');

const bannerOld = `    showActionBanner(text) {
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

const bannerNew = `    showActionBanner(text) {
        this.actionBannerTimer = 1.2; 
        this.actionSprite.visible = true;
        
        this.actionCtx.clearRect(0, 0, 512, 128);
        this.actionCtx.font = 'bold 48px "Segoe UI", Arial, sans-serif';
        this.actionCtx.textAlign = 'center';
        this.actionCtx.textBaseline = 'middle';
        
        let metrics = this.actionCtx.measureText(text);
        let textWidth = metrics.width;
        let fontHeight = 48; // Base fallback height
        if (metrics.actualBoundingBoxAscent) {
            fontHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
        }
        
        let paddingX = 30; 
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
        // Since textBaseline is 'middle', placing it exactly at the center Y coordinate (64) handles most of the work. 
        // We add +2 purely to optically center all-caps text perfectly inside the box padding.
        this.actionCtx.fillText(text, 256, 64 + 2); 
        
        this.actionTex.needsUpdate = true;
    }`;

playerCode = playerCode.replace(bannerOld, bannerNew);
fs.writeFileSync('js/player.js', playerCode);

// Bump version
let indexCode = fs.readFileSync('index.html', 'utf8');
indexCode = indexCode.replace(/0\.0589/g, '0.0590');
fs.writeFileSync('index.html', indexCode);

console.log("Banner centered and reduced.");
