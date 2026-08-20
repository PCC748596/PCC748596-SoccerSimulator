const fs = require('fs');
let code = fs.readFileSync('js/utils.js', 'utf8');

const target = `function alvoDePasse(p) {
    if (!p || !p.model) return new THREE.Vector3();
    const pos = p.model.position.clone();
    
    // O destino real do passe é a posição atual do jogador somada à antecipação (lead)
    // baseada na velocidade dele, e não o alvo tático (que pode estar a 10m de distância
    // entre dois defesas, resultando num passe para o vazio).
    if (p.velocity && typeof Match !== 'undefined' && Match.ball) {
        const distToBall = pos.distanceTo(Match.ball.position);
        const travelTime = THREE.MathUtils.clamp(distToBall / 11.0, 0.15, 4.5);
        
        const leadX = p.velocity.x * travelTime * 0.75;
        const leadZ = p.velocity.z * travelTime * 0.75;
        
        const leadDist = Math.hypot(leadX, leadZ);
        if (leadDist > 18.0) {
            const k = 18.0 / leadDist;
            pos.x += leadX * k;
            pos.z += leadZ * k;
        } else {
            pos.x += leadX;
            pos.z += leadZ;
        }
    }
    
    return pos;
}`;

const replacement = `function alvoDePasse(p) {
    if (!p || !p.model) return new THREE.Vector3();
    const pos = p.model.position.clone();
    
    if (p.velocity && typeof Match !== 'undefined' && Match.ball) {
        // Interseção matemática entre o deslocamento do jogador e a trajetória da bola.
        const vBall = 14.0; // Velocidade média da bola no passe
        
        const dx = pos.x - Match.ball.position.x;
        const dz = pos.z - Match.ball.position.z;
        
        // p.velocity não deve ser cego (ele pode travar para receber)
        // Usamos um fator amortecedor para ele não correr infinitamente pra fora
        const vx = p.velocity.x * 0.85;
        const vz = p.velocity.z * 0.85;
        
        const a = (vx * vx + vz * vz) - (vBall * vBall);
        const b = 2 * (dx * vx + dz * vz);
        const c = dx * dx + dz * dz;
        
        // a*t^2 + b*t + c = 0
        let t = 0;
        
        if (Math.abs(a) < 0.001) {
            // Se as velocidades forem quase iguais (raro), equação linear
            if (Math.abs(b) > 0.001) t = -c / b;
        } else {
            const delta = b * b - 4 * a * c;
            if (delta >= 0) {
                const t1 = (-b + Math.sqrt(delta)) / (2 * a);
                const t2 = (-b - Math.sqrt(delta)) / (2 * a);
                
                // Queremos o menor tempo positivo
                if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
                else if (t1 > 0) t = t1;
                else if (t2 > 0) t = t2;
            }
        }
        
        // Se a interseção for impossível ou demasiado longa, usamos um teto seguro
        if (t <= 0 || t > 3.0) {
            t = Math.min(Math.sqrt(c) / vBall, 3.0);
        }
        
        pos.x += vx * t;
        pos.z += vz * t;
    }
    
    return pos;
}`;

if (code.includes(target)) {
    fs.writeFileSync('js/utils.js', code.replace(target, replacement));
    console.log("Replaced target in utils.js");
} else {
    console.log("Target not found in utils.js");
}
