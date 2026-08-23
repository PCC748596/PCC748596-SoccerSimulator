const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(
/function findBestPassAnywhere\(ctx\) \{/g,
`function findBestPassAnywhere(ctx) {
    if (ctx._bestPass !== undefined) return ctx._bestPass;`
);

code = code.replace(
/return \{ type\: \'pass\', target\: target \}\;\n    return null\;\n\}/g,
`        ctx._bestPass = { type: 'pass', target: target };
        return ctx._bestPass;
    }
    ctx._bestPass = null;
    return null;
}`
);

code = code.replace(
/function findPassSide\(ctx\) \{/g,
`function findPassSide(ctx) {
    if (ctx._sidePass !== undefined) return ctx._sidePass;`
);

code = code.replace(
/return \{ type\: \'pass\', target\: target \}\;\n    return null\;\n\}/g,
`        ctx._sidePass = { type: 'pass', target: target };
        return ctx._sidePass;
    }
    ctx._sidePass = null;
    return null;
}`
);

// We need to apply it correctly. Let's do a more robust string replacement.
