const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

code = code.replace(/if \(typeof EventBus !== 'undefined'\) \{[\s\S]*?EventBus\.on\('GK_CATCH_BALL', \(d\) => \{[\s\S]*?\}\);[\s\S]*?EventBus\.on\('GK_RELEASE_BALL', \(d\) => \{[\s\S]*?\}\);[\s\S]*?\}/,
  `if (typeof EventBus !== 'undefined' && !this._eventBusBound) {
            this._eventBusBound = true;
            EventBus.on('GK_CATCH_BALL', (d) => {
                if (this.gkHoldingBall) this.gkHoldingBall[d.team] = true;
            });
            EventBus.on('GK_RELEASE_BALL', (d) => {
                if (this.gkHoldingBall) this.gkHoldingBall[d.team] = false;
            });
        }`);

fs.writeFileSync('js/match.js', code);
console.log("Patched eventbus in match!");
