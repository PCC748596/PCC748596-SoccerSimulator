/*
Gera data/player_skills.json uma vez — não é chamado durante o jogo. Os 22
jogadores (11 por equipa, ordem igual ao índice usado em Match.createTeams,
posições da formação 4-4-2 por omissão) ficam com valores fixos gravados no
ficheiro, para não mudar a cada arranque da página.

Uso: node tools/gen_player_skills.js
*/
const fs = require('fs');
const path = require('path');

// Posições na mesma ordem de índice que FormationsData['442'] em js/config.js.
const POSICOES = [
    { pos: 'GK', role: 'gk' },
    { pos: 'RB', role: 'def' },
    { pos: 'CB', role: 'def' },
    { pos: 'CB', role: 'def' },
    { pos: 'LB', role: 'def' },
    { pos: 'RM', role: 'mid' },
    { pos: 'CM', role: 'mid' },
    { pos: 'CM', role: 'mid' },
    { pos: 'LM', role: 'mid' },
    { pos: 'CF', role: 'atk' },
    { pos: 'CF', role: 'atk' }
];

// Deslocamentos por papel (soma ~0 ao longo das 9 skills, para a média
// ficar perto do valor do painel da esquerda mesmo com a variação por papel).
const SHIFTS = {
    gk: { stamina: -2, gk: 24, tec: -6, marking: -14, speed: -12, strength: 4, pass: -6, intercept: 12, tacticknow: 0 },
    def: { stamina: 2, gk: -8, tec: -6, marking: 16, speed: -4, strength: 8, pass: -8, intercept: 0, tacticknow: 4 },
    mid: { stamina: 6, gk: -8, tec: 8, marking: -2, speed: 0, strength: -4, pass: 8, intercept: -8, tacticknow: 6 },
    atk: { stamina: -4, gk: -8, tec: 6, marking: -12, speed: 10, strength: -2, pass: 4, intercept: 6, tacticknow: -6 }
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, Math.round(v))); }

// Ruído pseudo-aleatório com seed fixa (mulberry32) — reprodutível: correr o
// script de novo dá sempre os mesmos números, não é preciso guardar output
// à parte além do próprio JSON.
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rng = mulberry32(20260814);

/*
GERADOR SEPARADO PARA O `tacticKnow`, e a razão é prática: o `rng` acima é
consumido em sequência, portanto acrescentar mais uma chamada por jogador
deslocava tudo o que vem a seguir — medido, mudavam 201 das 286 skills já
geradas, e o RB Blue passava de speed 85 para 72.

Acrescentar uma skill não pode reescrever as outras oito: invalidaria a
comparação com todos os relatórios de simulação anteriores. Com uma semente
própria, a sequência do `rng` fica exactamente como estava.
*/
const rngTactic = mulberry32(20260825);
const usedIds = new Set();

function novoId() {
    let id;
    do { id = 10000 + Math.floor(rng() * 90000); } while (usedIds.has(id));
    usedIds.add(id);
    return id;
}

function gerarJogador(pos, role, cor, contadorPos) {
    const base = 80; // âncora = valor por omissão dos sliders do painel esquerdo
    const shift = SHIFTS[role];
    const ruido = () => (rng() + rng() + rng() - 1.5) * 12; // ~[-18, 18], centrado em 0
    // O do tacticKnow vem do gerador próprio (ver rngTactic).
    const ruidoTactic = () => (rngTactic() + rngTactic() + rngTactic() - 1.5) * 12;

    const skills = {
        stamina: clamp(base + shift.stamina + ruido(), 50, 100),
        gk: clamp(base + shift.gk + ruido(), 50, 100),
        tec: clamp(base + shift.tec + ruido(), 50, 100),
        marking: clamp(base + shift.marking + ruido(), 50, 100),
        speed: clamp(base + shift.speed + ruido(), 50, 100),
        strength: clamp(base + shift.strength + ruido(), 50, 100),
        pass: clamp(base + shift.pass + ruido(), 50, 100),
        intercept: clamp(base + shift.intercept + ruido(), 50, 100),
        /*
        TACTIC KNOW — leitura de jogo.

        A chave é `tacticknow`, tudo minúsculo, e não `tacticKnow`: o
        `skillFor` do js/player.js faz `toLowerCase()` na procura, portanto
        uma chave em camelCase NUNCA seria encontrada — devolvia o valor por
        omissão em silêncio, e o skill parecia estar a funcionar sem estar. Quanto o jogador ocupa MESMO a posição
        que o plano colectivo lhe pede: com 100 fica onde o bloco manda, com
        50 anda uns metros ao lado sem dar por isso.

        É a única skill que descreve a CABEÇA do jogador — as outras sete são
        corpo e técnica. É dela que sai o erro de posicionamento e, por
        consequência, o fora-de-jogo: um avançado que lê mal a última linha
        ultrapassa-a.

        Os deslocamentos por papel dizem quem costuma ler melhor: médios e
        centrais vivem de posicionamento, avançados jogam mais no instinto e
        são os que mais caem em fora-de-jogo. O guarda-redes fica neutro — o
        posicionamento dele tem código próprio e não passa por aqui.
        */
        tacticknow: clamp(base + shift.tacticknow + ruidoTactic(), 50, 100)
    };

    contadorPos.usados[pos] = (contadorPos.usados[pos] || 0) + 1;
    const nomePos = contadorPos.total[pos] > 1 ? `${pos}(${contadorPos.usados[pos]})` : pos;

    return {
        nome: `${nomePos} ${cor}`,
        id: novoId(),
        role: role,
        pos: pos,
        fitness: clamp(80 + rng() * 20, 80, 100),
        ...skills
    };
}

function gerarEquipa(cor) {
    const total = {};
    POSICOES.forEach(p => { total[p.pos] = (total[p.pos] || 0) + 1; });
    const contador = { total: total, usados: {} };
    return POSICOES.map(p => gerarJogador(p.pos, p.role, cor, contador));
}

const data = {
    _gerado: 'tools/gen_player_skills.js — não editar à mão o array, mexer no script e correr de novo',
    teamA: gerarEquipa('Blue'),
    teamB: gerarEquipa('Red')
};

const outPath = path.join(__dirname, '..', 'data', 'player_skills.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
console.log('Escrito', outPath);

/*
Wrapper .js com os MESMOS dados, carregado por <script src="..."> em
index.html — evita fetch() do .json, que falha se o jogo for aberto direto
como ficheiro (file://) em vez de pelo dev-server (mesmo motivo do
assets/ball_mesh.js, ver tools/obj2js.js). O .json fica como fonte legível/
editável; o .js é só o que o browser carrega mesmo.
*/
const outJsPath = path.join(__dirname, '..', 'data', 'player_skills.js');
fs.writeFileSync(outJsPath, 'const PlayerSkillsData = ' + JSON.stringify(data, null, 2) + ';\n');
console.log('Escrito', outJsPath);
