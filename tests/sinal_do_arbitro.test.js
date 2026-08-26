/*
O ÁRBITRO APONTA — para que lado é a falta, e onde é o penálti.

A etiqueta diz O QUE foi marcado; falta dizer A FAVOR DE QUEM. Na arbitragem
real é o braço: aponta a direcção do ataque da equipa que beneficia. No penálti
aponta a MARCA, que não é uma direcção mas um ponto do chão.

Duas geometrias diferentes, e por isso dois números de elevação: o braço na
horizontal indica um sentido; o braço em diagonal para baixo indica um sítio.

Corre com: node tests/sinal_do_arbitro.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcOff = ler('js/officials.js');

function extrairObjecto(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    if (i < 0) throw new Error(`${nome} não encontrado`);
    const f = src.indexOf(LF + '};', i);
    return new Function(`const CAMPO_COMP = 106; const CAMPO_LARG = 68;
        ${src.slice(i, f + 3)}; return ${nome};`)();
}

function metodo(nome, preludio) {
    const cabeca = `${nome}: function (`;
    const i = srcOff.indexOf(cabeca);
    if (i < 0) throw new Error(`${nome} não encontrado em js/officials.js`);
    const f = srcOff.indexOf(LF + '    },', i);
    const corpo = srcOff.slice(i + cabeca.length, f);
    const args = corpo.slice(0, corpo.indexOf(')'));
    const bloco = corpo.slice(corpo.indexOf('{') + 1);
    return new Function('self', args,
        `${preludio || ''} const _f = function (${args}) {${bloco}}; return _f.apply(self, [${args}]);`);
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

const R = extrairObjecto(srcOff, 'RefereeModel');

/* =====================================================================
   1 — OS NÚMEROS DO GESTO
   ===================================================================== */
console.log(LF + '1 — braço na horizontal para a direcção, em diagonal para a marca');
{
    if (!(R.elevacaoSinal < 0)) {
        erro(`o braço tem de subir: elevacaoSinal = ${R.elevacaoSinal}`);
    } else ok(`elevacaoSinal ${R.elevacaoSinal.toFixed(2)} rad ` +
        `(${Math.round(-R.elevacaoSinal * 180 / Math.PI)}° acima do corpo caído)`);

    if (!(R.elevacaoPenalti > R.elevacaoSinal)) {
        erro('apontar a marca devia ser MAIS BAIXO do que apontar a direcção: ' +
            `${R.elevacaoPenalti} vs ${R.elevacaoSinal}`);
    } else ok(`elevacaoPenalti ${R.elevacaoPenalti.toFixed(2)} rad, mais baixo`);

    if (!(R.duracaoSinal > 0)) erro('o gesto não tem duração');
    else ok(`duração ${R.duracaoSinal} s`);
}

/* =====================================================================
   2 — A FALTA APONTA O ATAQUE DE QUEM BENEFICIA
   ===================================================================== */
console.log(LF + '2 — a direcção é a do ataque da equipa que beneficia');
{
    const sinalizar = metodo('sinalizarMarcacao',
        `const RefereeModel = ${JSON.stringify(R)};
         const CAMPO_COMP = 106;`);

    const self = {
        _ativo: true,
        arbitro: { model: { position: { x: 0, z: 0 } } },
        sinalizar: function (x, z, elev) { this._ult = { x, z, elev }; }
    };

    // TeamA ataca +z (dirZ 1): falta a favor dele -> aponta para +z.
    const Match = {
        players: [{ team: 'TeamA', dirZ: 1 }],
        opponents: [{ team: 'TeamB', dirZ: -1 }]
    };
    const chamar = (tipo, team) => {
        const fn = metodo('sinalizarMarcacao',
            `const RefereeModel = ${JSON.stringify(R)};
             const CAMPO_COMP = 106;
             const Match = ${JSON.stringify(Match)};`);
        self._ult = null;
        fn(self, tipo, team);
        return self._ult;
    };

    const a = chamar('FREE_KICK', 'TeamA');
    if (!a) erro('falta a favor do TeamA não sinalizou nada');
    else if (!(a.z > 0)) erro(`TeamA ataca +z, apontou para z=${a.z}`);
    else ok(`falta do TeamA: aponta z=${a.z} (baliza atacada)`);

    const b = chamar('FREE_KICK', 'TeamB');
    if (!b) erro('falta a favor do TeamB não sinalizou nada');
    else if (!(b.z < 0)) erro(`TeamB ataca -z, apontou para z=${b.z}`);
    else ok(`falta do TeamB: aponta z=${b.z}`);

    if (a && Math.abs(a.elev - R.elevacaoSinal) > 1e-9) {
        erro('a falta não usa a elevação horizontal');
    } else ok('falta: braço na horizontal');
}

/* =====================================================================
   3 — O PENÁLTI APONTA A MARCA
   ===================================================================== */
console.log(LF + '3 — no penálti aponta-se a marca, não o horizonte');
{
    const Match = {
        players: [{ team: 'TeamA', dirZ: 1 }],
        opponents: [{ team: 'TeamB', dirZ: -1 }]
    };
    const fn = metodo('sinalizarMarcacao',
        `const RefereeModel = ${JSON.stringify(R)};
         const CAMPO_COMP = 106;
         const Match = ${JSON.stringify(Match)};`);

    const self = {
        _ativo: true,
        arbitro: { model: { position: { x: 0, z: 0 } } },
        sinalizar: function (x, z, elev) { this._ult = { x, z, elev }; }
    };

    fn(self, 'PENALTY', 'TeamA');
    const p = self._ult;

    if (!p) erro('o penálti não sinalizou nada');
    else {
        // Marca do TeamA: na baliza que ele ataca, a marcaZ da linha de fundo.
        const esperadoZ = (CAMPO_COMP_ESPERADO() / 2) - R.marcaPenaltiZ;
        if (Math.abs(p.z - esperadoZ) > 0.01) {
            erro(`devia apontar a marca em z=${esperadoZ}, apontou z=${p.z}`);
        } else ok(`aponta a marca em z=${p.z.toFixed(1)}`);

        if (Math.abs(p.x) > 0.01) erro(`a marca é no eixo, apontou x=${p.x}`);
        else ok('no eixo do campo');

        if (Math.abs(p.elev - R.elevacaoPenalti) > 1e-9) {
            erro('o penálti não usa a elevação da marca');
        } else ok('penálti: braço em diagonal para a marca');
    }
}
function CAMPO_COMP_ESPERADO() { return 106; }

/* =====================================================================
   4 — O RESTO NÃO APONTA NADA
   ===================================================================== */
console.log(LF + '4 — canto, lateral e pontapé de baliza não levam este gesto');
{
    const Match = {
        players: [{ team: 'TeamA', dirZ: 1 }],
        opponents: [{ team: 'TeamB', dirZ: -1 }]
    };
    const fn = metodo('sinalizarMarcacao',
        `const RefereeModel = ${JSON.stringify(R)};
         const CAMPO_COMP = 106;
         const Match = ${JSON.stringify(Match)};`);

    for (const tipo of ['CORNER_KICK', 'THROW_IN', 'GOAL_KICK', 'PLAY']) {
        const self = {
            _ativo: true,
            arbitro: { model: { position: { x: 0, z: 0 } } },
            sinalizar: function (x, z, elev) { this._ult = { x, z, elev }; }
        };
        fn(self, tipo, 'TeamA');
        if (self._ult) erro(`${tipo} sinalizou direcção`);
        else ok(`${tipo}: sem gesto de direcção`);
    }

    // E sem árbitro não rebenta: isto corre de dentro do setupSetPiece.
    let rebentou = false;
    try {
        fn({ _ativo: true, arbitro: null, sinalizar: () => { } }, 'FREE_KICK', 'TeamA');
    } catch (e) { rebentou = true; }
    if (rebentou) erro('sem árbitro, rebentou');
    else ok('sem árbitro: não rebenta');
}

/* =====================================================================
   5 — O GESTO ACABA
   ===================================================================== */
console.log(LF + '5 — o braço volta a cair');
{
    const tick = metodo('tickSinal',
        `const lerpTo = (a, b, k) => a + (b - a) * (k === undefined ? 0.2 : k);
         const RefereeModel = ${JSON.stringify(R)};`);

    const rig = {
        rArm: { rotation: { x: 0, y: 0, order: 'XYZ' } },
        lArm: { rotation: { x: 0, y: 0, order: 'XYZ' } },
        rElbow: { rotation: { x: 0 } },
        lElbow: { rotation: { x: 0 } }
    };
    /*
    O CORPO OLHA PARA A BOLA — é o `mover` que trata disso (olharPara). O gesto
    só mexe no BRAÇO: sem isto o árbitro virava as costas ao lance para apontar
    o ataque, que é o contrário do que se faz em campo.

    Corpo virado para -z (rotation.y = π) e alvo do braço em +z: o braço tem de
    levar meia-volta de guinada para apontar lá, sem o corpo se mexer.
    */
    const corpo = { position: { x: 0, z: 0 }, rotation: { y: 0 } };
    const self = {
        arbitro: {
            rig: rig,
            model: corpo,
            sinal: { x: 0, z: 20, elev: -1.5, timer: 1.0 }
        }
    };

    for (let n = 0; n < 30; n++) tick(self, 0.016);   // ~0.5 s
    const signalArm = (rig.rArm.rotation.order === 'YXZ') ? rig.rArm : rig.lArm;
    if (!self.arbitro.sinal) erro('o gesto acabou a meio');
    else if (signalArm.rotation.x > -0.5) {
        erro(`o braço não subiu: ${signalArm.rotation.x.toFixed(2)}`);
    } else ok(`a meio do gesto o braço está a ${signalArm.rotation.x.toFixed(2)} rad`);

    // O CORPO NÃO SE MEXEU: quem o vira para a bola é o mover.
    if (Math.abs(corpo.rotation.y - 0) > 1e-9) {
        erro(`o gesto rodou o corpo (y = ${corpo.rotation.y.toFixed(2)}) — ` +
            'o árbitro deixa de olhar para a bola');
    } else ok('o corpo continua virado para onde o mover o pôs');

    /*
    E o braço aponta o alvo em coordenadas do MUNDO: a guinada dele é a
    diferença entre o ângulo para o alvo e o ângulo do corpo. Com o corpo a
    olhar para +z e o alvo em +z, o braço direito aponta para a frente com
    guinada de +90° em relação ao corpo.
    */
    const guinada = Math.atan2(
        Math.sin(signalArm.rotation.y), Math.cos(signalArm.rotation.y));
    if (Math.abs(Math.abs(guinada) - Math.PI / 2) > 0.25) {
        erro(`a guinada do braço devia ser ~90°, é ${Math.round(guinada * 180 / Math.PI)}°`);
    } else ok(`braço com ${Math.round(Math.abs(guinada) * 180 / Math.PI)}° de guinada, ` +
        'a apontar o alvo com o corpo virado para ele');

    // A ordem das rotações tem de ser guinada-primeiro, senão a elevação
    // roda em torno do eixo errado e o braço acaba a apontar para o sítio errado.
    if (signalArm.rotation.order !== 'YXZ') {
        erro(`a ordem das rotações do braço é ${signalArm.rotation.order}, devia ser YXZ`);
    } else ok('ordem YXZ: guinada primeiro, elevação depois');

    for (let n = 0; n < 60; n++) tick(self, 0.016);   // passa 1 s
    if (self.arbitro.sinal) erro('passou a duração e o gesto continua');
    else ok('passada a duração, o gesto termina');

    let rebentou = false;
    try { tick({ arbitro: null }, 0.1); } catch (e) { rebentou = true; }
    if (rebentou) erro('sem árbitro, rebentou');
    else ok('sem árbitro: não rebenta');
}

/* =====================================================================
   6 — E O JOGO CHAMA MESMO ISTO
   ===================================================================== */
console.log(LF + '6 — o lance parado dispara o gesto');
{
    const srcMatch = semCR(fs.readFileSync(path.join(raiz, 'js/match.js'), 'utf8'));
    const i = srcMatch.indexOf('setupSetPiece: function');
    const corpo = srcMatch.slice(i, i + 4000);
    if (!/sinalizarMarcacao/.test(corpo)) {
        erro('o setupSetPiece não sinaliza — o braço nunca sobe');
    } else ok('o setupSetPiece sinaliza');

    // E o gesto é mantido no update dos árbitros, depois do mover.
    const k = srcOff.indexOf('update: function (dt)');
    const upd = srcOff.slice(k, k + 4000);
    if (!/tickSinal/.test(upd)) erro('o update não mantém o gesto');
    else ok('o update mantém o gesto');
}

console.log(LF + (falhas ? `FALHOU: ${falhas}` : 'OK'));
process.exit(falhas ? 1 : 0);
