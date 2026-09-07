const fs = require('fs');
let code = fs.readFileSync('js/touch_controls.js', 'utf8');

code = code.replace(
    /updateButtonsState: function \(\) {/,
    `updateButtonsState: function () {
        // Atualiza botão de Replay
        const btnReplay = document.getElementById('btn-touch-replay');
        if (btnReplay && window.MatchReplay) {
            const isReplaying = window.MatchReplay.isReplaying;
            btnReplay.querySelector('.touch-label').textContent = isReplaying ? 'Stop' : 'Replay';
            btnReplay.style.backgroundColor = isReplaying ? '#c0392b' : '#d35400';
            btnReplay.classList.toggle('touch-btn-paused', isReplaying);
        }
`
);

fs.writeFileSync('js/touch_controls.js', code);
console.log('Patched touch_controls.js updateButtonsState');
