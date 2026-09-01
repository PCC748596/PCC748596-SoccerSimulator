const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

code = code.replace(
/if \(typeof TeamAI !== 'undefined'\) \{\n                const bbA = TeamAI.get\('TeamA'\);\n                if \(bbA && typeof bbA.defLineZ === 'number'\) this.defLineA.position.z = bbA.defLineZ;\n                const bbB = TeamAI.get\('TeamB'\);\n                if \(bbB && typeof bbB.defLineZ === 'number'\) this.defLineB.position.z = bbB.defLineZ;\n            \}/g,
`if (typeof TeamShape !== 'undefined' && typeof Tatics !== 'undefined') {
                const cap = TeamShape.linhaDefensiva[Tatics.linhaDefensiva] ?? TeamShape.linhaDefensiva.medium;
                this.defLineA.position.z = cap * 1;
                this.defLineB.position.z = cap * -1;
            }`
);

fs.writeFileSync('js/match.js', code);
