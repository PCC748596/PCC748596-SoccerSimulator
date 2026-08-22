import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

const BT = fs.readFileSync('js/bt/player_bt.js', 'utf8');
const MatchCode = fs.readFileSync('js/match.js', 'utf8');
const ConfigCode = fs.readFileSync('js/config.js', 'utf8');

test('torcida está desabilitada na configuração por defeito', () => {
    assert.ok(/enableCrowd:\s*false/.test(ConfigCode), 'enableCrowd devia ser false no Config');
    assert.ok(/Config\.enableCrowd !== false/.test(MatchCode), 'match.js devia respeitar enableCrowd');
});

test('match.js tem suporte para kickoffPendingPassToDef e kickoffTeam', () => {
    assert.ok(MatchCode.includes('kickoffPendingPassToDef: false'), 'Match devia ter kickoffPendingPassToDef');
    assert.ok(MatchCode.includes('this.kickoffPendingPassToDef = true'), 'resetPlay devia ativar kickoffPendingPassToDef');
});

test('player_bt.js contém o nó PasseSaidaDeBola na árvore ComBola', () => {
    assert.ok(BT.includes("seq('PasseSaidaDeBola'"), 'PlayerBT devia ter nó PasseSaidaDeBola');
    assert.ok(BT.includes('encontrarDefesaParaSaida'), 'PlayerBT devia definir encontrarDefesaParaSaida');
    assert.ok(BT.includes('executarPasseSaidaParaDefesas'), 'PlayerBT devia definir executarPasseSaidaParaDefesas');
});

test('o nó PasseSaidaDeBola desativa kickoffPendingPassToDef e liberta o jogo', () => {
    const i = BT.indexOf("seq('PasseSaidaDeBola'");
    const chunk = BT.slice(i, i + 800);
    assert.ok(chunk.includes('Match.kickoffPendingPassToDef = false'), 'devia zerar a flag ao executar o passe');
});
