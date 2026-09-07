const fs = require('fs');
let code = fs.readFileSync('js/match/match_replay.js', 'utf8');

code = code.replace(
    /stopReplay\(\) {[\s\S]*?if \(el\) {[\s\S]*?el\.style\.backgroundColor = '';\n        }/m,
    `stopReplay() {
        if (this.isReplaying) {
            this.isReplaying = false; // Set to false FIRST to prevent infinite loop!
            // Restore to the newest frame (head - 1) before stopping
            this.replayCursor = (this.head - 1 + REPLAY_FRAMES) % REPLAY_FRAMES;
            // Manually inline playFrame logic for one frame to restore state safely
            this.restoreFrame(this.replayCursor);
        }
        let el = document.getElementById('btn-replay');
        if (el) {
            el.innerText = 'Replay (20s)';
            el.style.backgroundColor = '';
        }
        if (typeof TouchControls !== 'undefined') TouchControls.updateButtonsState();`
);

code = code.replace(
    /startReplay\(\) {[\s\S]*?if \(!window\.isPaused\) Match\.togglePause\(\);\n    }/m,
    `startReplay() {
        if (this.count === 0) return;
        this.isReplaying = true;
        this.replayCursor = (this.count < REPLAY_FRAMES) ? 0 : this.head;
        
        let el = document.getElementById('btn-replay');
        if (el) {
            el.innerText = 'Stop Replay';
            el.style.backgroundColor = '#e74c3c';
        }

        if (!window.isPaused) Match.togglePause();
        if (typeof TouchControls !== 'undefined') TouchControls.updateButtonsState();
    }`
);

fs.writeFileSync('js/match/match_replay.js', code);
console.log('Patched match_replay.js for touch controls');
