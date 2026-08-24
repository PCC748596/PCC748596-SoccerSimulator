/*
Camada Reach: o membro chega mesmo onde é mandado.

Este é o primeiro teste de animação deste projecto que MEDE em vez de olhar
para constantes: o `three` (r128) está nas devDependencies e carrega em node,
portanto constrói-se um rig sintético com a mesma hierarquia e os mesmos
comprimentos do `buildBody` (player.js) e corre-se o `ik.js` e o `reach.js` a
sério.

O que se garante:
  1. alvo ao alcance      -> a ponta fica em cima dele
  2. alvo fora de alcance -> o membro fica ESTICADO e apontado lá
  3. o joelho e o cotovelo nunca dobram ao contrário
  4. nada fica fora dos JointLimits
  5. a cintura acrescenta alcance
  6. `pontaNoMundo` é a posição real do osso, não uma estimativa
*/
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

/*
Carrega os ficheiros de produção como scripts clássicos, no mesmo scope — é
assim que o jogo os corre (ver "Como está montado" em docs/filesSummary.md).
*/
const ambiente = { THREE, BallPhysics: { raio: 0.11 }, Match: null, console };
const carregar = (ficheiros, exportar) => new Function(
    ...Object.keys(ambiente),
    `${ficheiros.map(ler).join(LF)}; return { ${exportar.join(', ')} };`
)(...Object.values(ambiente));

const mod = carregar(
    ['js/joint_limits.js', 'js/ik.js', 'js/reach.js'],
    ['JointLimits', 'IK', 'IKChains', 'Reach', 'ReachModel']);
const { JointLimits, IK, IKChains, Reach, ReachModel } = mod;

/*
Rig sintético: mesma hierarquia, mesmas posições locais e mesma escala do
buildBody. Se as proporções lá mudarem, este teste passa a medir outra coisa —
por isso os comprimentos são verificados contra o IKChains no fim.
*/
const ESCALA = (1.8 / 5.5) * 0.9;

function novoJogador() {
    const corpo = new THREE.Group();
    corpo.scale.set(ESCALA, ESCALA, ESCALA);

    const pelvis = new THREE.Group();
    pelvis.position.set(0, 2.6, 0);
    corpo.add(pelvis);

    const chest = new THREE.Group();
    chest.position.set(0, 0.9, 0);
    pelvis.add(chest);

    const rig = { pelvis, chest };

    const braco = (x, pre) => {
        const grp = new THREE.Group(); grp.position.set(x, 0.525, 0); chest.add(grp);
        const elb = new THREE.Group(); elb.position.y = -1.0; grp.add(elb);
        const mao = new THREE.Group(); mao.position.y = -0.8; elb.add(mao);
        grp.rotation.z = x < 0 ? -Math.PI / 16 : Math.PI / 16;
        rig[pre + 'Arm'] = grp; rig[pre + 'Elbow'] = elb; rig[pre + 'Hand'] = mao;
    };
    const perna = (x, pre) => {
        const grp = new THREE.Group(); grp.position.set(x, -0.3, 0); pelvis.add(grp);
        const joe = new THREE.Group(); joe.position.y = -1.0; grp.add(joe);
        const pe = new THREE.Group(); pe.position.y = -0.9; joe.add(pe);
        grp.rotation.z = x < 0 ? -Math.PI / 32 : Math.PI / 32;
        rig[pre + 'Leg'] = grp; rig[pre + 'Knee'] = joe; rig[pre + 'Foot'] = pe;
    };
    braco(0.8, 'l'); braco(-0.8, 'r');
    perna(0.4, 'l'); perna(-0.4, 'r');

    corpo.updateWorldMatrix(true, true);
    return { model: corpo, rig };
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

/*
0 — o rig do teste bate com o que o IK assume.
*/
{
    const p = novoJogador();
    const cB = IKChains.braco, cP = IKChains.perna;
    if (Math.abs(-p.rig.lElbow.position.y - cB.L1) > 1e-9 ||
        Math.abs(-p.rig.lHand.position.y - cB.L2) > 1e-9) {
        erro('o braço do rig do teste não bate com IKChains.braco');
    }
    if (Math.abs(-p.rig.lKnee.position.y - cP.L1) > 1e-9 ||
        Math.abs(-p.rig.lFoot.position.y - cP.L2) > 1e-9) {
        erro('a perna do rig do teste não bate com IKChains.perna');
    }
    console.log(`rig: braço ${(cB.L1 + cB.L2).toFixed(1)} un = ` +
        `${((cB.L1 + cB.L2) * ESCALA).toFixed(2)} m; ` +
        `perna ${(cP.L1 + cP.L2).toFixed(1)} un = ${((cP.L1 + cP.L2) * ESCALA).toFixed(2)} m`);
}

/*
1 e 2 — grelha de alvos à volta do corpo. Dentro do alcance a ponta tem de
ficar em cima do alvo; fora dele, esticada e apontada lá.
*/
const _v = new THREE.Vector3(), _r = new THREE.Vector3();

const _lim = new THREE.Vector3();

/*
Um alvo só é ALCANÇÁVEL se estiver dentro do raio do membro E dentro do cone
anatómico da articulação. Um ponto a 20 cm da anca mas ATRÁS do jogador está
perto e continua a ser inalcançável sem o corpo rodar — o `limitarAlvo` puxa-o
para a borda do cone, e é para lá que a ponta vai.

Foi este o erro da primeira versão do teste: classificava por distância e
exigia depois que a ponta chegasse a alvos que a anca não alcança.
*/
function medir(cadeia, alvo) {
    const p = novoJogador();
    const c = Reach.cadeias[cadeia];

    const r = Reach.alcancar(p, cadeia, alvo, { peso: 1.0 });
    /*
    O alvo efectivo vem do resultado, e não de chamar o `limitarAlvo` à parte:
    a cintura roda ANTES do corte, portanto o alvo legal calculado num corpo
    ainda direito não é o mesmo. Foi assim que este teste acusou 43 cm de erro
    nos braços que afinal estavam certos.
    */
    const alvoLegal = r.alvo.clone();
    const cortadoPeloCone = alvoLegal.distanceTo(alvo) > 1e-6;

    p.model.updateWorldMatrix(true, true);

    Reach.pontaNoMundo(p, cadeia, _v);
    p.rig[c.raiz].updateWorldMatrix(true, false);
    _r.setFromMatrixPosition(p.rig[c.raiz].matrixWorld);

    return {
        p, res: r, cortadoPeloCone, alvoLegal,
        erroAoLegal: _v.distanceTo(alvoLegal),
        // Com o membro esticado, o erro angular entre (raiz->ponta) e
        // (raiz->alvoLegal) é o que interessa: não chegou, mas aponta lá.
        erroAngulo: _v.clone().sub(_r).angleTo(alvoLegal.clone().sub(_r)),
        distRaiz: _r.distanceTo(alvoLegal)
    };
}

console.log('\nalcance do membro (peso 1.0, alvos numa grelha à volta do corpo)');
for (const cadeia of ['peD', 'peE', 'maoD', 'maoE']) {
    const pRef = novoJogador();
    const membro = Reach.comprimentoDe(pRef, cadeia);

    let dentro = 0, piorDentro = 0, fora = 0, piorAngulo = 0, cone = 0;
    for (const dx of [-0.5, -0.25, 0, 0.25, 0.5]) {
        for (const dy of [0.1, 0.5, 1.0, 1.6]) {
            for (const dz of [-0.4, 0, 0.4, 0.8]) {
                const alvo = new THREE.Vector3(dx, dy, dz);
                const m = medir(cadeia, alvo);
                if (m.cortadoPeloCone) cone++;
                if (m.distRaiz <= membro * 0.98) {
                    dentro++;
                    piorDentro = Math.max(piorDentro, m.erroAoLegal);
                } else {
                    fora++;
                    piorAngulo = Math.max(piorAngulo, m.erroAngulo);
                }
            }
        }
    }
    console.log(`  ${cadeia}: membro ${membro.toFixed(2)} m | ` +
        `${dentro} alcançáveis, pior erro ${(piorDentro * 1000).toFixed(1)} mm | ` +
        `${fora} longe de mais, pior desvio ${(piorAngulo * 180 / Math.PI).toFixed(1)}° | ` +
        `${cone} cortados pelo cone`);

    if (piorDentro > 0.01) {
        erro(`${cadeia}: alvo alcançável e a ponta ficou a ${(piorDentro * 100).toFixed(1)} cm`);
    }
    if (piorAngulo > 12 * Math.PI / 180) {
        erro(`${cadeia}: fora de alcance e o membro aponta ${(piorAngulo * 180 / Math.PI).toFixed(1)}° ao lado`);
    }
    if (cone === 0) {
        erro(`${cadeia}: nenhum alvo cortado pelo cone — o limite anatómico não está a fazer nada`);
    }
}

/*
3 — o joelho e o cotovelo nunca dobram ao contrário.

Neste rig a flexão é `rotation.x` NEGATIVO (ver a convenção no topo do ik.js).
Positivo é a articulação a dobrar para o lado errado.
*/
{
    let maus = 0, pior = 0;
    for (const cadeia of ['peD', 'peE', 'maoD', 'maoE']) {
        const c = Reach.cadeias[cadeia];
        for (const dx of [-0.6, -0.2, 0.2, 0.6]) {
            for (const dy of [0.05, 0.6, 1.3]) {
                for (const dz of [-0.5, 0.3, 0.9]) {
                    const p = novoJogador();
                    Reach.alcancar(p, cadeia, new THREE.Vector3(dx, dy, dz), { peso: 1.0 });
                    const x = p.rig[c.meio].rotation.x;
                    if (x > 1e-6) { maus++; pior = Math.max(pior, x); }
                }
            }
        }
    }
    if (maus > 0) {
        erro(`${maus} poses com a articulação do meio dobrada ao contrário ` +
            `(pior ${(pior * 180 / Math.PI).toFixed(1)}°)`);
    } else {
        console.log('\njoelho/cotovelo: nunca dobram ao contrário');
    }
}

/*
4 — nada sai do envelope anatómico.

A raiz NÃO se verifica pelo Euler do quaternião: esse Euler mistura flexão,
abdução e rotação de forma que não se mapeia nos eixos do `JointLimits.hip`,
e compará-los é comparar coisas diferentes. Foi essa a confusão que fez a
primeira versão desta camada limitar a pose depois do IK e pôr o membro a um
metro do alvo.

O que se verifica é o que o envelope realmente garante:
  - o MEMBRO fica dentro do cone da articulação (ângulo ao repouso);
  - a DOBRADIÇA fica dentro do `JointLimits`, onde o mapeamento é directo;
  - o TRONCO fica dentro do `JointLimits.chest`, que é escrito por eixos.
*/
{
    const dentroDe = (grupo, eixo, v) => {
        const l = JointLimits[grupo] && JointLimits[grupo][eixo];
        return !l || (v >= l.min - 1e-6 && v <= l.max + 1e-6);
    };
    const _dir = new THREE.Vector3(), _raizP = new THREE.Vector3(), _meioP = new THREE.Vector3();
    let maus = 0, piorCone = 0;

    for (const cadeia of ['peD', 'peE', 'maoD', 'maoE']) {
        const c = Reach.cadeias[cadeia];
        const cone = Reach.cones[c.tipo];
        const maxCone = Math.max(cone.frente, cone.tras, cone.fora, cone.dentro);

        for (const dx of [-0.7, 0, 0.7]) {
            for (const dy of [0.05, 0.8, 1.7]) {
                for (const dz of [-0.6, 0.5, 1.0]) {
                    const p = novoJogador();
                    Reach.alcancar(p, cadeia, new THREE.Vector3(dx, dy, dz), { peso: 1.0 });
                    p.model.updateWorldMatrix(true, true);

                    // Ângulo do osso de cima ao repouso, no espaço do pai.
                    p.rig[c.raiz].updateWorldMatrix(true, false);
                    p.rig[c.meio].updateWorldMatrix(true, false);
                    _raizP.setFromMatrixPosition(p.rig[c.raiz].matrixWorld);
                    _meioP.setFromMatrixPosition(p.rig[c.meio].matrixWorld);
                    _dir.subVectors(_meioP, _raizP);
                    // O repouso do membro no mundo é o -Y do corpo.
                    const repouso = new THREE.Vector3(0, -1, 0)
                        .applyQuaternion(p.model.quaternion);
                    const ang = _dir.angleTo(repouso);
                    piorCone = Math.max(piorCone, ang);
                    if (ang > maxCone + 1e-3) {
                        erro(`${cadeia}: membro a ${(ang * 180 / Math.PI).toFixed(0)}° do repouso, ` +
                            `cone máximo ${(maxCone * 180 / Math.PI).toFixed(0)}°`);
                        maus++;
                    }

                    const flex = -p.rig[c.meio].rotation.x;
                    const grupo = (c.tipo === 'perna') ? 'knee' : 'elbow';
                    if (!dentroDe(grupo, 'x', flex)) {
                        erro(`${grupo} fora do limite: ${(flex * 180 / Math.PI).toFixed(0)}°`);
                        maus++;
                    }
                    if (!dentroDe('chest', 'y', p.rig.chest.rotation.y) ||
                        !dentroDe('chest', 'x', p.rig.chest.rotation.x)) {
                        erro('tronco fora dos limites do chest');
                        maus++;
                    }
                }
            }
        }
    }
    if (!maus) {
        console.log(`envelope anatómico: respeitado em toda a grelha ` +
            `(membro mais afastado do repouso: ${(piorCone * 180 / Math.PI).toFixed(0)}°)`);
    }
}

/*
5 — a cintura acrescenta alcance, que é a razão de ela entrar antes do membro.
*/
{
    const p = novoJogador();
    for (const cadeia of ['peD', 'maoD']) {
        const sem = Reach.alcanceDe(p, cadeia, false);
        const com = Reach.alcanceDe(p, cadeia, true);
        if (!(com > sem + 0.01)) {
            erro(`${cadeia}: a cintura não acrescenta alcance (${sem.toFixed(2)} -> ${com.toFixed(2)})`);
        } else {
            console.log(`${cadeia}: alcance ${sem.toFixed(2)} m sem cintura, ` +
                `${com.toFixed(2)} m com ela (+${((com - sem) * 100).toFixed(0)} cm)`);
        }
    }
}

/*
6 — `pontaNoMundo` é a posição REAL do osso. É disto que depende o contacto
não poder discordar da pose.
*/
{
    const p = novoJogador();
    Reach.alcancar(p, 'peD', new THREE.Vector3(0.3, 0.4, 0.5), { peso: 1.0 });
    p.model.updateWorldMatrix(true, true);
    Reach.pontaNoMundo(p, 'peD', _v);
    const real = new THREE.Vector3();
    p.rig.rFoot.getWorldPosition(real);
    if (_v.distanceTo(real) > 1e-9) {
        erro(`pontaNoMundo difere da posição real em ${_v.distanceTo(real)}`);
    } else {
        console.log('pontaNoMundo: é a posição real do osso');
    }
}

/*
7 — o teste de contacto usa o raio da ponta, e o pé é maior do que a mão.
*/
{
    if (!(ReachModel.raioPe > ReachModel.raioMao)) {
        erro('o raio do pé devia ser maior do que o da mão');
    }
    const p = novoJogador();
    if (Reach.raioDaPonta('peD') !== ReachModel.raioPe ||
        Reach.raioDaPonta('maoD') !== ReachModel.raioMao) {
        erro('raioDaPonta devolve o raio errado');
    }
    console.log(`contacto: pé ${ReachModel.raioPe} m, mão ${ReachModel.raioMao} m ` +
        `(o BallControl.reach do teste antigo é 0.9 m ao corpo)`);
}

if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} casos.`);
    process.exit(1);
}
console.log('\nOK: o membro chega onde é mandado, dentro dos limites do corpo.');
