const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');

const toAdd = {
    149: "    */",
    163: "    */",
    177: "    */",
    207: "    */",
    219: "    */",
    242: "    */",
    251: "        */",
    294: "    */",
};

// Wait, the line numbers might have shifted.
// Let's just match the preceding line.
const replacements = [
    { after: "    salto: 0.42,", line: "    ritmoSalto: 7.0," }, // wait, before "    fraccaoRepouso:" is a comment
];
// Instead, let's just use regex to insert `*/` before certain function/property definitions.
