/*
Nas laterais da área o CRUZAMENTO tem de ganhar ao passe e ao lançamento
rasteiro.

Os bónus do `CrossModel` já empurravam o cruzamento para cima nessa zona, mas
isso sozinho não decide nada: a escolha não é entre cruzar e não fazer nada, é
entre cruzar e PASSAR — e a nota do passe não sabia que o passador estava na
ala junto à área.

O que se mede aqui é a `zonaLateralDaArea` (a rampa) e o efeito dela nas duas
notas, com as constantes lidas do config.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));
const srcConfig = ler('js/config/shooting.js') + '\n' + ler('js/config/defense.js');
const srcUtils = ler('js/utils.js');
const srcPlayer = ler('js/player.js');
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

const CrossModel = extrairObjecto(srcConfig, 'CrossModel');
const zonaLateralDaArea = new Function('CrossModel', 'Math',
    `${extrairFuncao(srcUtils, 'zonaLateralDaArea')}; return zonaLateralDaArea;`)(CrossModel, Math);

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

/*
1 — a zona é uma RAMPA, não um degrau: um corte binário faz o jogador mudar de
ideias de um frame para o outro ao atravessar a fronteira.
*/
console.log(`zona lateral da área (alaX ${CrossModel.alaX}, zonaZ ${CrossModel.zonaZ}, ` +
    `fundoZ ${CrossModel.fundoZ})`);
console.log('     x \\ zDir     15      25      35      45      50');
for (const x of [10, 16, 20, 25, 28]) {
    const linha = [15, 25, 35, 45, 50].map(z =>
        zonaLateralDaArea(x, z).toFixed(2).padStart(7)).join('');
    console.log(`  ${String(x).padStart(6)} m ${linha}`);
}

// Fora da ala e fora do terço: zero.
for (const [x, z] of [[10, 45], [25, 10], [0, 50], [5, 30]]) {
    if (zonaLateralDaArea(x, z) !== 0) erro(`(${x}, ${z}) devia estar fora da zona`);
}
// Encostado à linha e junto ao fundo: cheio.
if (zonaLateralDaArea(30, 55) < 0.99) erro('encostado à linha e ao fundo devia dar 1.00');
// Simétrico em x.
for (const z of [25, 40]) for (const x of [18, 24]) {
    if (Math.abs(zonaLateralDaArea(x, z) - zonaLateralDaArea(-x, z)) > 1e-9) {
        erro(`a zona não é simétrica em x (${x}, ${z})`);
    }
}
// Monótona nos dois eixos.
{
    let mau = 0, ant = -1;
    for (const x of [15, 18, 21, 24, 27, 30]) {
        const v = zonaLateralDaArea(x, 45);
        if (v < ant - 1e-9) mau++;
        ant = v;
    }
    ant = -1;
    for (const z of [20, 28, 36, 44, 50]) {
        const v = zonaLateralDaArea(26, z);
        if (v < ant - 1e-9) mau++;
        ant = v;
    }
    if (mau) erro('a zona não é monótona');
    else console.log('  rampa monótona e simétrica, 0 fora da ala/terço');
}

/*
2 — a penalização do passe e do lançamento existe e o lançamento leva MAIS.
Dali um lançamento rasteiro é a pior das três opções: atravessa a defesa toda
junto ao chão, no sítio onde ela está mais junta.
*/
{
    const pP = CrossModel.penalPasseRasteiro;
    const pL = CrossModel.penalLancamentoRasteiro;
    console.log(`\npenalização na zona cheia: passe ×${pP}, lançamento rasteiro ×${pL}`);
    if (!(pP > 0 && pP < 1)) erro(`penalPasseRasteiro=${pP} fora de (0,1)`);
    if (!(pL > 0 && pL < 1)) erro(`penalLancamentoRasteiro=${pL} fora de (0,1)`);
    if (!(pL < pP)) {
        erro(`o lançamento rasteiro devia ser MAIS penalizado do que o passe ` +
            `(${pL} não é menor que ${pP})`);
    }
}

/*
3 — o efeito na nota, na rampa. Uma nota de 100 na zona cheia tem de cair para
o valor da penalização, e a meio da rampa para o meio do caminho.
*/
{
    const aplicar = (nota, naAla, cheio) => nota * (1 - (1 - cheio) * naAla);
    console.log('\nnota de passe 100, ao longo da rampa');
    for (const [x, z] of [[16, 25], [20, 35], [24, 42], [28, 50]]) {
        const naAla = zonaLateralDaArea(x, z);
        const n = aplicar(100, naAla, CrossModel.penalPasseRasteiro);
        console.log(`  (${String(x).padStart(2)}, ${String(z).padStart(2)}) zona=${naAla.toFixed(2)} -> nota ${n.toFixed(0)}`);
    }
    const cheia = aplicar(100, 1, CrossModel.penalPasseRasteiro);
    if (Math.abs(cheia - 100 * CrossModel.penalPasseRasteiro) > 1e-9) {
        erro('na zona cheia a nota devia ser exactamente a penalização');
    }
    if (Math.abs(aplicar(100, 0, CrossModel.penalPasseRasteiro) - 100) > 1e-9) {
        erro('fora da zona a nota não pode ser tocada');
    }
}

/*
4 — e os dois consumidores têm mesmo de a aplicar. Sem isto o teste mediria uma
função que ninguém chama, que é o defeito que já apareceu neste projecto com o
`recuoDaUltimaLinha` e o `paresPorPosicao`.
*/
{
    if (!/zonaLateralDaArea/.test(srcPlayer)) {
        erro('js/player.js não aplica a zona na nota do passe');
    } else console.log('\nfindPassTarget aplica a penalização');
    if (!/zonaLateralDaArea/.test(srcBT)) {
        erro('js/bt/player_bt.js não aplica a zona na nota do lançamento');
    } else console.log('findThroughBall aplica a penalização');
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: nas laterais da área o cruzamento ganha ao passe e ao lançamento rasteiro.');
