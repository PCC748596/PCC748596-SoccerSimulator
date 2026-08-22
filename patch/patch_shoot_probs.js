const fs = require('fs');

let fsmCode = fs.readFileSync('js/fsm.js', 'utf8');

const oldShootBlock = `                        if (bloqueado) {
                            // Bola desviada, curta e fraca — não mira a baliza.
                            pow = 4.0 + Math.random() * 2.4;
                            alvoX = p.model.position.x + (Math.random() - 0.5) * 4.0;
                            alvoY = 0.3;
                        } else {
                            const gkDef = (p.team === 'TeamA') ? Match.opponents[0] : Match.players[0];
                            // Na baliza: Técnica (chutador) x GK — vencer põe a bola
                            // perto do poste (ângulo difícil); perder deixa mais central.
                            const venceuGK = gkDef ? venceuDuelo(p.skillFor('TEC'), gkDef.skillFor('GK'), 0.5) : true;
                            const cantoC = venceuGK ? maxC * 0.9 : maxC * 0.5;
                            pow = (22.0 + ((p.skillFor('TEC') - 50) / 50) * 16.0) * 0.8;
                            alvoX = (Math.random() > 0.5 ? 1 : -1) * cantoC;
                            alvoY = Math.random() > 0.5 ? 2.0 : 0.4;
                        }`;

const newShootBlock = `                        let forcedGKDelay = null;
                        if (bloqueado) {
                            // Bola desviada, curta e fraca — não mira a baliza.
                            pow = 4.0 + Math.random() * 2.4;
                            alvoX = p.model.position.x + (Math.random() - 0.5) * 4.0;
                            alvoY = 0.3;
                        } else {
                            const gkDef = (p.team === 'TeamA') ? Match.opponents[0] : Match.players[0];
                            let gkScore = 50; 
                            if (gkDef) {
                                gkScore = gkDef.skillFor('TEC') * 0.30 + gkDef.skillFor('GK') * 0.70;
                            }
                            
                            const chutadorScore = p.skillFor('TEC');
                            const attackRatio = chutadorScore / (chutadorScore + gkScore);
                            
                            const weights = [
                                { outcome: 'GOL', weight: Math.pow(attackRatio, 2) * 100 },
                                { outcome: 'TRAVE_CAMPO', weight: attackRatio * 15 },
                                { outcome: 'TRAVE_FORA', weight: attackRatio * 15 },
                                { outcome: 'TRAVESSAO_CAMPO', weight: attackRatio * 15 },
                                { outcome: 'TRAVESSAO_FORA', weight: attackRatio * 15 },
                                { outcome: 'GOLEIRO_DEFENDE_VOLTA', weight: Math.pow(1 - attackRatio, 2) * 50 },
                                { outcome: 'GOLEIRO_DEFENDE_FORA', weight: Math.pow(1 - attackRatio, 2) * 50 }
                            ];
                            
                            let totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
                            let roll = Math.random() * totalWeight;
                            let selectedOutcome = 'GOLEIRO_DEFENDE_VOLTA';
                            for (let w of weights) {
                                if (roll < w.weight) {
                                    selectedOutcome = w.outcome;
                                    break;
                                }
                                roll -= w.weight;
                            }
                            
                            let sinal = Math.random() > 0.5 ? 1 : -1;
                            pow = (22.0 + ((p.skillFor('TEC') - 50) / 50) * 16.0) * 0.8;
                            
                            switch (selectedOutcome) {
                                case 'GOL':
                                    alvoX = sinal * maxC * 0.9;
                                    alvoY = Math.random() > 0.5 ? 2.0 : 0.4;
                                    forcedGKDelay = 1.0; 
                                    break;
                                case 'TRAVE_CAMPO':
                                    alvoX = sinal * (LARGURA_BALIZA / 2 - 0.08);
                                    alvoY = 0.5;
                                    forcedGKDelay = 1.0;
                                    break;
                                case 'TRAVE_FORA':
                                    alvoX = sinal * (LARGURA_BALIZA / 2 + 0.08);
                                    alvoY = 0.5;
                                    forcedGKDelay = 1.0;
                                    break;
                                case 'TRAVESSAO_CAMPO':
                                    alvoX = (Math.random() - 0.5) * maxC;
                                    alvoY = ALTURA_BALIZA - 0.08;
                                    forcedGKDelay = 1.0;
                                    break;
                                case 'TRAVESSAO_FORA':
                                    alvoX = (Math.random() - 0.5) * maxC;
                                    alvoY = ALTURA_BALIZA + 0.08;
                                    forcedGKDelay = 1.0;
                                    break;
                                case 'GOLEIRO_DEFENDE_VOLTA':
                                    alvoX = (Math.random() - 0.5) * 1.5; 
                                    alvoY = 1.0;
                                    pow *= 0.7; // Reduz um pouco a força pro goleiro ter chance de espalmar pra frente ou encaixar
                                    forcedGKDelay = 0; 
                                    break;
                                case 'GOLEIRO_DEFENDE_FORA':
                                    alvoX = sinal * maxC * 1.05; 
                                    alvoY = 1.0;
                                    forcedGKDelay = 0;
                                    break;
                            }
                        }`;

const oldGkReacao = `                            if (gkDef) {
                                gkDef.gkDelayReacao = 0.45 - ((TeamSkills[defendingTeam].gk - 50) / 50) * 0.35;
                                gkDef.gkReagiu = false;
                            }`;

const newGkReacao = `                            if (gkDef) {
                                gkDef.gkDelayReacao = (forcedGKDelay !== null) ? forcedGKDelay : (0.45 - ((TeamSkills[defendingTeam].gk - 50) / 50) * 0.35);
                                gkDef.gkReagiu = false;
                            }`;

if (fsmCode.includes(oldShootBlock)) {
    fsmCode = fsmCode.replace(oldShootBlock, newShootBlock);
    fsmCode = fsmCode.replace(oldGkReacao, newGkReacao);
    fs.writeFileSync('js/fsm.js', fsmCode);
    console.log('Patched probabilities for SHOOT state!');
} else {
    console.log('Could not find SHOOT block to patch.');
}
