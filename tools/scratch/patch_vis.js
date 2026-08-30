const fs = require('fs');
const file = 'js/match/match_loop.js';
let content = fs.readFileSync(file, 'utf8');

const search = `                    let bZ = (bb.ballZ || 0) * bb.dir;
                    if (bZ < bb.bloco.zMid) {
                        centroMesh[0].visible = true;
                    } else if (bZ < bb.bloco.zAtk) {
                        centroMesh[1].visible = true;
                    } else {
                        centroMesh[2].visible = true;
                    }`;

const replace = `                    let bZ = (bb.ballZ || 0) * bb.dir;
                    // Para alinhar com a perceção do utilizador: ativar o centro com base no setor do campo
                    // onde a bola está, em vez de onde a bola "cai" dentro do bloco tático empurrado.
                    if (bZ < -17.5) {
                        centroMesh[0].visible = true; // Setor defensivo
                    } else if (bZ < 17.5) {
                        centroMesh[1].visible = true; // Setor de meio-campo
                    } else {
                        centroMesh[2].visible = true; // Setor ofensivo
                    }`;

content = content.replace(search, replace);
fs.writeFileSync(file, content);
console.log("Patch applied to match_loop.");
