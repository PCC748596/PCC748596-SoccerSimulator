const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

const target = `    // 3. Voltar com a bola e esperar (Giro de 180 graus).
    // O utilizador pediu para limitar os giros de 180 graus se não estiverem marcados por trás.
    if (escolha && escolha.mate) {
        let marcadoPorTras = false;
        const allOpps = (p.team === 'TeamA') ? Match.opponents : Match.players;
        for (const o of allOpps) {
            if (o.role === 'gk') continue;
            // Distância curta de pressão
            if (p.model.position.distanceToSq(o.model.position) < 12.25) { 
                // Z-diff em relação ao sentido de ataque. dz < 0 significa que o adversário está nas costas (lado do próprio meio-campo)
                const dz = (o.model.position.z - p.model.position.z) * p.dirZ;
                if (dz < -0.2) {
                    marcadoPorTras = true;
                    break;
                }
            }
        }

        // Se estiver marcado por trás, recua com a bola (giro de 180). Caso contrário, não faz o giro e segue para a opção abaixo.
        if (marcadoPorTras) {
            p.carryRecuo = true;
            p.apoioAtivo = false;
            p.fsm.changeState('CARRY');
            return;
        }
    }`;

const replacement = `    // 3. Voltar com a bola e esperar (Giro de 180 graus).
    // O utilizador pediu para limitar os giros de 180 graus.
    // Só fazemos o recuo com bola se estivermos efetivamente bloqueados pela frente
    // e NÃO estivermos marcados por trás (para não correr contra o defesa de trás).
    if (escolha && escolha.mate) {
        let marcadoPelaFrente = false;
        let marcadoPorTras = false;
        const allOpps = (p.team === 'TeamA') ? Match.opponents : Match.players;
        for (const o of allOpps) {
            if (o.role === 'gk') continue;
            if (p.model.position.distanceToSq(o.model.position) < 12.25) { 
                const dz = (o.model.position.z - p.model.position.z) * p.dirZ;
                if (dz > 0.2) marcadoPelaFrente = true;
                if (dz < -0.2) marcadoPorTras = true;
            }
        }

        if (marcadoPelaFrente && !marcadoPorTras) {
            p.carryRecuo = true;
            p.apoioAtivo = false;
            p.fsm.changeState('CARRY');
            return;
        }
    }`;

code = code.replace(target, replacement);
fs.writeFileSync('js/bt/player_bt.js', code);
console.log("Patched!");
