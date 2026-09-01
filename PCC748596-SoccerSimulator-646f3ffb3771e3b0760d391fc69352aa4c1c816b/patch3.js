const fs = require('fs');
const file = 'js/bt/team_bt.js';
let content = fs.readFileSync(file, 'utf8');

const search = `        if (gkComBola) {
            distFrente = Math.max(distFrente, 25);
            distTras = Math.max(distTras, 15);
        }`;

const replace = `        if (gkComBola) {
            distFrente = Math.max(distFrente, 60); // Permite que o time se espalhe pelo campo todo
            distTras = Math.max(distTras, 15);
        }`;

content = content.replace(search, replace);
fs.writeFileSync(file, content);
console.log("Patch 3 applied.");
