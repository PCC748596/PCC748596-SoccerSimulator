const fs = require('fs');
let code = fs.readFileSync('js/touch_controls.js', 'utf8');

code = code.replace(
    /<button type="button" id="btn-touch-panels" class="touch-btn" title="Ocultar \/ Exibir Painéis">/,
    `<button type="button" id="btn-touch-replay" class="touch-btn touch-btn-primary" title="Replay (20s)" style="background-color: #d35400;">
                    <span class="touch-icon" id="touch-replay-icon">⏪</span>
                    <span class="touch-label" id="touch-replay-label">Replay</span>
                </button>
                <button type="button" id="btn-touch-panels" class="touch-btn" title="Ocultar / Exibir Painéis">`
);

fs.writeFileSync('js/touch_controls.js', code);
console.log('Patched touch_controls.js DOM');
