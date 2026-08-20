const fs = require('fs');
let code = fs.readFileSync('js/bt/team_bt.js', 'utf8');

const regex = /return \{\s*x: bloco\.x0 \+ u \* \(bloco\.x1 - bloco\.x0\),\s*z: \(bloco\.z0 \+ v \* \(bloco\.z1 - bloco\.z0\)\) \* bb\.dir\s*\};/;

const replace = `let xTarget = bloco.x0 + u * (bloco.x1 - bloco.x0);
    const zTarget = (bloco.z0 + v * (bloco.z1 - bloco.z0)) * bb.dir;

    const ballX = bb.ballX || 0;
    const CORREDOR_LIMITE = 11.33; 

    let ballCorredor = 0;
    if (ballX > CORREDOR_LIMITE) ballCorredor = 1;
    else if (ballX < -CORREDOR_LIMITE) ballCorredor = -1;

    let pCorredor = 0;
    if (xTarget > CORREDOR_LIMITE) pCorredor = 1;
    else if (xTarget < -CORREDOR_LIMITE) pCorredor = -1;

    if (ballCorredor === 0) {
        if (pCorredor === 1) xTarget -= 4.0;
        else if (pCorredor === -1) xTarget += 4.0;
    } else {
        if (pCorredor === 0) {
            xTarget += ballCorredor * 2.0;
        } else if (pCorredor === -ballCorredor) {
            xTarget += ballCorredor * 3.0;
        }
    }

    return {
        x: xTarget,
        z: zTarget
    };`;

code = code.replace(regex, replace);
fs.writeFileSync('js/bt/team_bt.js', code);
