/*
QUEM VAI À BOLA — `deveMandarChaser` (js/bt/team_bt.js).

PORQUE EXISTE. Num lote de 20 jogos, o vigia do js/simulate.js apanhou quatro
casos de bola imóvel durante 25 segundos, três deles encostada às linhas, com
os 22 jogadores em MOVE_TO_POS, MARKING e SUPPORT_PASS — nem um único a
perseguir.

A causa eram duas guardas do pickChaser que, cada uma sensata sozinha,
desligavam AS DUAS EQUIPAS ao mesmo tempo:

  - "quem ataca não persegue" — mas a equipa com a posse nominal não tinha
    portador nenhum, a bola estava parada no chão;
  - "sem pressão alta só se persegue no próprio campo de defesa" — e a bola
    estava no campo de ataque da outra.

O que este teste fixa é a regra que resolve isso: COM A BOLA SOLTA, AS DUAS
GUARDAS NÃO SE APLICAM. É por isso que ele existe — para ninguém repor uma
delas sem dar por isto.
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const src = ler('js/bt/team_bt.js');
const ini = src.indexOf('function deveMandarChaser');
if (ini < 0) throw new Error('deveMandarChaser não encontrada no js/bt/team_bt.js');
const fim = src.indexOf(LF + '}', ini) + 2;
const deveMandarChaser = new Function(`${src.slice(ini, fim)}; return deveMandarChaser;`)();

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/*
1 — O CASO QUE ENCRAVOU O JOGO.

Bola solta em z = +46.9 (terço ofensivo do TeamA), posse nominal do TeamB.
O TeamA ataca +z (dir +1), o TeamB ataca -z (dir -1). Sem pressão alta.

As DUAS equipas têm de querer ir.
*/
console.log(String.fromCharCode(10) + '1 — bola solta no terço ofensivo (o encrave real)');
{
    const bolaZ = 46.9;

    const teamA = deveMandarChaser({
        isAttacking: false, bolaSolta: true, bolaZ: bolaZ, dir: 1,
        pressaoAlta: false, gkTemBola: false
    });
    const teamB = deveMandarChaser({
        isAttacking: true, bolaSolta: true, bolaZ: bolaZ, dir: -1,
        pressaoAlta: false, gkTemBola: false
    });

    if (!teamA) erro('TeamA não vai à bola solta no seu campo de ataque — foi isto que encravou');
    else ok('TeamA vai à bola solta, mesmo no seu campo de ataque');

    if (!teamB) erro('TeamB não vai à bola solta por "estar a atacar" — mas não tem portador');
    else ok('TeamB vai à bola solta, mesmo tendo a posse nominal');

    if (!teamA && !teamB) erro('NINGUÉM vai à bola: é exactamente o encrave de novo');
}

/*
2 — AS GUARDAS CONTINUAM A VALER COM PORTADOR.

Elas não estavam erradas: existem para a equipa não subir o bloco atrás de
quem tem a bola. O que estava errado era aplicarem-se a uma bola no chão.
*/
console.log(String.fromCharCode(10) + '2 — com portador, as guardas mantêm-se');
{
    const aAtacar = deveMandarChaser({
        isAttacking: true, bolaSolta: false, bolaZ: 10, dir: 1,
        pressaoAlta: false, gkTemBola: false
    });
    if (aAtacar) erro('quem ataca, com portador, não devia mandar chaser');
    else ok('a atacar com portador: não persegue');

    const campoDeAtaque = deveMandarChaser({
        isAttacking: false, bolaSolta: false, bolaZ: 30, dir: 1,
        pressaoAlta: false, gkTemBola: false
    });
    if (campoDeAtaque) erro('sem pressão alta não se persegue no campo de ataque');
    else ok('sem pressão alta, no campo de ataque: não persegue');

    const campoDeDefesa = deveMandarChaser({
        isAttacking: false, bolaSolta: false, bolaZ: -30, dir: 1,
        pressaoAlta: false, gkTemBola: false
    });
    if (!campoDeDefesa) erro('no próprio campo de defesa tem de perseguir');
    else ok('no próprio campo de defesa: persegue');

    const pressaoAlta = deveMandarChaser({
        isAttacking: false, bolaSolta: false, bolaZ: 30, dir: 1,
        pressaoAlta: true, gkTemBola: false
    });
    if (!pressaoAlta) erro('com pressão alta persegue-se em todo o campo');
    else ok('com pressão alta: persegue em qualquer sítio');
}

/*
3 — O GUARDA-REDES COM A BOLA NAS MÃOS é a única excepção absoluta.
*/
console.log(String.fromCharCode(10) + '3 — guarda-redes com a bola');
{
    const casos = [
        ['bola solta', { isAttacking: false, bolaSolta: true, bolaZ: -30, dir: 1, pressaoAlta: true, gkTemBola: true }],
        ['a defender', { isAttacking: false, bolaSolta: false, bolaZ: -30, dir: 1, pressaoAlta: true, gkTemBola: true }]
    ];
    let mau = 0;
    for (const [nome, o] of casos) {
        if (deveMandarChaser(o)) { erro(`${nome}: não se vai ao GR com a bola nas mãos`); mau++; }
    }
    if (!mau) ok('nunca se persegue o guarda-redes que tem a bola');
}

/*
4 — VARRIMENTO: com a bola solta, há SEMPRE alguém a ir.

Percorre o campo todo e as duas equipas. Se houver um só ponto onde nenhuma
das duas quer ir, é um encrave à espera de acontecer.
*/
console.log(String.fromCharCode(10) + '4 — varrimento do campo com a bola solta');
{
    let mortos = 0;
    for (let z = -53; z <= 53; z += 1) {
        for (const posse of ['TeamA', 'TeamB']) {
            const a = deveMandarChaser({
                isAttacking: posse === 'TeamA', bolaSolta: true, bolaZ: z, dir: 1,
                pressaoAlta: false, gkTemBola: false
            });
            const b = deveMandarChaser({
                isAttacking: posse === 'TeamB', bolaSolta: true, bolaZ: z, dir: -1,
                pressaoAlta: false, gkTemBola: false
            });
            if (!a && !b) mortos++;
        }
    }
    if (mortos) erro(`${mortos} pontos do campo onde NINGUÉM vai à bola solta`);
    else ok('em todo o campo, com a bola solta, há sempre quem vá buscá-la');
}

console.log('');
if (falhas) {
    console.error(`FALHOU: ${falhas} problema(s).`);
    process.exit(1);
}
console.log('OK: bola solta tem sempre quem a vá buscar; as guardas valem com portador.');
