# Torcida viva — bancada que reage ao jogo

Data: 24 de Agosto de 2026

## O problema

O público são 15 000 adeptos em quatro `InstancedMesh` (um por canal de cor:
pele, camisa, calção, cabelo), com a pose sentada **fundida na geometria** e as
matrizes marcadas `StaticDrawUsage`. Não há hierarquia nem rig por adepto, não
há `update` por frame: o estádio é uma fotografia. Marca-se um golo e ninguém
levanta a cabeça.

Queremos três coisas:

1. Nunca ninguém está imóvel — há sempre uma oscilação de base.
2. Num ataque, metade da claque da equipa que ataca põe-se de pé, na
   expectativa.
3. Num golo, a claque que marcou levanta-se toda e salta; a que sofreu senta-se.

## Restrição que manda em todo o desenho

Reescrever 15 000 matrizes por frame, em quatro malhas, é 60 000 `setMatrixAt`
por frame na CPU. **Todo o movimento vive no vertex shader.** A CPU escreve
uniforms — e só quando o lance muda, não por frame. As matrizes de instância
nunca mudam, portanto o `StaticDrawUsage` de hoje continua correcto.

Consequência boa: os quatro draw calls de hoje mantêm-se. Não há malhas novas.

## As quatro poses

`Crowd._pecasSentadas` monta um esqueleto temporário de `Object3D`, aplica-lhe
os ângulos de `CrowdModel.pose`, deixa o THREE calcular as matrizes de mundo e
funde as caixas já transformadas. A pose é só um dicionário de ângulos, e é isso
que torna isto barato: generaliza-se a função para **receber** a pose e
chama-se quatro vezes.

| Pose | Ângulos | Papel |
|---|---|---|
| `sentado` | os de hoje | base — é o `position` da geometria |
| `idle` | sentado, tronco uns graus à frente | oscilação de repouso |
| `dePe` | idle do jogador (anca/joelho perto de zero) | expectativa no ataque |
| `festa` | de pé, ombros acima da cabeça | golo da sua equipa |

Como as quatro saem da mesma função, com as mesmas caixas pela mesma ordem, os
vértices **correspondem 1:1** e servem de morph target directo. A geometria
final por canal leva `position` (sentado) mais três atributos de vértice:
`aPosIdle`, `aPosDePe`, `aPosFesta`, e as normais correspondentes.

**Isto é a invariante que parte tudo se for quebrada.** Se uma pose gerar um
número diferente de vértices, o morph lê fora do sítio e os adeptos explodem em
picos. Tem teste próprio.

## O shader

Atributos por instância, sorteados uma vez no `build`, com o gerador de semente
que o `Crowd` já usa (a multidão tem de ser igual em cada arranque):

| Atributo | Papel |
|---|---|
| `aLimiar` | 0..1. Levanta-se se `aLimiar < fracção`. |
| `aFase` | 0..2 pi. Dessincroniza; sem isto 7 500 pessoas saltam em uníssono. |
| `aRitmo` | ~0.85..1.15. Multiplicador de velocidade, pela mesma razão. |
| `aClaque` | 0 = claque A, 1 = claque B. Já decidido por `Crowd.claqueEm`. |

Uniforms, escritos só quando o lance muda: por claque, `uFracAnt`, `uFracNova`,
`uTempoTroca`; global, `uTempo`, `uDurTransicao`, `uSalto`, e `uFesta` por
claque.

O estado de cada adepto sai de uma comparação, não de um valor guardado por
instância — é isso que evita reescrever atributos:

```glsl
float antes  = step(aLimiar, uFracAnt[claque]);
float depois = step(aLimiar, uFracNova[claque]);
float k = clamp((uTempo - uTempoTroca[claque]) / uDurTransicao, 0.0, 1.0);
float dePe = mix(antes, depois, smoothstep(0.0, 1.0, k));

// s em 0..2: 0 sentado, 1 de pé, 2 a festejar.
float s = dePe * (1.0 + uFesta[claque]);

vec3 pos = mix(position, aPosDePe,  clamp(s, 0.0, 1.0));
pos      = mix(pos,      aPosFesta, clamp(s - 1.0, 0.0, 1.0));

// Idle de base: sempre ligado, por cima de qualquer estado.
float osc = 0.5 + 0.5 * sin(uTempo * uRitmoIdle * aRitmo + aFase);
pos = mix(pos, mix(aPosIdle, aPosFesta, clamp(s - 1.0, 0.0, 1.0)),
          osc * uAmpIdle);

// Salto do golo, só a quem está de pé.
pos.y += uSalto * uFesta[claque] * dePe *
         abs(sin(uTempo * uRitmoSalto * aRitmo + aFase));
```

As normais levam o mesmo `mix` e são normalizadas — sem isso o sombreamento
denuncia a pose antiga.

Repouso, expectativa e golo são **o mesmo mecanismo com três valores de
fracção**. Não há casos especiais no shader.

## Os gatilhos

Toda a decisão fica numa função pura, sem Three.js dentro, portanto testável:

    CrowdTrigger.avaliar({ estado, posse, bolaZ, equipaQueMarcou, dt })
      -> { A: fracção, B: fracção, festa: 'A' | 'B' | null }

Por ordem de prioridade:

1. **Golo** (`Match.state === 'GOAL'`): quem marcou vai a `1.0` com festa; quem
   sofreu vai a `0.0`. Dura enquanto o estado for `GOAL`, que já vai até a bola
   voltar ao centro (`js/match.js`, `updateBall`).
2. **Ataque**: `posse === equipa` e bola no terço ofensivo dessa equipa vai a
   `0.5`. A outra claque fica em repouso: quem defende não se levanta.
3. **Repouso**: `0.08` — uma minoria fixa está sempre de pé, como num estádio a
   sério. Não é `0.0` de propósito.

**Histerese**, para a bancada não piscar numa disputa em cima da linha do terço:
entrar exige a condição verdadeira durante `entradaMin`, sair exige falsa
durante `saidaMin`, e uma vez de pé fica no mínimo `permanenciaMin`. Valores
iniciais 0.4 s / 1.5 s / 2.0 s, no `CrowdModel` junto das outras constantes.

O golo salta a histerese: é instantâneo em ambas as claques.

## Onde se mexe

| Ficheiro | Mudança |
|---|---|
| `js/crowd.js` | poses parametrizadas, atributos por instância, `onBeforeCompile`, `CrowdTrigger`, `Crowd.update(dt)` |
| `js/match.js` | uma chamada a `Crowd.update(dt)` dentro de `Match.update` |
| `js/config.js` | nada — as constantes do público já vivem no `CrowdModel` |

Nenhum outro ficheiro passa a saber do público. A ordem de carregamento não
muda: `crowd.js` continua depois do `match.js`. O `toggleFans` do `main.js`
continua a funcionar sem alteração, porque só mexe em `.visible`.

## Testes

Ficheiro novo `tests/crowd_vida.test.js`, no estilo dos que já existem: script
de node puro, que corre o `js/crowd.js` a sério com o `three` de node.

- **Contagem de vértices igual nas quatro poses**, por canal de cor. É a
  invariante do morph; se falhar, nada mais interessa.
- **Os atributos de morph existem** em todas as geometrias e têm o mesmo
  `count` que o `position`.
- **As poses são mesmo diferentes**: a de pé é mais alta do que a sentada, a de
  festa tem as mãos acima da cabeça. Sem isto um erro que gerasse quatro poses
  iguais passava despercebido.
- **`CrowdTrigger.avaliar`**: golo dá 1.0/0.0 com festa do lado certo; ataque dá
  0.5 só a quem ataca; repouso dá 0.08.
- **Histerese**: a bola a entrar e sair do terço em frames alternados não muda a
  fracção; a condição sustentada muda-a.
- **Determinismo**: dois `build` seguidos dão os mesmos `aLimiar` e `aFase`.

`tests/crowd.test.js` continua a passar sem alteração.

## Riscos assumidos

- **`onBeforeCompile` é frágil a versões do THREE.** Se o chunk que procuramos
  mudar de nome, a substituição falha em silêncio e o público volta a ser uma
  fotografia. Verificamos que a substituição aconteceu e, se não, `console.warn`
  — o modo de falha tem de ser ruidoso.
- Os adeptos são `castShadow: false`, portanto não há material de sombra a
  manter em sincronia com o morph. Se algum dia se ligarem sombras no público,
  o `customDepthMaterial` precisa do mesmo patch, ou a sombra fica na pose
  sentada com o corpo de pé.
- Três atributos de vértice extra por canal triplicam a memória da geometria.
  É geometria única, partilhada por 15 000 instâncias — na ordem das centenas de
  KB, irrelevante.

## Fora de âmbito

Som, cânticos, bandeiras, faixas, ondas de estádio, reacção a defesas, faltas ou
cartões. Nada disto é preciso para a bancada deixar de ser uma fotografia.
