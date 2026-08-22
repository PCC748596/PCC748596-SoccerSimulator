const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

// The replacement I did:
// if (typeof EventBus !== 'undefined' && !this._eventBusBound) { ... }
// I probably accidentally deleted CB_HAS_BALL!

const expected = `        if (typeof EventBus !== 'undefined' && !this._eventBusBound) {
            this._eventBusBound = true;
            EventBus.on('GK_CATCH_BALL', (d) => {
                if (this.gkHoldingBall) this.gkHoldingBall[d.team] = true;
            });
            EventBus.on('GK_RELEASE_BALL', (d) => {
                if (this.gkHoldingBall) this.gkHoldingBall[d.team] = false;
            });
        };                    jog.buildOutTimer = 5.0;                };                aplicar(outroCB, -3);                aplicar(mesmoLado, 3);                aplicar(ladoOposto, 5);            });`;

// That's corrupted. Let's fix it by manually replacing lines 28 to 44.
