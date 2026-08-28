/*
De onde é que se remata.

O `shootingRange` é uma distância ao CENTRO DA BALIZA, escalada pela skill e
encolhida fora do eixo. Não cobria a grande área: com a skill de ataque a 50
dá 13.0 m no eixo e a área tem 16.5 m de profundidade, e a 15 m de X sobram
10.2 m quando a baliza está a 15.5. O resultado eram 0-6 remates por jogo.

Este teste corre o `emZonaDeRemate` do js/bt/player_bt.js a sério, sobre uma
grelha de posições, e conta de quantas se remata — dentro e fora da área.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));
const srcConfig = ler('js/config/shooting.js') + '\n' + ler('js/config/physics.js');
const srcBT = ler('js/bt/player_bt.js');

function extrairObjecto(src, nome) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function('Math', `${src.slice(ini, fim + 3)}; return ${nome};`)(Math);
}
function extrairFuncao(src, nome) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const ShootingModel = extrairObjecto(srcConfig, 'ShootingModel');
const CAMPO_COMP = 106;

// Vector3 mínimo, só com o que o emZonaDeRemate usa.
const _v1 = {
    x: 0, y: 0, z: 0,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
};
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const emZonaDeRemate = new Function('ShootingModel', '_v1', 'SpatialGrid',
    `${extrairFuncao(srcBT, 'emZonaDeRemate')}; return emZonaDeRemate;`
)(ShootingModel, _v1, undefined);

/*
Jogador de teste. `targetGoalZ` é a baliza atacada; a distância é medida em 3D
contra `_v1`, portanto o modelo precisa de um `distanceTo`.
*/
function jogador(x, distFundo, skillAta, role) {
    const targetGoalZ = CAMPO_COMP / 2;
    const z = targetGoalZ - distFundo;
    return {
        role: role || 'ata',
        team: 'TeamA',
        targetGoalZ,
        model: { position: { x, y: 0, z, distanceTo: (o) => dist3({ x, y: 0, z }, o) } },
        // O alcance real, copiado do player.js shootingRange().
        shootingRange() {
            const base = ShootingModel.baseRange + (skillAta / 100) * ShootingModel.skillRange;
            const centralidade = 1 - Math.min(1, Math.abs(x) / ShootingModel.maxOffsetX);
            const porFuncao = (this.role === 'def') ? ShootingModel.defenderFactor : 1.0;
            return base * porFuncao *
                (ShootingModel.angleFloor + (1 - ShootingModel.angleFloor) * centralidade);
        }
    };
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

const A = ShootingModel.dentroDaArea;
if (!A) { erro('ShootingModel.dentroDaArea desapareceu'); process.exit(1); }

/*
1 — DENTRO DA ÁREA remata-se de todo o lado.
*/
{
    const xs = [0, 5, 10, 15, 19];
    const ds = [2, 5, 8, 12, 16];
    console.log(`dentro da grande área (${A.profundidade} m de fundo, ` +
        `${A.meiaLargura} m de meia-largura), skill ata 50`);
    console.log('  distFundo \\ x     0      5     10     15     19');

    let total = 0, remata = 0;
    for (const d of ds) {
        const celulas = xs.map(x => {
            const p = jogador(x, d, 50, 'ata');
            const ok = emZonaDeRemate({ p, zoneAhead: 40 });
            total++; if (ok) remata++;
            return (ok ? 'sim' : 'NÃO').padStart(7);
        });
        console.log(`  ${String(d).padStart(8)} m ${celulas.join('')}`);
    }
    console.log(`  remata em ${remata}/${total} posições (${(100 * remata / total).toFixed(0)}%)`);
    if (remata !== total) {
        erro(`dentro da área devia rematar de todas as ${total} posições, remata de ${remata}`);
    }
}

/*
2 — e com qualquer skill e qualquer função. Dentro da área o alcance não decide.
*/
{
    let maus = 0;
    for (const skill of [10, 30, 50, 70, 95]) {
        for (const role of ['ata', 'mid', 'def']) {
            const p = jogador(14, 15, skill, role);   // entrada da área, fora do eixo
            if (!emZonaDeRemate({ p, zoneAhead: 40 })) {
                erro(`skill ${skill}, ${role}: não remata da entrada da área`);
                maus++;
            }
        }
    }
    if (!maus) console.log('  e de qualquer skill (10 a 95) e função (ata/mid/def)');
}

/*
3 — FORA da área continua a mandar o alcance. A mudança não pode transformar
isto num jogo de remates do meio-campo.
*/
{
    console.log('\nfora da área — manda o alcance por skill, como sempre');
    const casos = [
        { x: 0, d: 20, skill: 50, esperado: false, nome: 'eixo a 20 m, skill 50' },
        { x: 0, d: 20, skill: 95, esperado: false, nome: 'eixo a 20 m, skill 95' },
        { x: 0, d: 17, skill: 95, esperado: true, nome: 'eixo a 17 m, skill 95' },
        { x: 30, d: 10, skill: 95, esperado: false, nome: 'x=30 (fora da área), skill 95' },
        { x: 0, d: 45, skill: 95, esperado: false, nome: 'meio-campo, skill 95' }
    ];
    for (const c of casos) {
        const p = jogador(c.x, c.d, c.skill, 'ata');
        const zoneAhead = Math.max(0, 53 - c.d);
        const ok = emZonaDeRemate({ p, zoneAhead });
        console.log(`  ${c.nome.padEnd(32)} -> ${ok ? 'remata' : 'não remata'}` +
            `${ok === c.esperado ? '' : '   X'}`);
        if (ok !== c.esperado) {
            erro(`${c.nome}: esperado ${c.esperado ? 'rematar' : 'não rematar'}`);
        }
    }
}

/*
4 — a fronteira da área é mesmo a fronteira: um passo lá para fora e volta a
mandar o alcance.
*/
{
    const dentro = jogador(19.5, 16.0, 40, 'ata');
    const fora = jogador(21.0, 16.0, 40, 'ata');
    const a = emZonaDeRemate({ p: dentro, zoneAhead: 40 });
    const b = emZonaDeRemate({ p: fora, zoneAhead: 40 });
    console.log(`\nfronteira: x=19.5 (dentro) -> ${a ? 'remata' : 'não'}; ` +
        `x=21.0 (fora) -> ${b ? 'remata' : 'não'}`);
    if (!a) erro('x=19.5 está dentro da área e devia rematar');
    if (b) erro('x=21.0 está fora da área e não devia rematar a essa distância');
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: dentro da área remata-se sempre; fora dela manda o alcance.');
