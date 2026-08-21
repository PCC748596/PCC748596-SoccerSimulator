const fs = require('fs');
let code = fs.readFileSync('js/bt/team_bt.js', 'utf8');

const target = `    let centroX = THREE.MathUtils.clamp(
        bb.momentumX * (CAMPO_LARG / 2), -maxCentroX, maxCentroX);

    // O centro não pode ficar para trás da linha da bola (lateralmente)
    let bolaX = bb.ballX;
    if (bolaX > 0 && centroX < bolaX) centroX = bolaX;
    if (bolaX < 0 && centroX > bolaX) centroX = bolaX;`;

const replacement = `    // O utilizador pediu para atenuar o magnetismo (basculação) para 60, 70 e 80% 
    // com base na configuração de Width Compactness (short, median, large).
    const basculacao = (BlockShape.basculacao && BlockShape.basculacao[compac]) ? BlockShape.basculacao[compac] : 0.7;
    
    let centroX = THREE.MathUtils.clamp(
        bb.momentumX * (CAMPO_LARG / 2) * basculacao, -maxCentroX, maxCentroX);

    // Garante apenas que a BORDA do time cubra a bola, não que o CENTRO cubra a bola
    // (Isso evitava que o time inteiro fosse atirado para a lateral)
    let bolaX = bb.ballX;
    if (bolaX > 0 && (centroX + meiaLarg) < bolaX) centroX = bolaX - meiaLarg;
    if (bolaX < 0 && (centroX - meiaLarg) > bolaX) centroX = bolaX + meiaLarg;`;

if(code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('js/bt/team_bt.js', code);
    console.log("Patched team_bt.js successfully!");
} else {
    console.log("Target not found in team_bt.js!");
}
