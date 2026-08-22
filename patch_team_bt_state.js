const fs = require('fs');

let code = fs.readFileSync('js/bt/team_bt.js', 'utf8');

const target = `        if (bb.blocoZSuave === undefined) {
            bb.blocoZSuave = ment.blocoZ;
        } else {
            bb.blocoZSuave = seguirBola(bb.blocoZSuave, ment.blocoZ, BlockShape.seguimentoBola, dtMatch, reposta);
        }

        centro = (bb.bolaZSuave * bb.dir) + bb.blocoZSuave;`;

const replacement = `        let stateOffset = 0;
        if (bb.state === TeamState.TRANSITION_DEFENSIVE || bb.state === TeamState.DEFENSIVE) {
            stateOffset = -7.0;
        }
        
        let targetZ = ment.blocoZ + stateOffset;

        if (bb.blocoZSuave === undefined) {
            bb.blocoZSuave = targetZ;
        } else {
            bb.blocoZSuave = seguirBola(bb.blocoZSuave, targetZ, BlockShape.seguimentoBola, dtMatch, reposta);
        }

        centro = (bb.bolaZSuave * bb.dir) + bb.blocoZSuave;`;

code = code.replace(target, replacement);
fs.writeFileSync('js/bt/team_bt.js', code);
console.log("Patched team_bt state offset!");
