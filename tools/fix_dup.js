const fs = require('fs');
let code = fs.readFileSync('js/bt/team_bt.js', 'utf8');

const regex = /\/\/ O blocker só é ativado se a bola estiver no campo de defesa\n    if \(ballPos\.z \* bb\.dir >= 0\) \{ bb\.blocker = null; return; \}\n    \/\/ O blocker só é ativado se a bola estiver no campo de defesa\n    if \(ballPos\.z \* bb\.dir >= 0\) \{ bb\.blocker = null; return; \}/g;
const replace = `// O blocker só é ativado se a bola estiver no campo de defesa
    if (ballPos.z * bb.dir >= 0) { bb.blocker = null; return; }`;

code = code.replace(regex, replace);
fs.writeFileSync('js/bt/team_bt.js', code);
