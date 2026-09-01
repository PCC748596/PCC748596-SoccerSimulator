/*
MULTIBOLA — bolas de reserva em cones à volta do campo (js/multiball.js).

Pedido: as bolas ficam fora do campo, como num estádio; a bola que sai fica
onde caiu e desaparece 3 s depois; quem vai bater o lateral, o canto ou o tiro
de meta vai buscar a mais perto, leva-a à marca e repõe o jogo — sem parar o
jogo, e sem o batedor aparecer teleportado na posição.

Este teste corre o módulo a sério (com uma cena falsa) e verifica o
encaminhamento nos três lances.

Corre com: node --test tests/multibola.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcMulti = semCR(fs.readFileSync(path.join(raiz, 'js', 'multiball.js'), 'utf8'));
const srcSet = semCR(fs.readFileSync(path.join(raiz, 'js', 'match', 'match_setpieces.js'), 'utf8'));
const srcLoop = semCR(fs.readFileSync(path.join(raiz, 'js', 'match', 'match_loop.js'), 'utf8'));
const srcTac = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'tactics.js'), 'utf8'));

const CAMPO_LARG = 68, CAMPO_COMP = 106, LARGURA_BALIZA = 7.32;
const BallPhysics = { raio: 0.11, gravidade: 9.81 };

// Cena e geometrias de mentira: só interessa a contabilidade das reservas.
const malha = () => ({ position: { set: function (x, y, z) { this.x = x; this.y = y; this.z = z; } }, visible: true });
const THREE = {
    SphereGeometry: function () { }, ConeGeometry: function () { },
    MeshLambertMaterial: function () { },
    Mesh: function () { return malha(); }
};
const cena = { objectos: [], add(o) { this.objectos.push(o); }, remove(o) { this.objectos.splice(this.objectos.indexOf(o), 1); } };

const api = new Function('THREE', 'CAMPO_LARG', 'CAMPO_COMP', 'LARGURA_BALIZA', 'BallPhysics',
    srcMulti + LF + 'return { MultiBall, MultiBallModel };'
)(THREE, CAMPO_LARG, CAMPO_COMP, LARGURA_BALIZA, BallPhysics);
const { MultiBall, MultiBallModel } = api;

test('as bolas de reserva ficam FORA das linhas', () => {
    MultiBall.init(cena);
    assert.ok(MultiBall.reservas.length >= 12,
        `só ${MultiBall.reservas.length} reservas: um estádio tem mais bolas do que isso`);
    MultiBall.reservas.forEach(r => {
        const foraLateral = Math.abs(r.x) > CAMPO_LARG / 2;
        const foraFundo = Math.abs(r.z) > CAMPO_COMP / 2;
        assert.ok(foraLateral || foraFundo,
            `reserva dentro do campo em (${r.x.toFixed(1)}, ${r.z.toFixed(1)})`);
    });
    // Nenhuma atrás da baliza, no sítio onde a baliza está.
    MultiBall.reservas.forEach(r => {
        if (Math.abs(r.z) <= CAMPO_COMP / 2) return;
        assert.ok(Math.abs(r.x) > LARGURA_BALIZA / 2,
            `reserva em cima da baliza, x=${r.x.toFixed(1)}`);
    });
});

test('a mais próxima é mesmo a mais próxima, e só conta as livres', () => {
    MultiBall.init(cena);
    const alvo = { x: CAMPO_LARG / 2, z: 10 };
    const primeira = MultiBall.maisProxima(alvo.x, alvo.z);
    assert.ok(primeira, 'não há reservas livres logo no início');

    const d = r => Math.hypot(r.x - alvo.x, r.z - alvo.z);
    MultiBall.reservas.forEach(r => {
        assert.ok(d(primeira) <= d(r) + 1e-9, 'há uma reserva mais perto que a escolhida');
    });

    MultiBall.retirar(primeira);
    const segunda = MultiBall.maisProxima(alvo.x, alvo.z);
    assert.notStrictEqual(segunda, primeira, 'uma reserva já usada voltou a ser escolhida');
    assert.strictEqual(primeira.mesh.visible, false, 'a bola continua em cima do cone depois de retirada');
});

test('a reserva usada volta ao cone sozinha', () => {
    MultiBall.init(cena);
    const r = MultiBall.maisProxima(0, 60);
    MultiBall.retirar(r);
    assert.strictEqual(r.disponivel, false);
    MultiBall.update(MultiBallModel.prazoRegresso + 0.1);
    assert.strictEqual(r.disponivel, true, 'a reserva nunca mais voltaria ao cone');
    assert.strictEqual(r.mesh.visible, true);
});

test('a bola que saiu continua o movimento e só depois desaparece', () => {
    /*
    Pedido: *"a bola que tá saindo pelo lateral, linha de fundo, etc, pode
    continuar com o movimento normal, não precisa parar em cima da linha"*.
    Os 3 s contam a partir do momento em que ela PÁRA — uma bola que sai a
    20 m/s ainda tem campo fora para percorrer.
    */
    MultiBall.init(cena);
    assert.strictEqual(MultiBallModel.prazoBolaMorta, 3.0, 'o prazo pedido era 3 s');
    const antes = cena.objectos.length;

    // Parada à partida: os 3 s começam já. (Passos de 1/60 s, como no jogo —
    // a integração é a mesma e não faz sentido testá-la com passos de 3 s.)
    const passo = () => MultiBall.update(1 / 60);
    MultiBall.largarBolaMorta({ x: 10, y: 0.11, z: 20 }, { x: 0, y: 0, z: 0 });
    assert.strictEqual(cena.objectos.length, antes + 1, 'a bola morta não foi para a cena');
    for (let i = 0; i < 170; i++) passo();          // 2,83 s
    assert.strictEqual(cena.objectos.length, antes + 1, 'desapareceu antes dos 3 s');
    for (let i = 0; i < 20; i++) passo();           // 3,16 s
    assert.strictEqual(cena.objectos.length, antes, 'não desapareceu aos 3 s');

    // A rolar: aos 3 s ainda lá está, porque ainda não parou.
    const m = MultiBall.largarBolaMorta({ x: 0, y: 0.11, z: 0 }, { x: 12, y: 0, z: 0 });
    const bola = cena.objectos[cena.objectos.length - 1];
    const x0 = bola.position.x;
    for (let i = 0; i < 180; i++) MultiBall.update(1 / 60);   // 3 s
    assert.strictEqual(cena.objectos.length, antes + 1,
        'a bola desapareceu enquanto ainda rolava');
    assert.ok(bola.position.x > x0 + 3,
        `andou só ${(bola.position.x - x0).toFixed(1)} m: parou em cima da linha`);

    // Deixa-a parar e conta os 3 s.
    for (let i = 0; i < 60 * 12; i++) MultiBall.update(1 / 60);
    assert.strictEqual(cena.objectos.length, antes, 'nunca chegou a desaparecer');
});

test('as bolas de reserva são iguais às do jogo', () => {
    /*
    Pedido: *"as bolas fora do campo têm que ser iguais às bolas do jogo"*.
    Quem as cria é o `Match.criarBola`, o mesmo do jogo (a malha do
    assets/Ball.obj). Sem Match — como neste teste — cai numa esfera lisa.
    */
    const srcM = semCR(fs.readFileSync(path.join(raiz, 'js', 'multiball.js'), 'utf8'));
    assert.ok(srcM.includes('Match.criarBola'),
        'as reservas voltaram a ser esferas próprias, diferentes da bola do jogo');
    assert.ok(srcM.includes('_novaBola'),
        'a criação da bola de reserva deixou de estar num sítio só');
    // E os cones são pequenos ao pé dela.
    const raioCone = parseFloat(/coneRaio:\s*([\d.]+)/.exec(srcM)[1]);
    assert.ok(raioCone <= 0.16,
        `cone de ${raioCone} m de raio: continua maior do que um cone de treino`);
});

test('os três lances passam pela reposição, e há sempre saída sem reservas', () => {
    ['THROW_IN', 'CORNER_KICK', 'GOAL_KICK'].forEach(tipo => {
        assert.ok(srcSet.includes(`iniciarReposicao(${LF}                '${tipo}'`) ||
            srcSet.includes(`this.iniciarReposicao('${tipo}'`) ||
            srcSet.includes(`'${tipo}', taker`) || srcSet.includes(`'${tipo}', gk`),
            `o lance ${tipo} não usa a bola de reserva`);
    });
    // Sem reservas, cada lance continua a acontecer (o jogo nunca fica preso).
    assert.ok(srcSet.includes('if (taker && !comReserva) assumirLateral(taker);'),
        'o lateral perdeu a saída de recurso');
    assert.ok(srcSet.includes('} else {\n                assumirCanto(taker);'),
        'o canto perdeu a saída de recurso');
    assert.ok(srcSet.includes('assumirTiroMeta(gk);'),
        'o tiro de meta perdeu a saída de recurso');
});

test('o batedor do lateral já não aparece teleportado na linha', () => {
    const ini = srcSet.indexOf("} else if (type === 'THROW_IN') {");
    const corpo = srcSet.slice(ini, srcSet.indexOf('} else if', ini + 10));
    assert.ok(corpo.includes('postoLateral'),
        'o batedor voltou a ser colocado na linha no mesmo frame');
    // A posição regulamentar só é assumida no `assumirLateral`, que é o que
    // corre quando a bola chega lá.
    const iAssumir = corpo.indexOf('const assumirLateral');
    const iPos = corpo.indexOf('t.model.position.set(postoLateral.x');
    assert.ok(iAssumir > 0 && iPos > iAssumir,
        'a colocação na linha saiu de dentro do assumirLateral');
});

test('a reposição corre todos os frames e tem prazo de segurança', () => {
    assert.ok(srcLoop.includes('this.atualizarReposicao(dt)'),
        'a reposição deixou de correr no loop: a bola fica com o batedor para sempre');
    assert.ok(srcLoop.includes('MultiBall.update(dt)'),
        'ninguém conta os 3 s da bola morta');
    assert.ok(/prazo:\s*\d+/.test(srcTac.slice(srcTac.indexOf('SetPieceReposicao'))),
        'a reposição ficou sem prazo de segurança');
});

test('no tiro de meta a área é do guarda-redes', () => {
    /*
    Medido antes das guardas: 1,87 companheiros dentro da própria grande área
    por frame durante o lance (pior caso 4), um a 4,6 m do guarda-redes.
    Depois: 2,1% das leituras.

    As guardas mudaram de sítio quando a equipa que bate passou a ir para as
    posições do TeamBT: deixaram de ser alvos escritos na montagem e passaram a
    ser aplicadas ao SLOT, na camada posicional (team_bt.js). O config é o
    mesmo.
    */
    const srcGk = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'goalkeeper.js'), 'utf8'));
    const srcTeam = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8'));
    assert.ok(/tiroMetaMargemForaDaArea:\s*[\d.]+/.test(srcGk),
        'a margem para fora da área desapareceu do config');
    assert.ok(/tiroMetaCorredorDoChuto:\s*[\d.]+/.test(srcGk),
        'o corredor do chuto desapareceu do config');
    assert.ok(srcTeam.includes('Gk.tiroMetaMargemForaDaArea'),
        'o slot do tiro de meta já não é empurrado para fora da área');
    assert.ok(srcTeam.includes('Gk.tiroMetaCorredorDoChuto'),
        'já ninguém sai da frente de quem vai bater');
});

test('os pontos do minimapa são 70% maiores', () => {
    const srcMini = semCR(fs.readFileSync(path.join(raiz, 'js', 'minimap.js'), 'utf8'));
    const jogador = parseFloat(/raioJogador:\s*([\d.]+)/.exec(srcMini)[1]);
    const bola = parseFloat(/raioBola:\s*([\d.]+)/.exec(srcMini)[1]);
    // Eram 2.6 e 1.8; +70% dá 4.42 e 3.06.
    assert.ok(Math.abs(jogador - 2.6 * 1.7) < 0.15,
        `raioJogador=${jogador}: não são os 70% pedidos sobre 2.6`);
    assert.ok(Math.abs(bola - 1.8 * 1.7) < 0.15,
        `raioBola=${bola}: não são os 70% pedidos sobre 1.8`);
});

test('com o jogo parado ninguém corre atrás da bola', () => {
    /*
    Pedido: *"o jogador que está tentando pegar, depois que a bola sair, tem
    que se posicionar também para o lateral, tiro de meta, etc"*.

    O `pickIntercetor` já tinha a guarda `Match.state !== 'PLAY'`; o
    `pickChaser` não — e com a multibola isso ficou pior, porque a bola do jogo
    passa a acompanhar quem a foi buscar: sem a guarda, meio campo ia atrás
    dela até ao cone.
    */
    const srcTeam = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8'));
    const ini = srcTeam.indexOf('function pickChaser(');
    const corpo = srcTeam.slice(ini, ini + 900);
    assert.ok(corpo.includes("Match.state !== 'PLAY'"),
        'o chaser voltou a ser escolhido com o jogo parado');
    assert.ok(corpo.indexOf("Match.state !== 'PLAY'") < corpo.indexOf('const ballPos'),
        'a guarda tem de vir ANTES de se olhar para a posição da bola');
});

test('a bola do jogo acompanha quem a foi buscar', () => {
    /*
    Ela fica invisível durante a reposição, mas a POSIÇÃO tem de acompanhar: o
    bloco, o guarda-redes e o `Match.ball.position` de meia dúzia de sítios
    leem-na. Deixá-la onde saiu punha o jogo a organizar-se à volta de um ponto
    onde já não há bola nenhuma.
    */
    const srcSet = semCR(fs.readFileSync(path.join(raiz, 'js', 'match', 'match_setpieces.js'), 'utf8'));
    const ini = srcSet.indexOf('iniciarReposicao: function');
    const corpo = srcSet.slice(ini, srcSet.indexOf('atualizarReposicao: function', ini));
    assert.ok(corpo.includes('this.ball.position.set(reserva.x'),
        'a bola do jogo já não vai para o cone quando a reposição começa');
    const corpoAct = srcSet.slice(srcSet.indexOf('atualizarReposicao: function'),
        srcSet.indexOf('_pousarReposicao: function'));
    assert.ok(corpoAct.includes('this.ball.position.set(taker.model.position.x'),
        'a bola do jogo deixou de seguir o batedor enquanto ele a leva');
});

test('com o guarda-redes a segurar, a equipa oferece-se para receber', () => {
    /*
    Relato: *"quando o goleiro segura a bola, o time com a posse não se
    reorganiza em campo para receber os passes"*.

    Medido: **zero jogadores a oferecer-se** em 100% dos frames com o GR a
    segurar (o `atribuirApoiosDaEquipa` saía logo à entrada), a equipa a
    encolher para 36,3 m de largura. Depois: 1,32 apoios por frame e 91% dos
    frames com pelo menos um.

    O motivo do corte original era bom — não se quer o médio dentro da área,
    colado a ele — e mantém-se como FILTRO: nada dentro da própria área, nada a
    menos de `distMinAoGuardaRedes`.
    */
    const srcCfg = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'passing.js'), 'utf8'));
    const srcTeam = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8'));

    assert.ok(/saidaComGuardaRedes:\s*true/.test(srcCfg),
        'a saída a jogar com o guarda-redes está desligada');
    const distMin = parseFloat(/distMinAoGuardaRedes:\s*([\d.]+)/.exec(srcCfg)[1]);
    assert.ok(distMin >= 8 && distMin <= 20,
        `distMinAoGuardaRedes=${distMin}: ou é em cima dele, ou já não é uma opção de passe`);

    const ini = srcTeam.indexOf('function atribuirApoiosDaEquipa(');
    const corpo = srcTeam.slice(ini, srcTeam.indexOf(LF + '}' + LF, ini));
    assert.ok(!/gkHoldingBall\[bb\.team\]\) \{ semApoio\(\); return; \}/.test(corpo),
        'voltou o `return` que deixava o guarda-redes a repor para ninguém');
    assert.ok(corpo.includes('SupportModel.distMinAoGuardaRedes'),
        'os apoios deixaram de ser filtrados por distância ao guarda-redes');
    assert.ok(corpo.includes('Area.contem(e.x, e.z, linhaPropria)'),
        'voltou a haver apoios dentro da própria área com o GR a segurar');
});
