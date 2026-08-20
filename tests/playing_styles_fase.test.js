/*
Os Playing Styles só correm na FASE DE ATAQUE da equipa.

A defender quem manda é a forma colectiva; um estilo a puxar o jogador para
a sua zona preferida enquanto a equipa defende é o que abre buracos.

O resto deste ficheiro testava o roubo da bola por sector, que desapareceu
com o nível 2 (TacklingAI).
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const BT = fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8');

test('os Playing Styles só correm na fase de ataque', () => {
    const i = BT.indexOf('PlayingStyleBTs[player.playingStyle]');
    assert.ok(i >= 0);
    const corpo = BT.slice(i - 400, i + 100);
    assert.ok(/emAtaque\s*&&/.test(corpo),
        'o BT do estilo nao esta preso a fase de ataque');
    assert.ok(/isAttacking/.test(corpo), 'emAtaque nao vem do blackboard da equipa');
});
