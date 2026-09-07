export function addGoalScaleTest(Match) {
    const FIELD_LENGTH = Match.fieldLength || 105;
    const LARGURA_BALIZA = 7.32;
    const goalX = -FIELD_LENGTH / 2;
    const startZ = -LARGURA_BALIZA / 2;
    
    // Cor laranja forte para destacar
    for (let i = 0; i < 4; i++) {
        let p = new FootballPlayer(900 + i, '#ff8800', '#ffffff', 'Test');
        
        // Posição: linha de fundo, deitados ao longo de Z. 
        // Cada modelo tem nominalmente 1.8m.
        let pZ = startZ + (i * 1.8);
        p.model.position.set(goalX, 0, pZ);
        
        // Rodar para que fiquem deitados (Y vira Z)
        p.model.rotation.x = Math.PI / 2;
        
        Match.scene.add(p.model);
    }
}
