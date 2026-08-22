const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

const passMatch = `        if (targetPlayer && this.model.position.distanceTo(targetPlayer.model.position) > 20) {
            this.showActionBanner('L.PASS');
        } else {
            this.showActionBanner('PASS');
        }`;
const passReplace = `        if (this.isCross) {
            this.showActionBanner('CROSS');
        } else if (targetPlayer && this.model.position.distanceTo(targetPlayer.model.position) > 20) {
            this.showActionBanner('L.PASS');
        } else {
            this.showActionBanner('PASS');
        }`;
code = code.replace(passMatch, passReplace);

fs.writeFileSync('js/player.js', code);
console.log("Patched player.js cross");
