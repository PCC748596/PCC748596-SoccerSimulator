# Nível Transversal: PlayingStylesBT

**Ficheiros principais:** `js/playing_styles.js`, `js/config.js` (e estendido pelas folhas do Nível 2 e Nível 3).

O "PlayingStylesBT" não é tecnicamente um nível rígido da árvore que corra antes ou depois das outras. Em vez disso, é uma **Camada Multiplicadora e Dinâmica** que altera a "personalidade" do jogador consoante o contexto do jogo.

Ele interceta os cálculos neutros do `PositionBT` (Nível 2) e do `PlayerBT` (Nível 3) e modifica-os usando características especializadas (como ser um *Fox in the Box*, um *Orchestrator*, ou um *Anchor Man*).

## Como está Implementado?

O sistema divide-se em **Resolução Neutra** e **Eventos Dinâmicos**:

1. **Catálogo (`config.js`)**
   Contém um repositório de perfis de jogadores. Cada estilo tem "pesos" que multiplicam certas vontades. 
   - *Exemplo: Um Target Man (Pivô) tem um multiplicador altíssimo para guardar a bola (`cadencia: 1.6`), enquanto um Poacher despacha-a ao primeiro toque (`cadencia: 0.6`).*

2. **A função `estiloAtivoDe(p)` (`playing_styles.js`)**
   Durante a execução do Nível 2 (Posicionamento) e do Nível 3 (Ação), sempre que uma decisão é ponderada, as árvores chamam `estiloAtivoDe(p)`:
   - Se um jogador está a tentar cruzar a bola, a probabilidade não é apenas estática; é multiplicada pela variável `cruzar` do seu estilo.
   - Na linha defensiva, a fórmula base lê o `recuoDefensivo` e dita se aquele jogador desce até à área mais rápido ou se se aguenta no meio-campo.

3. **Eventos Contextuais (`PlayingStyleEvents`)**
   Para evitar encher as Behavior Trees com milhares de `if (estilo === 'poacher')`, o sistema avalia as condições do terreno de jogo e emite transições de estado.
   - *Exemplo:* Se a equipa tem a bola e aproxima-se da área adversária, o sistema dispara o evento `POACHER_ON_SHOULDER`. 
   - O `PositionBT` capta essa alteração sem precisar de processar ifs monstruosos e apenas executa: "Posso avançar além da linha de fora de jogo no limite matemático da defesa."

## A Diferença em Jogo

Graças a esta estrutura:
- O **PositionBT** pode dizer que dois avançados centrais jogam na posição "CF". 
- Contudo, porque o "Playing Style" deles altera as matrizes em tempo real (ex: um sendo um Falso 9 e o outro um Caçador de Golos), o `PositionBT` acaba por descer o primeiro para perto dos médios para construir jogadas e encostar o segundo diretamente à linha defensiva adversária!

---

### Estrutura dos Eventos de Playing Styles (Código)

```javascript
const PlayingStyleEvents = {
    tick: function (bb) {
        if (typeof PlayingStyles === 'undefined') return;

        const linhaAdv = this._linhaUltimoDefensor(bb);

        for (const p of bb.own) {
            if (p.role === 'gk') continue;
            const est = estiloDe(p);
            if (!p.styleFlags) p.styleFlags = {};

            // Goal Poacher
            this._avaliar(p, 'ombroDefesa', est.ombroDefesa &&
                bb.isAttacking && linhaAdv !== null &&
                Math.abs(p.model.position.z * p.dirZ - linhaAdv) < 3.0,
                'POACHER_ON_SHOULDER');

            // Fox in the Box
            this._avaliar(p, 'naArea', est.dentroArea &&
                p.model.position.z * p.dirZ > CrossModel.areaZ &&
                Math.abs(p.model.position.x) < CrossModel.areaX,
                'FOX_IN_BOX');

            // Target Man
            this._avaliar(p, 'segurando', est.seguraBola && p.hasBall,
                'TARGET_MAN_HOLD');

            // Dummy Runner
            this._avaliar(p, 'aAtrair', est.atraiDefesa &&
                bb.isAttacking && bb.carrier && bb.carrier !== p &&
                p.model.position.distanceTo(bb.carrier.model.position) > 12.0,
                'DUMMY_RUN');

            // Hole Player
            this._avaliar(p, 'corridaNaArea', (est.avancoComBola >= 8) &&
                bb.isAttacking &&
                p.model.position.z * p.dirZ > CrossModel.areaZ - 6,
                'HOLE_RUN');

            // Cross Specialist
            this._avaliar(p, 'naLinha', est.colaNaLinha &&
                bb.isAttacking &&
                Math.abs(p.model.position.x) > CrossModel.alaX + 5,
                'CROSS_READY');

            // Roaming Flank / Prolific Winger
            this._avaliar(p, 'aFechar', est.cortaParaDentro &&
                bb.isAttacking &&
                Math.abs(p.model.position.x) < CrossModel.alaX,
                'WINGER_CUT_INSIDE');

            // Extra Frontman
            this._avaliar(p, 'subiu', est.juntaSeAoAtaque &&
                bb.isAttacking && p.model.position.z * p.dirZ > 20,
                'DEFENDER_JOINS_ATTACK');

            // Destroyer
            this._avaliar(p, 'aPressionar', est.pressao >= 1.5 &&
                !bb.isAttacking && bb.oppCarrier &&
                p.model.position.distanceTo(bb.oppCarrier.model.position) < 6.0,
                'DESTROYER_PRESS');

            // Orchestrator / Anchor Man
            this._avaliar(p, 'recuado', (est.avanco <= -5) &&
                bb.isAttacking && p.model.position.z * p.dirZ < 0,
                'DEEP_PLAYMAKER_READY');
        }
    }
    // ...
}
```
