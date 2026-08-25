# Editor de animação

Data: 25 de Agosto de 2026

## O problema

Os gestos do jogo — remate, chutão do guarda-redes, tiro de meta, lançamento
com as mãos, arremesso lateral — são clips de keyframes escritos à mão no
`js/config.js`. Cada keyframe é um objecto de ângulos em radianos:

```js
{ leanZ: -0.20, pelvisY: 0.32, chest: 0.32, coxaChute: 1.00, joelhoChute: 2.00, … }
```

Afinar isto hoje é editar números à mão, recarregar o jogo, provocar o lance e
tentar ver o gesto a passar. **Perceber o que cada número faz é o passo difícil**
— quantos radianos são "a coxa quase à horizontal", e para que lado.

## O que existe

Cinco clips, todos dados puros:

| Clip | Keyframes | Onde é usado |
|---|---|---|
| `ShotClip` | 12 | remate |
| `GoalkeeperKickClip` | 12 | chutão do GR |
| `GoalkeeperGroundKickClip` | 12 | tiro de meta (= `SetPieceGroundKickClip`) |
| `GoalkeeperThrowClip` | 12 | lançamento com as mãos do GR |
| `ThrowInClip` | 10 | arremesso lateral |

**Nem toda a animação é assim.** A passada (`animateBones`), as camadas
(`aplicarCamadaPeito`, `aplicarCamadaCabeceioDePe`), o `js/reach.js` e o
`js/gk_dive.js` são procedurais: código que calcula ângulos a partir de fases e
constantes, sem keyframes para editar. **Ficam de fora**, e a página di-lo, senão
parece que está partida.

## A peça que decide tudo: `js/pose.js`

As funções que AMOSTRAM os clips (`amostrarClipRemate` e companhia) já são
globais e reutilizáveis. As que APLICAM o keyframe ao esqueleto não: vivem
dentro de métodos do `FootballPlayer`, presas ao `this.rig` e ao `Match`.

> **Se o editor reimplementasse essa parte, mostrava a SUA interpretação dos
> números.** Afinava-se uma pose no editor e no jogo ficava outra, sem aviso —
> uma ferramenta que mente é pior do que não ter ferramenta.

Por isso extraem-se para funções puras, num `js/pose.js` novo:

```
aplicarPoseRemate(rig, K)
aplicarPoseChutaoGR(rig, K)
aplicarPoseChuteChaoGR(rig, K)
aplicarPoseLancamentoGR(rig, K)
aplicarPoseLateral(rig, K, opts)
construirCorpo(corCamisa, corCalcao)   ← sai de FootballPlayer.buildBody
```

Recebem o rig e um keyframe, escrevem rotações, não sabem o que é `Match` nem
`this`. **O `player.js` passa a chamá-las e o editor também: uma implementação
só.** É isto que impede a divergência.

O `buildBody` já hoje não usa nada da instância a não ser `this.backMat`, o que
torna a extração viável.

## A página

`animEditor.html`, ao lado do `teamBtView.html`, que já segue este padrão.

Carrega só: `three`, `js/config.js` (onde vivem os clips), `js/utils.js` e o
`js/pose.js`. **Não carrega** `match.js`, `player.js`, os BTs nem a FSM — não
precisa de um jogo para mostrar um boneco.

```
┌───────────────────────────────────────────────────────────┐
│ Clip: [ShotClip ▾]        [▶ play] [loop] velocidade ──o─ │
├───────────────────────────┬───────────────────────────────┤
│                           │ frame  1 2 3 4 5 6 7 8 9 …    │
│      boneco 3D            │             ▲ contacto        │
│      (órbita, chão)       ├───────────────────────────────┤
│                           │ coxaChute   ──o──────  0.30   │
│   ○ pose original         │   >0 perna atrás              │
│     (fantasma)            │ joelhoChute ────o────  0.70   │
│                           │   >0 calcanhar sobe           │
├───────────────────────────┴───────────────────────────────┤
│ [Copiar ShotClip]  [Repor do config.js]                   │
└───────────────────────────────────────────────────────────┘
```

Três coisas respondem directamente à dificuldade de perceber as rotações:

- **A legenda do sinal por baixo de cada slider.** O `config.js` já documenta
  isto em texto corrido (`coxaChute > 0 perna para TRÁS`); passa a estar debaixo
  do controlo que mexe.
- **Fantasma da pose original**, translúcido, com o clip como está no ficheiro —
  para se ver o que mudou sem ter de lembrar.
- **A linha do tempo marca o `contactFrame`**, o frame em que a bola sai do pé.
  Mexer numa pose sem saber onde é o contacto estraga o timing.

O `play` usa a amostragem do jogo e a `duration` real do `ActionAnimClips`,
portanto a velocidade a que se vê o gesto é a da partida.

## Exportar sem apagar o que lá está

Os clips do `config.js` não são só números: têm um cabeçalho que descreve as 12
fases do gesto e um comentário por keyframe (`// 4 armação máxima`,
`// 8 CONTACTO`).

> **Um exportador que cuspisse JSON destruía tudo isso ao colar.** É metade do
> valor do ficheiro.

Por isso o editor faz `fetch('js/config.js')`, guarda o texto original de cada
bloco e, ao exportar, **reescreve só os números, mantendo comentários e
formatação**. Aberto por `file://` o `fetch` falha: nesse caso avisa e exporta
sem comentários, em vez de os apagar em silêncio.

O caminho de volta ao jogo é copiar e colar, à mão. Nada de servidores nem de
`localStorage`: cada alteração passa pelo git como qualquer outra, e o que corre
é sempre o que está no ficheiro.

## Testes

A rede de segurança real da extracção são os testes que JÁ EXISTEM e tocam
nestas poses: `lateral_pose`, `gk_passada`, `remate_mira`, `cabecada_baixa`,
`reach_ik`. Correm a cada função extraída, uma de cada vez.

`tests/pose_partilhada.test.js` novo, para o que esses não cobrem:

- cada `aplicarPose*` escreve todas as juntas que promete e não toca noutras;
- a pose no `contactFrame` do remate tem a perna de chute esticada — é isso que
  define um contacto;
- as funções não dependem de `Match` nem de `this`: chamadas com um rig avulso,
  funcionam;
- os canais de cada clip batem certo com os que a função lê. Um canal a que
  ninguém liga é um número que não faz nada, e vale a pena saber quais são.

## Ordem de trabalho

1. `js/pose.js` com `construirCorpo` e uma `aplicarPose*` de cada vez, com os
   testes existentes a correr entre cada extracção.
2. `tests/pose_partilhada.test.js`.
3. `animEditor.html`: boneco, sliders, linha do tempo.
4. Play, fantasma e exportador.

O passo 1 é o único que mexe no jogo. Do 2 em diante nada do que existe é
tocado.

## Riscos assumidos

- **A refactorização do `player.js` é o risco desta peça, não o editor.** É o
  ficheiro mais delicado do projecto e as poses estão entrelaçadas com o
  `animateBones`.
- O `buildBody` sair da classe toca no construtor do `FootballPlayer`, por onde
  passa toda a criação de jogadores.
- O editor mostra um boneco isolado, sem bola, sem relvado a sério e sem
  adversários. Uma pose pode parecer bem ali e mal em jogo — o editor encurta o
  ciclo, não substitui ver o lance.

## Fora de âmbito

Animação procedural (passada, camadas, IK, mergulho do GR), criar clips novos,
apagar ou reordenar keyframes, curvas de interpolação (a amostragem é linear e
assim fica), e gravar directamente no `config.js`.
