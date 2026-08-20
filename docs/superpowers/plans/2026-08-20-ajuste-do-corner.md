# Ajuste do Corner e Outros Comportamentos (2026-08-20)

## Objetivos
1. **Escanteio (Corner Kick):** O batedor deve permanecer fora do campo virado para dentro enquanto a bola estiver no ar.
2. **Goleiro:** Após segurar a bola, o goleiro pode se movimentar (conduzir) para procurar o melhor passe ou chute em vez de ficar completamente parado.
3. **Laterais (LB, RB, LM, RM):** Devem abrir (ficar próximos à linha lateral) para receber a bola quando o jogo estiver do seu lado, e fechar (ir para o centro) quando a bola estiver do lado oposto.
4. **Zagueiros (CB):** Não devem passar à frente dos Meias (CM) durante a marcação.

## Proposta de Implementação

### 1. Escanteio (Batedor fora do campo)
- **Arquivo:** `js/fsm.js`
- **Ação:** 
  - Quando a bola é chutada no estado `SET_PIECE_TAKER` em um `CORNER_KICK`, alterar o estado do batedor para um novo estado: `WATCH_CORNER` (em vez de `MOVE_TO_POS`).
  - Adicionar o estado `WATCH_CORNER` no `update` da FSM: o jogador zera a velocidade, vira-se para a bola (usando `lookAtBola`) e transita para `IDLE` ou `MOVE_TO_POS` apenas quando a bola tocar no chão ou for tocada por outro jogador (`Match.ball.position.y < 0.5` ou `Match.lastTouchedPlayer !== this.player`).

### 2. Goleiro Movimentando-se
- **Arquivo:** `js/player.js` e/o `js/fsm.js`
- **Ação:**
  - Em `js/player.js` quando `this.gkEstado === 'segurando'`, permitir que a posição mude (se a FSM comandar `CARRY`), em vez de travar a velocidade ou o `lookAtBola` absoluto, ou tratar a animação de pernas para simular passos leves.
  - Como o BT do guarda-redes já decide `actCarry(ctx)`, vamos garantir que ele avance levemente e com a animação de correr/andar se tiver `velocity`.

### 3. Posicionamento de Laterais (LB, RB, LM, RM)
- **Arquivo:** `js/match.js` (Eventos `CB_HAS_BALL` / `CM_HAS_BALL`) e `js/bt/team_bt.js`.
- **Ação:**
  - Ajustar o `buildOutBias.x` (ou a lógica de Target no BT) para que os laterais do lado da jogada aumentem o seu X em direção à linha lateral ("abrir para receber").
  - Para os laterais do lado oposto, reduzir o X (aproximar do centro, "fechar").

### 4. Zagueiros (CBs) na Marcação
- **Arquivo:** `js/bt/team_bt.js` ou `js/config.js` (MarkingModel).
- **Ação:**
  - Limitar a profundidade de marcação dos CBs (`biasMaxPorSetor` ou na árvore de comportamento de defesa) para que o recuo da linha não os faça ultrapassar os CMs, ou para que eles não sigam adversários muito recuados no meio campo.

---
**Status:** Aguardando execução imediata conforme ordem "Aplica o plano".
