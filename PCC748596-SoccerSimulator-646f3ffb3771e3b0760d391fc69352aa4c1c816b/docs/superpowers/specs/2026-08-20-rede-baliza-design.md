# Rede da baliza: malha deformável e ondulação após o impacto

Data: 2026-08-20

## Problema

A rede não reage quando a bola lhe bate. O pano fica imóvel, e o golo perde o
sinal visual que o torna legível.

A **física já existe e funciona**. `Match.colidirComRede` (`js/match.js:1624`)
empurra a bola para dentro do pano, absorve a componente normal da velocidade
(`GoalNet.restituicao`, 0.12) e trava a tangencial (`GoalNet.atrito`, 0.72). O
pano de trás é inclinado — 0.8 m de profundidade no topo, 2.0 m na base — e é
essa inclinação que faz a bola descer até ao chão em vez de parar onde bateu.
Confirmado com o utilizador: a trajectória da bola está certa.

O que falta é a reacção visual, e a razão é estrutural: cada face da rede é um
quad de **quatro vértices**, dois triângulos (`js/match.js:434-440`):

```js
function criarFaceRede(p1, p2, p3, p4, repX, repY) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...p1, ...p2, ...p3, ...p4]), 3));
    ...
}
```

Uma malha assim não pode deformar-se. É uma chapa rígida com textura de rede.

## Solução

Duas peças independentes: dar vértices à rede, e fazer esses vértices ondular.

### Malha subdividida

`criarFaceRede` passa a gerar uma grelha de `(nu+1) × (nv+1)` vértices por
interpolação bilinear dos mesmos quatro cantos:

```
P(u, v) = (1-u)(1-v)·p1 + u(1-v)·p2 + (1-u)v·p3 + uv·p4
```

Bilinear, e não um `THREE.PlaneGeometry` transformado: as faces são trapézios e
planos inclinados (ver os cantos `tLE`/`tTE`/`bTE` em `js/match.js:459-462`), não
rectângulos, e a interpolação dos cantos reproduz qualquer um deles.

Os quatro cantos, as UVs e o aspecto em repouso ficam idênticos aos de hoje: só
há mais vértices entre eles. A ordem dos cantos mantém-se a que o código já usa
— `p1` em `(u=0, v=0)`, `p2` em `(1, 0)`, `p3` em `(0, 1)`, `p4` em `(1, 1)`,
que é o que os índices actuais `[0,1,2, 1,3,2]` implicam.

Segmentos por face, em `GoalNet`:

```js
segmentosU: 16,   // ao longo da largura
segmentosV: 6,    // ao longo da altura/profundidade
segmentosLateralU: 8,
```

Os laterais são estreitos e levam menos divisões ao longo de `u`. Ao todo, 8
faces nas duas balizas, cerca de 600 vértices.

### Ondulação

Ficheiro novo, `js/goal_net.js`, com o objecto `NetWave`. Fica de fora do
`match.js`, que já é grande, e a parte matemática é pura e testável.

**Posições de repouso.** A deformação nunca é aplicada sobre a geometria
corrente: cada face regista as suas posições de repouso num `Float32Array`
próprio, e cada frame reescreve `position` a partir delas. A rede volta sempre
exactamente ao lugar, sem deriva acumulada ao fim de vários golos.

**A onda.** O deslocamento é ao longo da normal da face:

```
desloc(t, u, v, amplitude) = amplitude · e^(−t/tau) · sin(omega·t + k·(u + v))
```

`u` e `v` são as coordenadas da grelha em 0..1, portanto a fase varia ao longo do
pano e a ondulação percorre-o na diagonal, em vez de o pano inteiro subir e
descer em bloco. É a ondulação do pano inteiro que o utilizador escolheu: sem
foco no ponto de impacto, e por isso sem precisar de saber onde a bola bateu.

`tau` sai de `duracaoOnda` para a envolvente ser desprezável no fim:
`tau = duracaoOnda / 4`, o que deixa `e^-4 ≈ 1.8%` da amplitude aos 5 s.

**Disparo.** `Match.colidirComRede` já sabe quando houve contacto e com que
velocidade. Chama `NetWave.bater(zSinal, intensidade)`, com a intensidade
proporcional à velocidade normal absorvida no impacto — um remate forte abana
mais do que uma bola mansa, sem constante nova a inventar. A intensidade é
limitada a 1 para um canhão não fazer a rede explodir.

Um novo impacto durante uma onda activa reinicia o relógio e fica com a maior
das duas amplitudes, em vez de as somar: somar deixaria a rede a crescer sem
limite numa sequência de remates.

**Custo.** `NetWave.update(dt)` corre no `Match.update`, mas **sai
imediatamente quando nenhuma baliza tem onda activa**. Em repouso o custo é uma
comparação por frame, e a malha mais densa não pesa nada enquanto ninguém
marcar. Terminada a onda, as posições de repouso são reescritas uma última vez e
a face é marcada como parada.

### Interface

```js
NetWave.registarFace(mesh, zSinal, normal)   // no arranque, por face
NetWave.bater(zSinal, intensidade)           // 0..1
NetWave.update(dt)                           // no laço do Match
NetWave.deslocamento(t, u, v, amplitude)     // pura, testável
```

### Constantes

Em `GoalNet`, ao lado de `restituicao` e `atrito`:

```js
segmentosU: 16,
segmentosV: 6,
segmentosLateralU: 8,
duracaoOnda: 5.0,      // segundos até parar
amplitudeMax: 0.28,    // metros, no impacto mais forte
frequencia: 7.0,       // rad/s da oscilação
ondasPorPano: 2.5,     // quantas cristas cabem na diagonal do pano
velocidadeCheia: 22.0, // velocidade normal (m/s) que dá amplitude 1
```

## Consequência a assumir

`duracaoOnda` é 5 s, e o estágio 0 da sequência de golo dura 4.5 s
(`js/match.js:1997`). A rede ainda estará a oscilar, de forma quase
imperceptível, quando o jogo recomeça. Foi o número pedido e fica assim.

## Alcance

Modificados:

- `js/config.js` — `GoalNet` ganha as sete constantes acima.
- `js/match.js` — `criarFaceRede` gera a grelha e regista cada face no
  `NetWave`; `colidirComRede` dispara `NetWave.bater`; `Match.update` chama
  `NetWave.update(dt)`.
- `index.html` — carrega `js/goal_net.js` antes de `js/match.js`.

Criado:

- `js/goal_net.js` — o objecto `NetWave`.
- `tests/goal_net.test.js`.

Inalterados de propósito:

- `GoalNet.restituicao`, `GoalNet.atrito`, `profTopo`, `profBase` e toda a
  `colidirComRede` fora da linha do disparo. A trajectória da bola está certa e
  não é para mexer.
- `GoalFrame` e a colisão com postes e travessão.
- A textura da rede e o material.

## Testes

Novo ficheiro `tests/goal_net.test.js`, no padrão dos restantes: recorta as
funções reais dos ficheiros de origem e corre-as num sandbox `node:vm`. Como
`NetWave.deslocamento` é pura e não toca em `THREE`, é recortada e testada
directamente.

- `deslocamento` é zero em `t = 0`, para qualquer `u` e `v`: a rede parte do
  repouso em vez de saltar no primeiro frame.
- A envolvente decai: o máximo de `|deslocamento|` numa janela tardia é menor do
  que numa janela inicial.
- Em `t = duracaoOnda` o deslocamento está abaixo de 2% da amplitude.
- Amplitude maior dá deslocamento proporcionalmente maior — a função é linear na
  amplitude.
- Pontos diferentes do pano estão em fases diferentes no mesmo instante: com
  `u+v` distintos, os deslocamentos diferem. É isto que faz ondular em vez de
  subir em bloco.
- A grelha bilinear reproduz os quatro cantos exactos nas quatro esquinas.
- A grelha tem `(nu+1)*(nv+1)` vértices e `nu*nv*6` índices.
- Um ponto interior da grelha cai dentro da envolvente dos quatro cantos.
- `bater` converte velocidade em amplitude, satura em 1 acima de
  `velocidadeCheia`, e nunca devolve negativo.
- Dois impactos seguidos ficam com a maior amplitude, não com a soma.
