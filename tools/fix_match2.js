const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

const badCode = `        if (typeof EventBus !== 'undefined' && !this._eventBusBound) {
            this._eventBusBound = true;
            EventBus.on('GK_CATCH_BALL', (d) => {
                if (this.gkHoldingBall) this.gkHoldingBall[d.team] = true;
            });
            EventBus.on('GK_RELEASE_BALL', (d) => {
                if (this.gkHoldingBall) this.gkHoldingBall[d.team] = false;
            });
        };                    jog.buildOutTimer = 5.0;                };                aplicar(outroCB, -3);                aplicar(mesmoLado, 3);                aplicar(ladoOposto, 5);            });`;

const goodCode = `        if (typeof EventBus !== 'undefined' && !this._eventBusBound) {
            this._eventBusBound = true;
            EventBus.on('GK_CATCH_BALL', (d) => {
                if (this.gkHoldingBall) this.gkHoldingBall[d.team] = true;
            });
            EventBus.on('GK_RELEASE_BALL', (d) => {
                if (this.gkHoldingBall) this.gkHoldingBall[d.team] = false;
            });
            
            EventBus.on('CB_HAS_BALL', (d) => {
                const p = d.p;
                const teammates = (p.team === 'TeamA') ? this.players : this.opponents;
                const outroCB = teammates.find(t => t.pos === 'CB' && t !== p);
                const rm = teammates.find(t => t.pos === 'RM');
                const lm = teammates.find(t => t.pos === 'LM');
                const rb = teammates.find(t => t.pos === 'RB');
                const lb = teammates.find(t => t.pos === 'LB');
                
                const ladoJogada = Math.sign(p.model.position.x) || Math.sign(this.ball.position.x) || 1;
                const mesmoLado = (ladoJogada > 0) ? rm || rb : lm || lb;
                const ladoOposto = (ladoJogada > 0) ? lm || lb : rm || rb;
                
                const aplicar = (jog, ofs) => {
                    if (!jog) return;
                    if (!jog.buildOutOffset) jog.buildOutOffset = new THREE.Vector3();
                    jog.buildOutOffset.setZ(ofs * jog.dirZ);
                    jog.buildOutTimer = 5.0;
                };
                
                aplicar(outroCB, -3);
                aplicar(mesmoLado, 3);
                aplicar(ladoOposto, 5);
            });`;

code = code.replace(badCode, goodCode);
fs.writeFileSync('js/match.js', code);
console.log("Fixed match!");
