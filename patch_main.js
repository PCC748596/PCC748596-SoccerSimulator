const fs = require('fs');
let code = fs.readFileSync('js/main.js', 'utf8');

code = code.replace(
    /rendererCore\.render\(scene, cameraCore\);/,
    `if (window.MatchReplay && window.MatchReplay.isReplaying) {
        window.MatchReplay.playFrame();
    } else if (window.MatchReplay && !window.isPaused) {
        window.MatchReplay.recordFrame();
    }
    rendererCore.render(scene, cameraCore);`
);

fs.writeFileSync('js/main.js', code);
console.log('Patched main.js');
