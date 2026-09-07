const REPLAY_FRAMES = 1200; // 20s at 60fps
const FLOATS_PER_PLAYER = 49;
const FLOATS_PER_FRAME = 7 + 22 * FLOATS_PER_PLAYER;

class ReplaySystem {
    constructor() {
        this.buffer = new Float32Array(REPLAY_FRAMES * FLOATS_PER_FRAME);
        this.head = 0; 
        this.count = 0; 
        this.isReplaying = false;
        this.replayCursor = 0; 
    }

    recordFrame() {
        if (this.isReplaying || !Match.ball) return;
        
        const base = this.head * FLOATS_PER_FRAME;
        let pIdx = base;
        
        this.buffer[pIdx++] = Match.ball.position.x;
        this.buffer[pIdx++] = Match.ball.position.y;
        this.buffer[pIdx++] = Match.ball.position.z;
        this.buffer[pIdx++] = Match.ball.quaternion.x;
        this.buffer[pIdx++] = Match.ball.quaternion.y;
        this.buffer[pIdx++] = Match.ball.quaternion.z;
        this.buffer[pIdx++] = Match.ball.quaternion.w;

        const allPlayers = Match.players.concat(Match.opponents);
        for(let i = 0; i < 22; i++) {
            let p = allPlayers[i];
            if (!p || !p.model || !p.rig) {
                pIdx += FLOATS_PER_PLAYER;
                continue;
            }
            this.buffer[pIdx++] = p.model.position.x;
            this.buffer[pIdx++] = p.model.position.y;
            this.buffer[pIdx++] = p.model.position.z;
            this.buffer[pIdx++] = p.model.quaternion.x;
            this.buffer[pIdx++] = p.model.quaternion.y;
            this.buffer[pIdx++] = p.model.quaternion.z;
            this.buffer[pIdx++] = p.model.quaternion.w;

            let r = p.rig;
            this.buffer[pIdx++] = r.pelvis.position.x;
            this.buffer[pIdx++] = r.pelvis.position.y;
            this.buffer[pIdx++] = r.pelvis.position.z;

            this.buffer[pIdx++] = r.pelvis.rotation.x; this.buffer[pIdx++] = r.pelvis.rotation.y; this.buffer[pIdx++] = r.pelvis.rotation.z;
            this.buffer[pIdx++] = r.chest.rotation.x; this.buffer[pIdx++] = r.chest.rotation.y; this.buffer[pIdx++] = r.chest.rotation.z;
            this.buffer[pIdx++] = r.lArm.rotation.x; this.buffer[pIdx++] = r.lArm.rotation.y; this.buffer[pIdx++] = r.lArm.rotation.z;
            this.buffer[pIdx++] = r.rArm.rotation.x; this.buffer[pIdx++] = r.rArm.rotation.y; this.buffer[pIdx++] = r.rArm.rotation.z;
            this.buffer[pIdx++] = r.lElbow.rotation.x; this.buffer[pIdx++] = r.lElbow.rotation.y; this.buffer[pIdx++] = r.lElbow.rotation.z;
            this.buffer[pIdx++] = r.rElbow.rotation.x; this.buffer[pIdx++] = r.rElbow.rotation.y; this.buffer[pIdx++] = r.rElbow.rotation.z;
            this.buffer[pIdx++] = r.lLeg.rotation.x; this.buffer[pIdx++] = r.lLeg.rotation.y; this.buffer[pIdx++] = r.lLeg.rotation.z;
            this.buffer[pIdx++] = r.rLeg.rotation.x; this.buffer[pIdx++] = r.rLeg.rotation.y; this.buffer[pIdx++] = r.rLeg.rotation.z;
            this.buffer[pIdx++] = r.lKnee.rotation.x; this.buffer[pIdx++] = r.lKnee.rotation.y; this.buffer[pIdx++] = r.lKnee.rotation.z;
            this.buffer[pIdx++] = r.rKnee.rotation.x; this.buffer[pIdx++] = r.rKnee.rotation.y; this.buffer[pIdx++] = r.rKnee.rotation.z;
            this.buffer[pIdx++] = r.lFoot.rotation.x; this.buffer[pIdx++] = r.lFoot.rotation.y; this.buffer[pIdx++] = r.lFoot.rotation.z;
            this.buffer[pIdx++] = r.rFoot.rotation.x; this.buffer[pIdx++] = r.rFoot.rotation.y; this.buffer[pIdx++] = r.rFoot.rotation.z;
            
            if (r.neck) {
                this.buffer[pIdx++] = r.neck.rotation.x; this.buffer[pIdx++] = r.neck.rotation.y; this.buffer[pIdx++] = r.neck.rotation.z;
            } else {
                this.buffer[pIdx++] = 0; this.buffer[pIdx++] = 0; this.buffer[pIdx++] = 0;
            }
        }
        
        this.head = (this.head + 1) % REPLAY_FRAMES;
        if (this.count < REPLAY_FRAMES) this.count++;
    }
    
    startReplay() {
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
    }
    
    stopReplay() {
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
        if (typeof TouchControls !== 'undefined') TouchControls.updateButtonsState();
    }

    restoreFrame(idx) {
        if (this.count === 0) return;
        const base = idx * FLOATS_PER_FRAME;
        let pIdx = base;
        
        Match.ball.position.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
        Match.ball.quaternion.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);

        const allPlayers = Match.players.concat(Match.opponents);
        for(let i = 0; i < 22; i++) {
            let p = allPlayers[i];
            if (!p || !p.model || !p.rig) {
                pIdx += FLOATS_PER_PLAYER;
                continue;
            }
            p.model.position.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            p.model.quaternion.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);

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

    toggleReplay() {
        if (this.isReplaying) this.stopReplay();
        else this.startReplay();
    }
    
    playFrame() {
        if (!this.isReplaying || this.count === 0) return;
        
        const base = this.replayCursor * FLOATS_PER_FRAME;
        let pIdx = base;
        
        Match.ball.position.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
        Match.ball.quaternion.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);

        const allPlayers = Match.players.concat(Match.opponents);
        for(let i = 0; i < 22; i++) {
            let p = allPlayers[i];
            if (!p || !p.model || !p.rig) {
                pIdx += FLOATS_PER_PLAYER;
                continue;
            }
            
            p.model.position.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            p.model.quaternion.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);

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
        
        this.replayCursor = (this.replayCursor + 1) % REPLAY_FRAMES;
        if (this.replayCursor === this.head) {
            this.stopReplay();
        }
    }
}

window.MatchReplay = new ReplaySystem();
