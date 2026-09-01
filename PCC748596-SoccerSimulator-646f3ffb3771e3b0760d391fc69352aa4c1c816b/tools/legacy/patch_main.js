const fs = require('fs');
let code = fs.readFileSync('js/main.js', 'utf8');

code = code.replace(
/Match.offsideLineB.visible = Match.showOffsideLines;/g,
`Match.offsideLineB.visible = Match.showOffsideLines;
    if (Match.defLineA) Match.defLineA.visible = Match.showOffsideLines;
    if (Match.defLineB) Match.defLineB.visible = Match.showOffsideLines;`
);

fs.writeFileSync('js/main.js', code);
