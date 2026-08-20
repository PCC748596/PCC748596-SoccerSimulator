const fs = require('fs');
let code = fs.readFileSync('js/main.js', 'utf8');

code = code.replace(/rendererCore\.shadowMap\.type = THREE\.PCFSoftShadowMap;/, `rendererCore.shadowMap.type = THREE.PCFShadowMap; // Better performance`);

fs.writeFileSync('js/main.js', code);
