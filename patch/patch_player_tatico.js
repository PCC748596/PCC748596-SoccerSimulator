const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

const target = `            dtCtx.fillStyle = textColor;
            dtCtx.font = 'bold 54px sans-serif';
            dtCtx.textAlign = 'center';
            dtCtx.textBaseline = 'middle';
            dtCtx.fillText(num, 64, 64);`;

const replacement = `            dtCtx.fillStyle = textColor;
            dtCtx.font = 'bold 54px sans-serif';
            dtCtx.textAlign = 'center';
            dtCtx.textBaseline = 'middle';
            dtCtx.save();
            dtCtx.translate(64, 64);
            dtCtx.rotate(-Math.PI / 2);
            dtCtx.fillText(num, 0, 0);
            dtCtx.restore();`;

if(code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('js/player.js', code);
    console.log("Patched player.js successfully!");
} else {
    console.log("Target not found in player.js!");
}
