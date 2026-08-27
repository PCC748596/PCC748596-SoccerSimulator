/*
POSE PARTILHADA — o corpo e as poses que o jogo e o editor de animação usam.

Spec em docs/superpowers/specs/2026-08-25-editor-de-animacao-design.md.

PORQUE ESTE TESTE EXISTE. O `buildBody` mudou-se do FootballPlayer para o
`construirCorpo` do js/pose.js, para o editor poder montar o mesmo boneco sem
instanciar um jogador. Ao fazer essa extracção, os 18 testes que já existiam
continuaram todos verdes — e isso não provava nada: **nenhum deles chega a
chamar o buildBody.** O `reach_ik` até fala dele, mas replica as proporções à
mão em vez de o correr.

Ou seja, o modelo do jogador não tinha teste nenhum. Agora tem.

O canvas é substituído por um duplo: o `construirCorpo` desenha a camisola e os
meiões num canvas 2D, que em node não existe. O que aqui interessa é a
geometria e a hierarquia do rig, não os pixels da textura.
*/
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

/*
Canvas de mentira: aceita tudo o que lhe chamarem e não devolve nada. O
`THREE.CanvasTexture` guarda-o como imagem e nunca o lê fora de um renderer.
*/
const contexto2d = new Proxy({}, {
    get: () => () => { },
    set: () => true
});
const documentoFalso = {
    createElement: () => ({ width: 0, height: 0, getContext: () => contexto2d })
};

const amb = { THREE, console, document: documentoFalso, window: {} };
const mod = new Function(...Object.keys(amb),
    `${ler('js/config.js')}
     ${ler('js/pose.js')}
     return { construirCorpo, escolherAparencia,
              aplicarPoseRemate, aplicarPoseLateral, aplicarPoseChutaoGR,
              aplicarPoseChuteChaoGR, aplicarPoseLancamentoGR, aplicarPoseDominioDireito,
              ShotClip, ThrowInClip, GoalkeeperKickClip,
              GoalkeeperGroundKickClip, GoalkeeperThrowClip, BallControlRightClip };`)(...Object.values(amb));
const { construirCorpo, escolherAparencia } = mod;

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/*
1 — O CORPO.
*/
console.log(String.fromCharCode(10) + '1 — construirCorpo');

const feito = construirCorpo('#3498db', '#34495e', escolherAparencia(0, 11, 0));

{
    for (const campo of ['corpo', 'rig', 'backMat']) {
        if (!feito[campo]) erro(`construirCorpo não devolveu \`${campo}\``);
    }
    if (feito.corpo && feito.rig && feito.backMat) {
        ok('devolve corpo, rig e backMat');
    }

    /*
    O `backMat` era escrito em `this.backMat` dentro do método. Se a extracção
    o tivesse deixado para trás, o número da camisola deixava de aparecer — e
    nada mais no jogo dava erro por causa disso.
    */
    if (feito.backMat && !feito.backMat.isMaterial) {
        erro('o backMat devolvido não é um material');
    } else ok('o backMat é um material a sério (é onde o número é desenhado)');
}

/*
2 — O RIG: todas as juntas preenchidas.

Uma junta a `null` não dá erro nenhum na construção — só quando alguma pose lhe
tenta tocar, muito mais tarde e noutro sítio.
*/
console.log(String.fromCharCode(10) + '2 — as juntas do rig');
{
    const esperadas = [
        'pelvis', 'chest', 'neck',
        'lArm', 'rArm', 'lElbow', 'rElbow', 'lHand', 'rHand',
        'lLeg', 'rLeg', 'lKnee', 'rKnee', 'lFoot', 'rFoot'
    ];
    const emFalta = esperadas.filter(k => !feito.rig || !feito.rig[k]);
    if (emFalta.length) {
        erro(`juntas por preencher: ${emFalta.join(', ')}`);
    } else ok(`as ${esperadas.length} juntas do rig estão preenchidas`);

    // As mãos entram no rig de propósito: o IK precisa da ponta da cadeia e o
    // gk_dive.js lê a posição real delas no mundo.
    if (feito.rig && feito.rig.lHand && feito.rig.rHand) {
        ok('as mãos estão no rig (o IK e o gk_dive.js precisam delas)');
    }
}

/*
3 — A HIERARQUIA.

É ela que faz uma rotação da bacia levar o tronco atrás, e o tronco levar os
braços. Se a extracção tivesse pendurado alguma peça no sítio errado, as poses
saíam todas tortas sem nenhum número estar errado.
*/
console.log(String.fromCharCode(10) + '3 — a hierarquia');
{
    const rig = feito.rig;
    const ehDescendente = (no, antepassado) => {
        let p = no && no.parent;
        while (p) { if (p === antepassado) return true; p = p.parent; }
        return false;
    };

    const ligacoes = [
        ['chest', 'pelvis'], ['neck', 'chest'],
        ['lArm', 'chest'], ['rArm', 'chest'],
        ['lElbow', 'lArm'], ['rElbow', 'rArm'],
        ['lHand', 'lElbow'], ['rHand', 'rElbow'],
        ['lLeg', 'pelvis'], ['rLeg', 'pelvis'],
        ['lKnee', 'lLeg'], ['rKnee', 'rLeg'],
        ['lFoot', 'lKnee'], ['rFoot', 'rKnee']
    ];
    const partidas = ligacoes.filter(([f, p]) => !ehDescendente(rig[f], rig[p]));
    if (partidas.length) {
        erro('ligações erradas na hierarquia: ' +
            partidas.map(([f, p]) => `${f} não está sob ${p}`).join('; '));
    } else ok(`as ${ligacoes.length} ligações do esqueleto estão no sítio`);

    // Prova viva: rodar a bacia tem de levar a mão atrás dela.
    const antes = new THREE.Vector3();
    const depois = new THREE.Vector3();
    feito.corpo.updateWorldMatrix(true, true);
    rig.rHand.getWorldPosition(antes);
    rig.pelvis.rotation.y += 1.0;
    feito.corpo.updateWorldMatrix(true, true);
    rig.rHand.getWorldPosition(depois);
    rig.pelvis.rotation.y -= 1.0;

    if (antes.distanceTo(depois) < 0.05) {
        erro('rodar a bacia não moveu a mão — a cadeia está partida');
    } else ok(`rodar a bacia move a mão ${antes.distanceTo(depois).toFixed(2)} m`);
}

/*
4 — A ESCALA E AS PROPORÇÕES.

O `reach_ik.test.js` replica estes comprimentos à mão para calcular alcances.
Se aqui mudarem sem lá mudarem, esse teste passa a medir outra coisa e não se
queixa — por isso a altura fica fixada aqui.
*/
console.log(String.fromCharCode(10) + '4 — a escala');
{
    feito.corpo.updateWorldMatrix(true, true);
    const caixa = new THREE.Box3().setFromObject(feito.corpo);
    const altura = caixa.max.y - caixa.min.y;
    console.log(`  altura do modelo: ${altura.toFixed(2)} m`);

    if (altura < 1.5 || altura > 2.1) {
        erro(`altura de ${altura.toFixed(2)} m — um jogador anda pelo 1.8`);
    } else ok('a altura do modelo é a de um jogador');

    const esc = feito.corpo.scale.x;
    const escEsperada = (1.8 / 5.5) * 0.9;
    if (Math.abs(esc - escEsperada) > 1e-6) {
        erro(`escala ${esc} em vez de ${escEsperada} — o crowd.js usa a mesma ` +
            'e os adeptos passavam a ter outro tamanho que os jogadores');
    } else ok('a escala é a mesma que o js/crowd.js usa nos adeptos');
}

/*
5 — SEM `this`, SEM JOGO.

É a razão de o ficheiro existir: o editor de animação monta o boneco sem
Match, sem cena e sem FootballPlayer. Se alguém voltar a meter uma dependência
da instância, isto acusa.
*/
console.log(String.fromCharCode(10) + '5 — sem dependências do jogo');
{
    /*
    Sobre o CÓDIGO, não sobre os comentários: o cabeçalho do pose.js explica
    justamente que não depende do FootballPlayer, e uma procura literal
    acusava essa frase. Tirar os comentários antes de procurar é o mínimo para
    a verificação dizer o que quer dizer.
    */
    const semComentarios = (txt) => txt
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(LF).map(l => l.replace(/\/\/.*$/, '')).join(LF);

    const fonte = semComentarios(ler('js/pose.js'));
    const comThis = fonte.split(LF)
        .map((l, i) => [i + 1, l])
        .filter(([, l]) => /\bthis\./.test(l));
    if (comThis.length) {
        erro(`js/pose.js usa \`this.\` em ${comThis.length} linha(s): ` +
            comThis.slice(0, 3).map(([n]) => n).join(', '));
    } else ok('o js/pose.js não usa `this` em lado nenhum');

    for (const proibido of ['Match.', 'FootballPlayer']) {
        if (fonte.indexOf(proibido) !== -1) {
            erro(`js/pose.js refere \`${proibido}\` — deixa de servir ao editor`);
        }
    }
    ok('não refere o Match nem o FootballPlayer');

    // E funciona sem aparência nenhuma, que é como o editor o vai chamar.
    try {
        const semAparencia = construirCorpo('#e74c3c', '#ffffff');
        if (!semAparencia.rig.pelvis) erro('sem aparência, o rig veio vazio');
        else ok('funciona sem lhe passar aparência (é como o editor o chama)');
    } catch (e) {
        erro(`sem aparência atirou: ${e.message}`);
    }
}

/*
6 — AS CINCO POSES DOS CLIPS.

Mesmo problema do buildBody: as poses saíram dos métodos do FootballPlayer e
NENHUM teste as chegava a correr. Aqui aplicam-se todas a um rig a sério, com
os keyframes verdadeiros do config.js.
*/
console.log(String.fromCharCode(10) + '6 — as poses dos clips');
{
    const {
        aplicarPoseRemate, aplicarPoseLateral, aplicarPoseChutaoGR,
        aplicarPoseChuteChaoGR, aplicarPoseLancamentoGR, aplicarPoseDominioDireito,
        ShotClip, ThrowInClip, GoalkeeperKickClip,
        GoalkeeperGroundKickClip, GoalkeeperThrowClip, BallControlRightClip
    } = mod;

    // Um rig novo por pose: assim uma pose não herda o que a anterior escreveu.
    const rigNovo = () => construirCorpo('#3498db', '#34495e').rig;

    const casos = [
        ['remate', ShotClip, (rig, K) => aplicarPoseRemate(rig, K)],
        ['lateral', ThrowInClip, (rig, K) => aplicarPoseLateral(rig, K, 0.4)],
        ['chutão GR', GoalkeeperKickClip, (rig, K) => aplicarPoseChutaoGR(rig, K, 0.5)],
        ['tiro de meta', GoalkeeperGroundKickClip, (rig, K) => aplicarPoseChuteChaoGR(rig, K, null, {})],
        ['lançamento GR', GoalkeeperThrowClip, (rig, K) => aplicarPoseLancamentoGR(rig, K)],
        ['domínio de bola (direita)', BallControlRightClip, (rig, K) => aplicarPoseDominioDireito(rig, K)]
    ];

    for (const [nome, clip, aplicar] of casos) {
        if (!clip || !clip.frames || !clip.frames.length) {
            erro(`${nome}: clip sem keyframes`);
            continue;
        }

        const rig = rigNovo();
        let rebentou = null;
        let mexeu = 0;

        for (let i = 0; i < clip.frames.length; i++) {
            const antes = [rig.pelvis, rig.chest, rig.lLeg, rig.rLeg, rig.lArm, rig.rArm]
                .map(n => `${n.rotation.x},${n.rotation.y},${n.rotation.z}`).join('|');
            try {
                aplicar(rig, clip.frames[i]);
            } catch (e) {
                rebentou = `keyframe ${i + 1}: ${e.message}`;
                break;
            }
            const depois = [rig.pelvis, rig.chest, rig.lLeg, rig.rLeg, rig.lArm, rig.rArm]
                .map(n => `${n.rotation.x},${n.rotation.y},${n.rotation.z}`).join('|');
            if (antes !== depois) mexeu++;

            /*
            NaN é o modo de falha silencioso destas funções: um canal que o
            clip não tem dá `undefined`, e `undefined` escrito numa rotação
            passa a NaN. O boneco desaparece do ecrã e nada se queixa.
            */
            for (const junta of ['pelvis', 'chest', 'lLeg', 'rLeg', 'lArm', 'rArm', 'lElbow', 'rElbow']) {
                const r = rig[junta].rotation;
                if (!isFinite(r.x) || !isFinite(r.y) || !isFinite(r.z)) {
                    rebentou = `keyframe ${i + 1}: ${junta} ficou NaN ` +
                        '(canal em falta no clip?)';
                    break;
                }
            }
            if (rebentou) break;
        }

        if (rebentou) erro(`${nome} — ${rebentou}`);
        else if (mexeu < 2) erro(`${nome}: os ${clip.frames.length} keyframes quase não mexem no rig`);
        else ok(`${nome}: ${clip.frames.length} keyframes aplicados, sem NaN`);
    }
}

/*
7 — O CONTACTO DO REMATE.

O `contactFrame` é o keyframe em que a bola sai do pé. Se a perna não estiver
esticada aí, o pé não está na bola — e o gesto deixa de ler como um remate por
muito bem que os outros frames estejam.
*/
console.log(String.fromCharCode(10) + '7 — o contacto do remate');
{
    const { aplicarPoseRemate, ShotClip } = mod;
    const rig = construirCorpo('#3498db', '#34495e').rig;

    const iContacto = ShotClip.contactFrame - 1;
    const chuteR = (ShotClip.pernaChute === 'r');
    const joelhoC = chuteR ? 'rKnee' : 'rKnee';

    aplicarPoseRemate(rig, ShotClip.frames[iContacto]);
    const joelhoNoContacto = Math.abs(rig[chuteR ? 'rKnee' : 'lKnee'].rotation.x);

    // E na armação (o pico do clip) o joelho tem de estar bem dobrado.
    let joelhoMax = 0;
    for (const f of ShotClip.frames) joelhoMax = Math.max(joelhoMax, Math.abs(f.joelhoChute));

    console.log(`  joelho: ${joelhoMax.toFixed(2)} rad na armação, ` +
        `${joelhoNoContacto.toFixed(2)} no contacto (frame ${ShotClip.contactFrame})`);

    if (joelhoNoContacto > 0.5) {
        erro(`no contacto o joelho está a ${joelhoNoContacto.toFixed(2)} rad: ` +
            'a perna não está esticada, o pé não chega à bola');
    } else ok('no contacto a perna do remate está esticada');

    if (joelhoMax < 1.0) {
        erro(`o joelho nunca passa de ${joelhoMax.toFixed(2)} rad: não há armação`);
    } else ok('há armação — o joelho dobra bem antes do contacto');

    if (ShotClip.contactFrame < 2 || ShotClip.contactFrame > ShotClip.frames.length) {
        erro(`contactFrame ${ShotClip.contactFrame} fora dos ${ShotClip.frames.length} keyframes`);
    } else ok('o contactFrame cai dentro do clip');
}

console.log('');
if (falhas) {
    console.error(`FALHOU: ${falhas} problema(s).`);
    process.exit(1);
}
console.log('OK: o corpo partilhado monta-se sem jogo, com o rig todo no sítio.');
