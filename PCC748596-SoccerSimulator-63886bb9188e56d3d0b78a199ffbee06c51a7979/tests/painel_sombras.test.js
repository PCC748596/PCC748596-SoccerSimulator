/*
O BOTÃO DAS SOMBRAS, no painel da direita.

O que este teste fixa não é o botão em si — é a parte que se esquece: mexer só
em `renderer.shadowMap.enabled` NÃO chega. O Three guarda o programa compilado
de cada material e não o recompila só porque a flag do renderer mudou; sem
marcar os materiais como sujos, desligar não apaga as sombras já desenhadas e
voltar a ligar deixa metade da cena sem elas.

O modo de falha é ficar num estado A MEIO — umas coisas com sombra, outras sem
— que se lê como um bug do jogo e não do botão, e é por isso que vale a pena
travá-lo aqui.

O outro lado da mesma moeda: os `castShadow`/`receiveShadow` das malhas NÃO
podem ser tocados. Esses dizem o que cada objecto faz com as sombras (a
bancada está deliberadamente fora delas, ver createField) e reescrevê-los
perdia essas decisões assim que se voltasse a ligar.

Corre com: node tests/painel_sombras.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcMain = ler('js/main.js');
const html = ler('index.html');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/* ===================================================================== */
console.log(LF + '1 — o botão está no painel da direita');
{
    const iPainel = html.indexOf('id="painel-direito-conteudo"');
    const iFim = html.indexOf('id="painel-jogadores"');
    const painel = (iPainel < 0) ? '' : html.slice(iPainel, iFim > 0 ? iFim : undefined);

    if (painel.indexOf('id="btn-sombras"') < 0) {
        erro('o botão não está dentro do painel da direita');
    } else ok('está no painel-direito-conteudo');

    if (painel.indexOf('onclick="toggleSombras()"') < 0) {
        erro('o botão não chama toggleSombras()');
    } else ok('chama toggleSombras()');

    // Nasce ON, porque as sombras arrancam ligadas no renderer.
    const arrancaLigado = /rendererCore\.shadowMap\.enabled\s*=\s*true/.test(srcMain);
    const botaoLigado = /id="btn-sombras"[\s\S]{0,160}Sombras:\s*ON/.test(painel);
    const classeActiva = /class="btn-sector active"[\s\S]{0,80}id="btn-sombras"/.test(painel);
    if (!arrancaLigado) {
        erro('o renderer já não arranca com sombras — o rótulo inicial do botão mente');
    } else if (!botaoLigado || !classeActiva) {
        erro('o botão devia nascer em ON e com a classe active, como o renderer');
    } else ok('nasce ON, a condizer com o renderer');
}

console.log(LF + '2 — a função faz as três coisas');
{
    const i = srcMain.indexOf('function toggleSombras');
    if (i < 0) throw new Error('toggleSombras não encontrada no js/main.js');
    const corpo = srcMain.slice(i, srcMain.indexOf(LF + '}', i) + 2);

    if (!/shadowMap\.enabled\s*=\s*!/.test(corpo)) {
        erro('não alterna o shadowMap.enabled');
    } else ok('alterna o shadowMap do renderer');

    /*
    A PARTE QUE SE ESQUECE. Sem isto o Three reutiliza os programas já
    compilados e a cena fica num estado a meio.
    */
    if (!/needsUpdate\s*=\s*true/.test(corpo) || !/traverse/.test(corpo)) {
        erro('não marca os materiais da cena como sujos — as sombras não mudam mesmo');
    } else ok('percorre a cena e marca os materiais para recompilar');

    if (!/getElementById\('btn-sombras'\)/.test(corpo)) {
        erro('não actualiza o rótulo do botão');
    } else if (!/classList\.toggle\('active'/.test(corpo)) {
        erro('não actualiza a classe active — o botão não mostra o estado');
    } else ok('actualiza o rótulo e o estado visual');
}

console.log(LF + '3 — o que a função NÃO pode fazer');
{
    const i = srcMain.indexOf('function toggleSombras');
    const corpo = srcMain.slice(i, srcMain.indexOf(LF + '}', i) + 2);

    /*
    A LUZ TEM DE PERDER A SOMBRA. Só `shadowMap.enabled = false` deixa o mapa
    por actualizar mas NÃO o limpa: os materiais continuam a amostrar o último
    mapa e as sombras ficam congeladas no relvado enquanto os jogadores andam.
    */
    if (!/dirLightCore\.castShadow\s*=/.test(corpo)) {
        erro('não desliga o castShadow da LUZ — as sombras ficam congeladas no campo');
    } else ok('tira a sombra à luz, e não só ao renderer');

    /*
    Mas as MALHAS não se tocam: os castShadow/receiveShadow delas dizem o que
    cada objecto faz com as sombras (a bancada está fora de propósito, e as
    peças decorativas do corpo também) e reescrevê-los perdia essas decisões
    na primeira vez que se ligasse o botão.
    */
    const semLuz = corpo.replace(/window\.dirLightCore\.castShadow\s*=\s*on;/g, '');
    if (/\.castShadow\s*=/.test(semLuz) || /\.receiveShadow\s*=/.test(semLuz)) {
        erro('mexe nos castShadow/receiveShadow das malhas — perde as decisões por objecto');
    } else ok('não toca no castShadow/receiveShadow de nenhuma malha');

    // Sem renderer não pode rebentar: o painel existe antes da cena estar montada.
    if (!/if\s*\(!r\)\s*return/.test(corpo)) {
        erro('sem renderer a função rebenta — o botão existe antes da cena montar');
    } else ok('sai em silêncio se ainda não houver renderer');
}

console.log(LF + '4 — o comportamento, corrido');
{
    const i = srcMain.indexOf('function toggleSombras');
    const corpo = srcMain.slice(i, srcMain.indexOf(LF + '}', i) + 2);

    // Cena mínima: duas malhas, uma com array de materiais (o traverse tem de
    // aguentar os dois casos — um material só ou vários).
    const mat = () => ({ needsUpdate: false });
    const m1 = { material: mat() };
    const m2 = { material: [mat(), mat()] };
    const semMaterial = {};
    const botao = { innerText: '', classList: { toggle() {} } };

    const luz = { castShadow: true };
    const janela = {
        dirLightCore: luz,
        rendererCore: { shadowMap: { enabled: true } },
        Match: { scene: { traverse(fn) { [m1, m2, semMaterial].forEach(fn); } } },
        document: { getElementById: () => botao }
    };
    // O `corpo` inclui o `function toggleSombras() {...}` inteiro: declara-se e
    // devolve-se pelo nome. Envolvê-lo noutra função só o declarava lá dentro,
    // e nada chegava a correr.
    const fn = new Function('window', 'document',
        corpo + LF + 'return toggleSombras;')(janela, janela.document);

    fn();
    if (janela.rendererCore.shadowMap.enabled !== false) erro('o primeiro clique devia desligar');
    else if (botao.innerText !== 'Sombras: OFF') erro(`rótulo ficou "${botao.innerText}"`);
    else ok('primeiro clique: OFF');

    if (!m1.material.needsUpdate || !m2.material[0].needsUpdate || !m2.material[1].needsUpdate) {
        erro('nem todos os materiais foram marcados (incluindo os que vêm em array)');
    } else ok('todos os materiais marcados, arrays incluídos');

    if (luz.castShadow !== false) {
        erro('a luz continuou a projectar — as sombras ficariam congeladas no campo');
    } else ok('a luz deixou de projectar');

    fn();
    if (janela.rendererCore.shadowMap.enabled !== true) erro('o segundo clique devia religar');
    else if (botao.innerText !== 'Sombras: ON') erro(`rótulo ficou "${botao.innerText}"`);
    else if (luz.castShadow !== true) erro('a luz não voltou a projectar — ficava sem sombras para sempre');
    else ok('segundo clique: volta a ON, luz incluída');
}

console.log(LF + (falhas === 0
    ? 'painel_sombras: tudo bem.'
    : `painel_sombras: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
