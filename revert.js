const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

const target = `    // 3. Voltar com a bola e esperar (Giro de 180 graus).
    // Só faz o giro (recuo com bola) se estiver marcado por trás.
    if (escolha && escolha.mate) {
        let marcadoPorTras = false;
        const allOpps = (p.team === 'TeamA') ? Match.opponents : Match.players;
        for (const o of allOpps) {
            if (o.role === 'gk') continue;
            // Verifica se está muito próximo (pressão)
            if (p.model.position.distanceToSq(o.model.position) < 12.25) { // 3.5^2
                // Verifica se está atrás do jogador (costas)
                const dz = (o.model.position.z - p.model.position.z) * p.dirZ;
                if (dz < -0.5) {
                    marcadoPorTras = true;
                    break;
                }
            }
        }

        if (marcadoPorTras) {
            p.carryRecuo = true;
            p.apoioAtivo = false;
            p.fsm.changeState('CARRY');
            return;
        }
        // Se não estiver marcado por trás, ignora o recuo e segue para tentar o passe forçado abaixo.
    }`;

const replacement = `    // 3. Voltar com a bola e esperar.
    if (escolha && escolha.mate) {
        p.carryRecuo = true;
        p.apoioAtivo = false;
        p.fsm.changeState('CARRY');
        return;
    }`;

code = code.replace(target, replacement);
fs.writeFileSync('js/bt/player_bt.js', code);
