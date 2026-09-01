const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');

function insertBefore(searchStr, insertStr) {
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(searchStr)) {
            lines.splice(i, 0, insertStr);
            return;
        }
    }
}

insertBefore('duracaoTransicao: 0.55,', '    */');
insertBefore('fraccaoRepouso: 0.08,', '    */');
insertBefore('tercoZ: 106 / 6,', '    */');
insertBefore('noTercoOfensivo(team, bolaZ) {', '    */');
insertBefore('_histerese(team, condicao, dt) {', '    */');
insertBefore('avaliar(dados) {', '    */');
insertBefore('if (dados.estado === \'GOAL\' && dados.equipaQueMarcou) {', '        */');
insertBefore('_pecas(pose) {', '    */');

fs.writeFileSync('js/crowd.js', lines.join('\n'));
