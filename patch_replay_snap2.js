const fs = require('fs');
let code = fs.readFileSync('js/match/match_replay.js', 'utf8');

code = code.replace(
    /stopReplay\(\) {[\s\S]*?this\.isReplaying = false;/m,
    `stopReplay() {
        if (this.isReplaying) {
            this.isReplaying = false; // Set to false FIRST to prevent infinite loop!
            // Restore to the newest frame (head - 1) before stopping
            this.replayCursor = (this.head - 1 + REPLAY_FRAMES) % REPLAY_FRAMES;
            // Manually inline playFrame logic for one frame to restore state safely
            this.restoreFrame(this.replayCursor);
        }`
);

// Add restoreFrame function
code = code.replace(
    /toggleReplay\(\) {/,
    `restoreFrame(idx) {
        if (this.count === 0) return;
        const base = idx * FLOATS_PER_FRAME;
        let pIdx = base;
        
        Match.ball.position.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
        Match.ball.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);

        const allPlayers = Match.players.concat(Match.opponents);
        for(let i = 0; i < 22; i++) {
            let p = allPlayers[i];
            if (!p || !p.model || !p.rig) {
                pIdx += FLOATS_PER_PLAYER;
                continue;
            }
            p.model.position.x = this.buffer[pIdx++];
            p.model.position.z = this.buffer[pIdx++];
            p.model.rotation.y = this.buffer[pIdx++];

            let r = p.rig;
            r.pelvis.position.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.pelvis.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.chest.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.lArm.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.rArm.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.lElbow.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.rElbow.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.lLeg.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.rLeg.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.lKnee.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.rKnee.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.lFoot.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.rFoot.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            
            if (r.neck) {
                r.neck.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            } else {
                pIdx += 3;
            }
        }
    }

    toggleReplay() {`
);

fs.writeFileSync('js/match/match_replay.js', code);
console.log('Patched match_replay.js to avoid infinite loop');
