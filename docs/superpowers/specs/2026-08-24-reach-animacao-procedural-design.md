# Reach — alcançar a bola com o membro, proceduralmente

Data: 24 de Agosto de 2026

## Problema

Não há como fazer uma animação gravada por cada situação. Um jogador que corta
uma bola tem de **pôr o pé nela**, e daí decorre tudo o resto: a perna levanta,
o joelho dobra, a cintura gira, o tronco contrapesa. O mesmo para o
guarda-redes a esticar a mão.

Hoje isso só existe num sítio, e só para os braços.

## O que já existe

| ficheiro | estado |
|---|---|
| `js/ik.js` | IK de duas articulações com pole vector. Resolve braço **e** perna. `IKChains.perna` está definido e **não tem um único chamador**. |
| `js/gk_dive.js` | O guarda-redes já mergulha com IK nos braços, e o `defender` já lê a posição REAL da mão (`getWorldPosition`) em vez de a estimar. O princípio já está provado ali. |
| `js/joint_limits.js` | Limites anatómicos por articulação, ombro 3DOF acoplado. O cabeçalho diz: *"NADA disto está ligado ao código de animação ainda — é só a base de dados."* |
| `tools/proceduralHumanAnimationSystem.md` | O spec do sistema completo, já escrito. |

## Geometria do rig (lida de `buildBody`, player.js)

Hierarquia e comprimentos, em unidades do modelo:

```
pelvis (y = 2.6)
  ├─ lLeg/rLeg  (x = ±0.4, y = -0.3)   ─┐
  │    └─ lKnee/rKnee  (y = -1.0)       │ L1 = 1.0
  │         └─ lFoot/rFoot (y = -0.9)   ┘ L2 = 0.9
  └─ chest
       └─ lArm/rArm  (x = ±0.8, y = 0.525)  ─┐
            └─ lElbow/rElbow (y = -1.0)      │ L1 = 1.0
                 └─ lHand/rHand  (y = -0.8)  ┘ L2 = 0.8
```

`corpo.scale = (1.8 / 5.5) * 0.9 = 0.2945`, portanto em metros:

- **braço**: 1.8 × 0.2945 = **0.53 m** do ombro à mão
- **perna**: 1.9 × 0.2945 = **0.56 m** da anca ao pé

Em repouso todos os membros apontam para **−Y**, e a flexão do meio é
`rotation.x` NEGATIVO. O `ik.js` já assume isto.

**Número que importa para o resto do documento:** o `BallControl.reach` é
**0.9 m**, medido ao corpo. O braço alcança 0.53 m do ombro. O teste de
contacto actual é, portanto, bastante mais generoso do que o corpo consegue
ser — é isso que permite tocar a bola sem lhe chegar.

## Decisões tomadas

Três escolhas, todas do dono do projecto:

1. **Camada `Reach` genérica** primeiro, não um gesto específico. O corte com o
   pé e as defesas do GK passam a ser dois clientes dela.
2. **Camada aditiva com peso.** O ciclo de passada continua a correr; o Reach
   sobrepõe-se só na cadeia envolvida. O jogador continua a correr enquanto
   estica a perna, que é o que acontece num corte a sprintar. É o que o
   `gk_dive` já faz com `IK.resolverSuave`.
3. **A pose É o jogo.** O contacto passa a ser decidido pela posição real do
   pé/mão, como no `gk_dive.defender`.

## Desenho

### `js/reach.js` — uma camada, uma entrada

```js
Reach.alcancar(p, { cadeia, alvo, peso, contrapeso })
```

`cadeia` é `'peD' | 'peE' | 'maoD' | 'maoE' | 'ambasAsMaos'`.
`alvo` é um ponto do mundo. `peso` 0..1 mistura com a pose que já lá estava.

Quatro passos, **e a ordem é o que separa um gesto humano de um membro a rodar
sozinho**:

**1. Cintura e tronco primeiro.** `chest.rotation.y` gira e `.x`/`.z` inclinam
para aproximar a RAIZ do membro do alvo. A quantidade é proporcional a quanto o
alvo está fora do alcance confortável do membro:

```
folga = distância(raiz, alvo) − alcanceConfortável
contribuiçãoDaCintura = clamp(folga / alcanceMembro, 0, 1) × giroMax
```

Sem este passo a perna roda sozinha na anca e lê como um boneco articulado.

**2. IK do membro**, via `IK.resolverSuave`, com o pole vector por cadeia:

- **perna**: pole = frente do corpo → o joelho dobra para a frente;
- **braço**: pole = cima do mundo → o cotovelo fica por baixo da linha
  ombro-mão (é o que o `gk_dive` já usa).

**3. Contrapeso.** O braço oposto abre e sobe, a perna de apoio flecte. Escala
com a mesma `folga` do passo 1 — quanto mais extremo o alcance, mais
contrapeso.

**4. `JointLimits` aplicados** a todos os ossos tocados, incluindo o
`clampOmbro` elíptico. É a primeira vez que essa base de dados serve para
alguma coisa.

### Duas funções de apoio, e são elas que ligam isto ao jogo

```js
Reach.alcanceDe(p, cadeia)     // raio máximo, já com o que a cintura acrescenta
Reach.pontaNoMundo(p, cadeia)  // onde o pé/mão está MESMO
```

O BT usa `alcanceDe` para decidir se vale a pena tentar, em vez de um número
fixo. O contacto usa `pontaNoMundo`:

```
distância(ponta, bola) <= raioPonta + BallPhysics.raio
```

### Clientes, por esta ordem

1. **Corte/intercepção com o pé** (jogador de campo) — o caso pedido.
2. **Defesa de pé do guarda-redes**, sem mergulho — esticar a mão.
3. **Migrar o `gk_dive`** para usar a camada em vez do IK directo, para não
   haver duas maneiras de fazer a mesma coisa.

As fases 1 e 2 são o âmbito deste spec. A 3 fica registada e é trabalho
seguinte.

## Testes

`tests/reach_ik.test.js`. **O `three` (r128) carrega em node** — está nas
devDependencies e foi verificado. Constrói-se um rig sintético com a mesma
hierarquia e os mesmos comprimentos do `buildBody` e corre-se o `ik.js` e o
`reach.js` a sério. É a primeira vez que a animação deste projecto pode ser
testada por medição em vez de inspecção de constantes.

O que se mede:

1. **Alvo ao alcance** → a ponta fica a menos de 1 cm dele, para uma grelha de
   alvos à volta do corpo.
2. **Alvo fora de alcance** → o membro fica ESTICADO e apontado na direcção
   certa (o erro angular é ~0), em vez de dobrado ou a apontar a outro sítio.
3. **O joelho nunca dobra ao contrário** — `rotation.x` do joelho sempre ≤ 0,
   em toda a grelha de alvos.
4. **Nenhum osso fora dos `JointLimits`** depois do `alcancar`.
5. **A cintura acrescenta alcance**: `alcanceDe` com contrapeso > sem ele, e a
   ponta chega a alvos que o membro sozinho não alcançaria.
6. **`pontaNoMundo` bate com a posição real** do Object3D, que é o que garante
   que o teste de contacto não pode discordar da pose.

## Risco conhecido, e como o medimos

Com o contacto a depender de o membro lá chegar, **as intercepções vão
diminuir**: hoje o `BallControl.reach` de 0.9 m concede o toque a qualquer bola
a menos de 0.9 m do corpo, e um pé real alcança 0.56 m da anca.

Antes de dar por feito, mede-se a taxa de intercepções por jogo com e sem a
camada ligada, no mesmo binário. Se cair de mais, o ajuste é no `alcanceDe`
(quanto a cintura contribui) ou num raio de tolerância na ponta — **não** em
voltar ao teste de distância ao corpo, que é o defeito que isto vem corrigir.

## Fora de âmbito

- O sistema de camadas com máscaras do `proceduralHumanAnimationSystem.md`.
  Fica para quando houver gestos simultâneos a sério.
- Migrar o remate, o lateral e o cabeceio, que têm clips próprios e afinados.
- Posicionamento e decisão: o Reach executa o gesto, não decide se ele deve
  acontecer.
