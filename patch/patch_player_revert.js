const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

code = code.replace(/if \(window\.cameraFrustum\) \{[\s\S]*?this\.inViewport = true;\s*\}/, `this.inViewport = true;`);
code = code.replace(/this\.model\.visible = !vistaTatica && this\.inViewport;/, `this.model.visible = !vistaTatica;`);

fs.writeFileSync('js/player.js', code);
