/*
O FUTEBOL E FEITO DE MAIS PASSES DO QUE CORRIDAS.

O QUE SE VIA. "Os jogadores quando dominam a bola, sempre giram para frente e
saem correndo. Nunca tocam para o lado, para tras."

A CAUSA era a ordem da arvore de decisao com bola:

     8. ConduzirEmEspaco   <- conduz se houver campo aberto
     9. CaminhoFechado     <- so passa com 2 adversarios a frente
    10. CircularNaDefesa   <- so na defesa E sem campo aberto
    11. Driblar
    12. ProcurarPasse      <- o passe generico era o PENULTIMO
    14. act('conduzir')    <- e o fallback e conduzir

Conduzir era a opcao por omissao e passar a excepcao: chegava-se ao passe
generico so se nao houvesse campo aberto, o caminho nao estivesse fechado, nao
se estivesse na defesa e nao se pudesse driblar. Medido num lote de 20 jogos:
7309 conducoes contra 5604 passes — quase um para um.

A REGRA QUE ISTO FIXA: havendo passe bom, so se conduz a partir do ultimo terco
(`CarryModel.conduzirSoAcimaDe`). Fora dai passa-se. Sem passe nenhum
disponivel, conduz-se onde quer que se esteja — o ramo do passe falha e a
arvore segue para baixo, como antes.

Corre com: node tests/passa_antes_de_conduzir.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const src = ler('js/bt/player_bt.js');
const cfg = ler('js/config/player_behavior.js');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

const LIMITE = parseFloat(cfg.match(/conduzirSoAcimaDe:\s*([\d.]+)/)[1]);
const ZONA_LIVRE = parseFloat(cfg.match(/zonaLivre:\s*([\d.]+)/)[1]);

console.log(LF + '1 — a fronteira e a mesma do orcamento de conducao');
{
    if (LIMITE !== ZONA_LIVRE) {
        erro(`conduzirSoAcimaDe (${LIMITE}) devia seguir zonaLivre (${ZONA_LIVRE}) — duas fronteiras para a mesma ideia`);
    } else ok(`${LIMITE} m, o mesmo "ultimo terco" do orcamento`);
}

console.log(LF + '2 — a decisao, corrida');
{
    /*
    Reconstroi-se a condicao do ConduzirEmEspaco com o mesmo codigo do
    ficheiro, contra contextos falsos. O que interessa e o desfecho: com passe
    disponivel longe da baliza, este ramo tem de FALHAR para o passe acontecer.
    */
    const iCond = src.indexOf("cond('campoAberto', (ctx) => {");
    const corpo = src.slice(iCond, src.indexOf(LF + '                }),', iCond));

    const correr = ({ zoneAhead, haPasse }) => {
        const CarryModel = { conduzirSoAcimaDe: LIMITE, limiteConducaoDefesa: 999 };
        const findBestPassAnywhere = () => (haPasse ? { type: 'direct', target: {} } : null);
        const ctx = {
            p: { role: 'mid', model: { position: { x: 0, z: 0 } }, dirZ: 1 },
            zoneAhead: zoneAhead,
            campoAberto: true
        };
        const fn = new Function('CarryModel', 'findBestPassAnywhere',
            'return function (ctx) {' + corpo.slice(corpo.indexOf('{') + 1) + LF + 'return true; };'
        )(CarryModel, findBestPassAnywhere);
        return { conduz: fn(ctx), ctx };
    };

    // O CASO QUE MOTIVOU ISTO: bola no proprio meio-campo, ha a quem passar.
    const r1 = correr({ zoneAhead: -10, haPasse: true });
    if (r1.conduz) erro('com passe disponivel a -10 m ainda conduz — e o defeito outra vez');
    else ok('longe da baliza e com passe: nao conduz (vai passar)');

    // Sem ninguem a quem passar, conduz-se onde quer que se esteja.
    const r2 = correr({ zoneAhead: -10, haPasse: false });
    if (!r2.conduz) erro('sem passe nenhum tem de poder conduzir, senao fica parado');
    else ok('longe da baliza e sem passe: conduz');

    // No ultimo terco conduz-se mesmo havendo passe: e onde decide.
    const r3 = correr({ zoneAhead: LIMITE + 5, haPasse: true });
    if (!r3.conduz) erro(`no ultimo terco (${LIMITE + 5} m) devia conduzir mesmo com passe`);
    else ok('no ultimo terco: conduz mesmo com passe disponivel');

    // A fronteira e inclusiva do lado de conduzir.
    const r4 = correr({ zoneAhead: LIMITE, haPasse: true });
    if (!r4.conduz) erro(`exactamente em ${LIMITE} m devia conduzir`);
    else ok(`a fronteira (${LIMITE} m) conduz`);

    // E a escolha de passe fica guardada para o ProcurarPasse nao repetir a busca.
    if (!r1.ctx.currentPassChoice) {
        erro('a escolha de passe nao foi guardada — o ProcurarPasse repete a busca no mesmo frame');
    } else ok('a escolha de passe e reaproveitada no mesmo frame');
}

console.log(LF + '3 — a escolha guardada nao sobrevive ao frame');
{
    /*
    O `ctx` e reutilizado entre frames (`player.btCtx`). Uma escolha de passe
    que sobrevivesse apontaria para um companheiro que entretanto se moveu, ou
    que ja recebeu a bola — e o passe sairia para onde ele ESTAVA.
    */
    const iPrep = src.indexOf('this._throughBall = undefined;');
    const bloco = iPrep < 0 ? '' : src.slice(iPrep, iPrep + 700);
    if (!bloco) erro('o prepare() nao foi encontrado');
    else if (!/this\.currentPassChoice\s*=\s*null/.test(bloco)) {
        erro('o prepare() nao limpa currentPassChoice — a escolha fica obsoleta entre frames');
    } else ok('o prepare() limpa a escolha em cada frame');
}

console.log(LF + '4 — o ProcurarPasse continua a saber procurar sozinho');
{
    // Se o ConduzirEmEspaco nao correu (outro ramo apanhou antes), o
    // ProcurarPasse tem de fazer a busca ele proprio.
    const i = src.indexOf("seq('ProcurarPasse'");
    const bloco = i < 0 ? '' : src.slice(i, i + 900);
    if (!bloco) erro('ProcurarPasse nao encontrado');
    else if (!/ctx\.currentPassChoice\s*\|\|\s*findBestPassAnywhere\(ctx\)/.test(bloco)) {
        erro('o ProcurarPasse depende da escolha guardada — sem ela deixa de passar');
    } else ok('usa a guardada se existir, senao procura');
}

console.log(LF + (falhas === 0
    ? 'passa_antes_de_conduzir: tudo bem.'
    : `passa_antes_de_conduzir: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
