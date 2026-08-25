/*
OS ÁRBITROS NA VISTA TÁCTICA.

De 40 m de altura o boneco lê-se mal, e os vinte e dois jogadores já aparecem
como discos (ver `vistaTatica` em player.js). O árbitro e os dois assistentes
ficavam a ser os únicos bonecos no meio dos discos — liam-se como uma coisa
diferente do que são. Agora têm disco próprio: preto com linhas amarelas, `R`
para o árbitro e `A` para os assistentes.

O que este teste fixa é a TROCA — boneco numa vista, disco na outra, nunca os
dois nem nenhum — porque é aí que estas coisas costumam falhar em silêncio: um
disco que fica ligado por cima do boneco só se vê no ecrã.

O desenho do canvas não é testado aqui: precisaria de um contexto 2D a sério,
que o jsdom não dá. O que se verifica é o contrato à volta dele.

Corre com: node tests/arbitro_disco_tatico.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const src = semCR(fs.readFileSync(path.join(raiz, 'js', 'officials.js'), 'utf8'));

function extrairMetodo(nome) {
    const cabeca = `    ${nome}: function (`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(nome + ' não encontrado no js/officials.js');
    const fim = src.indexOf(LF + '    },', ini);
    return src.slice(src.indexOf(') {', ini) + 3, fim);
}
function extrairObjecto(nome) {
    const ini = src.indexOf(`const ${nome} = {`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function(`${src.slice(ini, fim + 3)}; return ${nome};`)();
}

const RefereeModel = extrairObjecto('RefereeModel');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/* ===================================================================== */
console.log(LF + '1 — as cores e o tamanho do disco');
{
    for (const k of ['discoRaio', 'discoFundo', 'discoLinha']) {
        if (RefereeModel[k] === undefined) erro(`falta RefereeModel.${k}`);
    }
    if (!falhas) ok(`raio ${RefereeModel.discoRaio}, fundo ${RefereeModel.discoFundo}, linha ${RefereeModel.discoLinha}`);

    /*
    O MESMO raio do disco dos jogadores. De cima, um disco mais pequeno lia-se
    como estando mais longe — a vista é ortogonal ao campo e o tamanho é a
    única pista de escala que resta. Lido do player.js e não copiado: se um dos
    dois mudar, isto tem de dar erro em vez de divergirem em silêncio.
    */
    const srcPlayer = semCR(fs.readFileSync(path.join(raiz, 'js', 'player.js'), 'utf8'));
    const raioJogador = parseFloat(srcPlayer.match(/CircleGeometry\((\d*\.?\d+),/)[1]);
    if (RefereeModel.discoRaio !== raioJogador) {
        erro(`o disco do árbitro (${RefereeModel.discoRaio}) devia ter o mesmo raio do jogador (${raioJogador})`);
    } else ok(`${RefereeModel.discoRaio} — igual ao do jogador`);
}

console.log(LF + '2 — as etiquetas R e A');
{
    if (!/criarOficial\(scene, 0, 'R'\)/.test(src)) erro("o árbitro devia levar a etiqueta 'R'");
    else ok("árbitro: 'R'");

    const assistentes = src.match(/criarOficial\(scene, [12], 'A'\)/g) || [];
    if (assistentes.length !== 2) erro(`os dois assistentes deviam levar 'A', encontrados ${assistentes.length}`);
    else ok("assistentes: 'A' nos dois");
}

/*
A TROCA. `atualizarVista` é extraída e corrida contra oficiais falsos — só lê
`window.cameraMode`, o `_ativo` e as posições.
*/
console.log(LF + '3 — boneco numa vista, disco na outra');
{
    const corpo = extrairMetodo('atualizarVista');
    const janela = {};
    const atualizarVista = new Function('window', `return function () {${corpo}};`)(janela);

    const oficial = (x, z) => ({
        model: { visible: true, position: { x, y: 0, z } },
        disco: { visible: false, position: { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } } }
    });

    const cenario = (modo, ativo) => {
        const ctx = {
            _ativo: ativo,
            arbitro: oficial(1, 2),
            assistentes: [oficial(3, 4), oficial(5, 6)]
        };
        janela.cameraMode = modo;
        atualizarVista.call(ctx);
        return ctx;
    };

    // Vista táctica: só discos.
    {
        const c = cenario('topdown', true);
        const todos = [c.arbitro].concat(c.assistentes);
        if (todos.some(o => o.model.visible)) erro('na vista táctica o boneco tinha de estar escondido');
        else if (!todos.every(o => o.disco.visible)) erro('na vista táctica o disco tinha de aparecer');
        else ok('topdown: três discos, zero bonecos');

        // E pousados no relvado, na posição do oficial.
        if (c.arbitro.disco.position.x !== 1 || c.arbitro.disco.position.z !== 2) {
            erro('o disco não seguiu a posição do árbitro');
        } else if (c.arbitro.disco.position.y !== 0.04) {
            erro(`o disco devia ficar pousado no relvado (y=0.04), está em ${c.arbitro.disco.position.y}`);
        } else ok('o disco segue o oficial, pousado no relvado');
    }

    // Qualquer outra câmara: só bonecos.
    for (const modo of ['lateraltv', 'orbit', undefined]) {
        const c = cenario(modo, true);
        const todos = [c.arbitro].concat(c.assistentes);
        if (!todos.every(o => o.model.visible)) erro(`em ${modo} o boneco tinha de aparecer`);
        if (todos.some(o => o.disco.visible)) erro(`em ${modo} o disco tinha de estar escondido`);
    }
    ok('nas outras câmaras: três bonecos, zero discos');

    /*
    E o interruptor do painel manda sobre os dois. Um disco esquecido ligado
    depois de se esconderem os árbitros era exactamente o tipo de coisa que só
    se descobre a olhar para o ecrã.
    */
    for (const modo of ['topdown', 'lateraltv']) {
        const c = cenario(modo, false);
        const todos = [c.arbitro].concat(c.assistentes);
        if (todos.some(o => o.model.visible || o.disco.visible)) {
            erro(`árbitros desligados em ${modo}: ficou alguma coisa visível`);
        }
    }
    ok('com os árbitros desligados não fica boneco nem disco');
}

console.log(LF + (falhas === 0
    ? 'arbitro_disco_tatico: tudo bem.'
    : `arbitro_disco_tatico: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
