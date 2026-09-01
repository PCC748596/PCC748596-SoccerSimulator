const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');

for (let i = 520; i < 530; i++) {
    if (lines[i] && lines[i].includes('_aplicarShader(mat, uniforms) {')) {
        lines.splice(i, 0, '    */');
        break;
    }
}

fs.writeFileSync('js/crowd.js', lines.join('\n'));
