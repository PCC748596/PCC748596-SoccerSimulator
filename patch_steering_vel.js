const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

code = code.replace(/this\.velocity\.lerp\(desired, Math\.min\(1\.0, 2\.5 \* Match\.delta\)\);/, 
                    'this.velocity.lerp(desired, Math.min(1.0, 1.8 * Match.delta));');

fs.writeFileSync('js/player.js', code);
