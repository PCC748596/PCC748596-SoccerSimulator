const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

code = code.replace(/this\.model\.quaternion\.slerp\(_q1, Math\.min\(1\.0, 7\.0 \* Match\.delta\)\);/, 
                    'this.model.quaternion.slerp(_q1, Math.min(1.0, 3.5 * Match.delta));');

fs.writeFileSync('js/player.js', code);
