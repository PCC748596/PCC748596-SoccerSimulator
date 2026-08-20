const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

code = code.replace(/this\.inViewport = true;/, `if (window.cameraFrustum) {
            this.inViewport = window.cameraFrustum.containsPoint(this.model.position);
        } else {
            this.inViewport = true;
        }`);

code = code.replace(/this\.model\.visible = !vistaTatica;/, `this.model.visible = !vistaTatica && this.inViewport;`);

fs.writeFileSync('js/player.js', code);
