const fs = require('fs');
let code = fs.readFileSync('js/match/match_replay.js', 'utf8');

// Replace constants
code = code.replace(/const FLOATS_PER_PLAYER = \d+;/, 'const FLOATS_PER_PLAYER = 49;');
code = code.replace(/const FLOATS_PER_FRAME = \d+ \+ 22 \* FLOATS_PER_PLAYER;/, 'const FLOATS_PER_FRAME = 7 + 22 * FLOATS_PER_PLAYER;');

// Replace Ball record
code = code.replace(
    /this\.buffer\[pIdx\+\+\] = Match\.ball\.rotation\.x;\s*this\.buffer\[pIdx\+\+\] = Match\.ball\.rotation\.y;\s*this\.buffer\[pIdx\+\+\] = Match\.ball\.rotation\.z;/,
    `this.buffer[pIdx++] = Match.ball.quaternion.x;
        this.buffer[pIdx++] = Match.ball.quaternion.y;
        this.buffer[pIdx++] = Match.ball.quaternion.z;
        this.buffer[pIdx++] = Match.ball.quaternion.w;`
);

// Replace Player model record
code = code.replace(
    /this\.buffer\[pIdx\+\+\] = p\.model\.position\.x;\s*this\.buffer\[pIdx\+\+\] = p\.model\.position\.z;\s*this\.buffer\[pIdx\+\+\] = p\.model\.rotation\.y;/,
    `this.buffer[pIdx++] = p.model.position.x;
            this.buffer[pIdx++] = p.model.position.y;
            this.buffer[pIdx++] = p.model.position.z;
            this.buffer[pIdx++] = p.model.quaternion.x;
            this.buffer[pIdx++] = p.model.quaternion.y;
            this.buffer[pIdx++] = p.model.quaternion.z;
            this.buffer[pIdx++] = p.model.quaternion.w;`
);

// Replace restoreFrame Ball
code = code.replace(
    /Match\.ball\.rotation\.set\(this\.buffer\[pIdx\+\+\], this\.buffer\[pIdx\+\+\], this\.buffer\[pIdx\+\+\]\);/,
    `Match.ball.quaternion.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);`
);

// Replace restoreFrame Player
code = code.replace(
    /p\.model\.position\.x = this\.buffer\[pIdx\+\+\];\s*p\.model\.position\.z = this\.buffer\[pIdx\+\+\];\s*p\.model\.rotation\.y = this\.buffer\[pIdx\+\+\];/,
    `p.model.position.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            p.model.quaternion.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);`
);

// Replace playFrame Ball
code = code.replace(
    /Match\.ball\.rotation\.set\(this\.buffer\[pIdx\+\+\], this\.buffer\[pIdx\+\+\], this\.buffer\[pIdx\+\+\]\);/,
    `Match.ball.quaternion.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);`
);

// Replace playFrame Player
code = code.replace(
    /p\.model\.position\.x = this\.buffer\[pIdx\+\+\];\s*p\.model\.position\.z = this\.buffer\[pIdx\+\+\];\s*p\.model\.rotation\.y = this\.buffer\[pIdx\+\+\];/,
    `p.model.position.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            p.model.quaternion.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);`
);

fs.writeFileSync('js/match/match_replay.js', code);
console.log('Patched match_replay.js to use quaternions');
