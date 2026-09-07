const fs = require('fs');
let code = fs.readFileSync('js/match/match_replay.js', 'utf8');

code = code.replace(
    /stopReplay\(\) {/,
    `stopReplay() {
        if (this.isReplaying) {
            // Restore to the newest frame (head - 1) before stopping
            this.replayCursor = (this.head - 1 + REPLAY_FRAMES) % REPLAY_FRAMES;
            this.playFrame();
        }
`
);

fs.writeFileSync('js/match/match_replay.js', code);
console.log('Patched match_replay.js');
