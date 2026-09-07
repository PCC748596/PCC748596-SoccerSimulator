const fs = require('fs');
let code = fs.readFileSync('js/touch_controls.js', 'utf8');

code = code.replace(
    /bindEvents: function \(\) {/,
    `bindEvents: function () {
        // Botão Replay
        const btnReplay = document.getElementById('btn-touch-replay');
        if (btnReplay) {
            btnReplay.addEventListener('click', () => {
                if (window.MatchReplay) {
                    window.MatchReplay.toggleReplay();
                    this.updateButtonsState();
                }
            });
        }`
);

fs.writeFileSync('js/touch_controls.js', code);
console.log('Patched touch_controls.js bindEvents');
