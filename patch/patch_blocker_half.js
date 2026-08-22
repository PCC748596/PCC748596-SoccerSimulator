const fs = require('fs');
let code = fs.readFileSync('js/bt/team_bt.js', 'utf8');

const regex = /function pickBlocker\(bb\) \{\n    if \(bb\.isAttacking\) \{ bb\.blocker = null; return; \}\n    const ballPos = Match\.ball\.position;/;
const replace = `function pickBlocker(bb) {
    if (bb.isAttacking) { bb.blocker = null; return; }
    const ballPos = Match.ball.position;
    // O blocker só é ativado se a bola estiver no campo de defesa
    if (ballPos.z * bb.dir >= 0) { bb.blocker = null; return; }`;

code = code.replace(regex, replace);
fs.writeFileSync('js/bt/team_bt.js', code);
