/*
Regressão do FINDING 1 da revisão da Task 3:
findPassTarget() tinha uma saída antecipada (`options.length === 0`) que não
escrevia `this.ultimoAlvoPasse`, deixando lá o valor de uma chamada anterior.
Isso faz o consumidor seguinte ler métricas de um passe que já
não é este, em vez dos valores neutros a que tem direito quando não há
candidatos.

js/player.js não tem guarda `module.exports` (não é um dos ficheiros
desenhados para ser testável); é um script
clássico com uma classe grande e muitas dependências globais. Para testar só
o ramo em causa, carregamo-lo com `vm` num contexto mínimo e chamamos
`findPassTarget` num objecto simples via `Object.create(prototype)`, sem
passar pelo construtor (que precisa de CAMPO_COMP, buildBody(), etc., que não
interessam aqui).
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function vec(x, y, z) {
    return {
        x: x, y: y, z: z,
        distanceTo: function (o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
    };
}

function carregarFootballPlayer() {
    const src = fs.readFileSync(path.join(__dirname, '../js/player.js'), 'utf8');
    const sandbox = {
        console,
        Match: { players: [], opponents: [] },
        alvoDePasse: (p) => p.model.position
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: 'player.js' });
    // `class FootballPlayer` fica na lexical scope do contexto, não em
    // `sandbox` — expô-la explicitamente para a podermos usar cá fora.
    vm.runInContext('this.FootballPlayer = FootballPlayer;', sandbox);
    return { FootballPlayer: sandbox.FootballPlayer, Match: sandbox.Match };
}

test('findPassTarget limpa ultimoAlvoPasse quando não há opções (saída antecipada)', () => {
    const { FootballPlayer, Match } = carregarFootballPlayer();

    const p = Object.create(FootballPlayer.prototype);
    p.id = 1;
    p.team = 'TeamA';
    p.dirZ = 1;
    p.model = { position: vec(0, 0, 0) };
    // Valor de uma chamada anterior — é isto que tem de ser limpo.
    p.ultimoAlvoPasse = { player: { id: 99 }, nota: 999, progressao: 99, folga: 99 };

    // Único jogador da equipa é ele próprio -> options.length === 0.
    Match.players = [p];
    Match.opponents = [];

    const resultado = p.findPassTarget();

    assert.strictEqual(resultado, null);
    assert.strictEqual(p.ultimoAlvoPasse, null,
        'ultimoAlvoPasse devia ficar null, não o valor da chamada anterior');
});
