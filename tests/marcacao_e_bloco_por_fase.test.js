/*
A FASE MANDA: quem ataca não marca, e quem defende joga curto.

PORQUE EXISTE. Duas coisas que se viam no ecrã ao mesmo tempo:

1. "Os atacantes continuam a correr atrás dos defensores." A árvore do jogador
   já tinha a guarda certa (`podeMarcar` sai se `bb.isAttacking`), mas a camada
   POSICIONAL não tinha nenhuma: o `atribuirMarcacoesDaEquipa` e o
   `aplicarMarcacaoPosicional` corriam para as duas equipas todos os frames. A
   equipa COM a bola recebia `marcRef` e cada jogador era puxado até 10 m na
   direcção do adversário mais perto do slot — os avançados colavam-se aos
   centrais em vez de procurarem espaço.

2. "O rectângulo do time em Defensive não muda para Small." A fase entrava no
   CENTRO do bloco (o ±5 do targetOffsetZ) mas nunca no COMPRIMENTO: a defender
   desenhava-se o mesmo rectângulo de 50 m que se desenha a atacar. Não havia
   caminho nenhum no código que levasse a `short` por ser fase defensiva — só a
   Mentalidade lá chegava.

Corre com: node tests/marcacao_e_bloco_por_fase.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcTeam = ler('js/bt/team_bt.js');
const srcConfig = ler('js/config.js');

function extrairObjecto(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    const f = src.indexOf(LF + '};', i);
    return new Function(`const CAMPO_COMP = 106;
        ${src.slice(i, f + 3)}; return ${nome};`)();
}

function extrairFuncao(src, nome, preludio) {
    const i = src.indexOf(`function ${nome}(`);
    if (i < 0) throw new Error(`${nome} não encontrada`);
    const f = src.indexOf(LF + '}', i) + 2;
    return new Function(`${preludio || ''}
        ${src.slice(i, f)}; return ${nome};`)();
}

const BlockShape = extrairObjecto(srcConfig, 'BlockShape');
const MarkingModel = extrairObjecto(srcConfig, 'MarkingModel');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/* =====================================================================
   1 — O COMPRIMENTO DO BLOCO POR FASE
   ===================================================================== */
console.log(LF + '1 — a defender o bloco é curto (30 m), a atacar obedece ao painel');
{
    /*
    A escolha do comprimento saiu para uma função própria, e é só isso que
    este teste corre — o computeBlock inteiro precisa do THREE, do Match e da
    bola suavizada, e nada disso muda a decisão que aqui interessa.
    */
    const preludio = `
        let Tatics = { estilo: 'balanceado', lengthCompactness: 'median' };
        let MentalidadeModel = {
            balanceado: {},
            defesa: { profundidade: 'short' },
            muito_ofensiva: {}
        };
        const BlockShape = ${JSON.stringify(BlockShape)};
        const definirTatics = t => { Tatics = t; };
    `;
    const i = srcTeam.indexOf('function escolherProfundidade(');
    if (i < 0) {
        erro('escolherProfundidade não existe — a fase continua sem palavra no comprimento');
    } else {
        const f = srcTeam.indexOf(LF + '}', i) + 2;
        const mod = new Function(`${preludio}
            ${srcTeam.slice(i, f)};
            return { escolherProfundidade, definirTatics };`)();

        const metros = chave => +(BlockShape.profundidade[chave] * 106).toFixed(1);

        // A defender, com o painel no máximo: tem de encurtar na mesma.
        mod.definirTatics({ estilo: 'muito_ofensiva', lengthCompactness: 'large' });
        const aDefender = mod.escolherProfundidade({ isAttacking: false });
        if (aDefender !== 'short') {
            erro(`a defender devia dar 'short', deu ${JSON.stringify(aDefender)}`);
        } else if (Math.abs(metros(aDefender) - 30) > 0.5) {
            erro(`'short' devia dar 30 m, dá ${metros(aDefender)} m`);
        } else ok(`fase Defensive: ${metros(aDefender)} m, mesmo com o painel em Large`);

        // A atacar o painel volta a mandar.
        const aAtacar = mod.escolherProfundidade({ isAttacking: true });
        if (aAtacar !== 'large') {
            erro(`a atacar devia obedecer ao painel ('large'), deu ${JSON.stringify(aAtacar)}`);
        } else ok(`fase Offensive: ${metros(aAtacar)} m, o painel manda`);

        // A atacar, a Mentalidade defensiva continua a ter a última palavra
        // sobre o painel — é a regra antiga e não podia cair aqui.
        mod.definirTatics({ estilo: 'defesa', lengthCompactness: 'large' });
        const mentalAtacar = mod.escolherProfundidade({ isAttacking: true });
        if (mentalAtacar !== 'short') {
            erro(`Mentalidade Defensiva devia impor 'short' a atacar, deu ${JSON.stringify(mentalAtacar)}`);
        } else ok('a atacar: a Mentalidade Defensiva continua a impor 30 m');

        // Uma chave inventada no painel não pode partir o bloco.
        mod.definirTatics({ estilo: 'balanceado', lengthCompactness: 'nao_existe' });
        const invalida = mod.escolherProfundidade({ isAttacking: true });
        if (BlockShape.profundidade[invalida] === undefined) {
            erro(`chave inválida devia cair em 'median', deu ${JSON.stringify(invalida)}`);
        } else ok('chave inválida cai na omissão');
    }
}

/* =====================================================================
   2 — A MARCAÇÃO POSICIONAL SÓ EXISTE A DEFENDER
   ===================================================================== */
console.log(LF + '2 — quem tem a bola não anda atrás de ninguém');
{
    const preludio = `
        const CAMPO_COMP = 106;
        const MarkingModel = ${JSON.stringify(MarkingModel)};
        MarkingModel.biasMaxPara = function () { return 8.0; };
        const Tatics = { pressaoDefensiva: 'balanced' };
        // O ponto de marcação real é o de utils.js; aqui basta saber que foi
        // chamado, porque o que se testa é SE a marcação corre, não onde põe.
        let chamouPonto = false;
        function pontoDeMarcacao(sx, sz, hx, hz, golZ, dist, tecto) {
            chamouPonto = true;
            return { x: hx, z: hz };
        }
        const viuChamada = () => chamouPonto;
        const limparChamada = () => { chamouPonto = false; };
    `;
    const i = srcTeam.indexOf('function aplicarMarcacaoPosicional(');
    const f = srcTeam.indexOf(LF + '}', i) + 2;
    const mod = new Function(`${preludio}
        ${srcTeam.slice(i, f)};
        return { aplicarMarcacaoPosicional, viuChamada, limparChamada };`)();

    const jogador = () => ({
        pos: 'ST', dirZ: 1, ownGoalZ: -53,
        marcRef: { model: { position: { x: 12, z: -20 } }, velocity: { x: 0, z: 0 } }
    });

    // A ATACAR: o alvo tem de sair intacto e o ponto de marcação nem é calculado.
    mod.limparChamada();
    const p1 = jogador();
    const r1 = mod.aplicarMarcacaoPosicional(p1, { isAttacking: true }, 3.0, 25.0);
    if (r1.x !== 3.0 || r1.z !== 25.0) {
        erro(`a atacar o alvo devia ficar em (3, 25), ficou em (${r1.x}, ${r1.z})`);
    } else if (mod.viuChamada()) {
        erro('a atacar chegou a calcular ponto de marcação');
    } else ok('a atacar: o slot fica intacto, o avançado não é puxado ao central');

    // A DEFENDER: continua a marcar como antes.
    mod.limparChamada();
    const p2 = jogador();
    const r2 = mod.aplicarMarcacaoPosicional(p2, { isAttacking: false }, 3.0, 25.0);
    if (!mod.viuChamada()) {
        erro('a defender deixou de marcar — a guarda apanhou fase a mais');
    } else if (r2.x === 3.0 && r2.z === 25.0) {
        erro('a defender o alvo não se mexeu');
    } else ok('a defender: a marcação continua a inclinar o slot');

    // Sem `bb` nenhum não se marca: não se sabe a fase, e inventar uma é
    // exactamente o defeito que isto vem corrigir.
    mod.limparChamada();
    const r3 = mod.aplicarMarcacaoPosicional(jogador(), null, 3.0, 25.0);
    if (r3.x !== 3.0 || r3.z !== 25.0) erro('sem bb devia devolver o alvo intacto');
    else ok('sem bb: alvo intacto');
}

/* =====================================================================
   3 — E A INCUMBÊNCIA TAMBÉM NÃO SOBREVIVE À POSSE
   ===================================================================== */
console.log(LF + '3 — ao ganhar a bola, larga-se o homem');
{
    /*
    Não chega não APLICAR a marcação: se o `marcRef` ficasse escrito, ele é
    lido noutros sítios (o `podeMarcar` da árvore, o `estouAMarcar` que tira o
    jogador das intercepções). Um homem atribuído a quem está a atacar é lixo
    de estado, da mesma família do `actionState` pendurado.
    */
    const preludio = `
        const MarkingModel = { raioSetor: 12.0, histerese: 1.0 };
        const Match = { delta: 0.016 };
        function atribuirMarcacoes(marcadores, adversarios, raio) {
            return marcadores.map(() => adversarios[0] || null);
        }
    `;
    const mod = extrairFuncao(srcTeam, 'atribuirMarcacoesDaEquipa', preludio);

    const adversario = { model: { position: { x: 0, z: 0 } } };
    const jogador = () => ({
        role: 'cm', pos: 'CM',
        postoBase: { x: 0, z: 0 },
        model: { position: { x: 0, z: 0 } },
        marcRef: adversario, marcTimer: 5
    });

    const aAtacar = jogador();
    mod([aAtacar], { isAttacking: true, opp: [adversario] });
    if (aAtacar.marcRef) erro('a atacar ficou com um homem atribuído');
    else ok('a atacar: marcRef limpo');

    const aDefender = jogador();
    mod([aDefender], { isAttacking: false, opp: [adversario] });
    if (aDefender.marcRef !== adversario) erro('a defender deixou de atribuir marcação');
    else ok('a defender: continua a haver homem atribuído');
}

console.log(LF + (falhas ? `FALHOU: ${falhas}` : 'OK'));
process.exit(falhas ? 1 : 0);
