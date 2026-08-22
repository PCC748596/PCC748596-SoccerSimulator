# Guia Completo do Sistema de Utility e Fórmulas de Decisão (Soccer Simulator)

Este documento destrincha o funcionamento matemático do motor de inteligência artificial do jogo. Todas as decisões (Passe, Cruzamento, Remate/Chute, Condução) utilizam uma árvore de comportamento (Behavior Tree) combinada com funções de *Utility*, onde cada ação candidata recebe uma **Nota (Score)** ou uma **Chance**, baseada em dezenas de fatores. A IA executa sempre a ação com a maior pontuação.

Abaixo estão as fórmulas, variáveis e modificadores exatos extraídos do código fonte (`player.js`, `player_bt.js`, `utils.js` e `config.js`). Use este documento como referência definitiva para regular (tunar) o comportamento dos jogadores.

---

## 1. Passes Normais (A Busca Pelo Alvo Ideal)

A função central é `findPassTarget` (`player.js`). O portador da bola avalia todos os companheiros de equipe e decide para quem tocar. 

### 1.1. Cortes Imediatos (Filtros Rígidos)
Antes sequer de receber nota, um alvo é sumariamente **DESCARTADO** se:
1. **Distância Mínima:** A distância até o companheiro (posição atual ou ponto futuro) for **menor que 2.0m** (ou a distância física real `< 3.0m`). Jogadores não passam para quem está colado.
2. **Distância Máxima:** O alvo estiver a mais de `Math.max(10, Skill de Passe * 0.6)` metros de distância. Um jogador com passe `80` enxerga companheiros a até `48 metros`. 
3. **Fora de Campo:** O ponto de destino projetado ficar a menos de `0.5m` da linha lateral ou de fundo.

### 1.2. Cálculo de Interceptação da Linha de Passe (Safety Limit)
A IA traça uma reta entre passador e recebedor e checa a distância do adversário mais próximo dessa reta (`minOppDist`). 
- **Limite Base:** `safetyLimit = 1.0 + (1.0 - (PASS_SKILL / 100)) * 0.6`
- **Fator do Marcador:** O interceptador altera o raio crítico baseado na habilidade dele de cortar o passe vs a habilidade do passador.
  `fatorIntercept = CLAMP(1 + (INTERCEPT_ADV - PASS_SKILL) / 150, 0.6, 1.6)`
- **Raio de Risco Final:** `safetyEff = safetyLimit * fatorIntercept`
  - *Se o jogador for "Orchestrator"*, ele vê brechas incríveis e corta esse limite em 70% (`safetyEff *= 0.3`).
- **Se `minOppDist < safetyEff`:** O passe é abortado imediatamente (arriscado demais, vai bater no defensor).

---

### 1.3. A Fórmula de Score do Passe (Somas e Subtrações)
Se o passe passar pelos filtros, ele começa a ganhar pontos a partir de um Score Base de `0`.

**A. Distância Base (`notaDistanciaPasse`)**
Uma função curva que dá uma nota de `0 a 100`, ponderando os sliders táticos (`circulacao` e `verticalidade`). Distâncias médias (~20m) costumam dar o pico de 100 pontos base.

**B. Bônus de Linha Limpa**
Se o adversário está longe da trajetória, o passe ganha pontos de conforto:
`Score += Min(50, Max(0, (minOppDist - safetyLimit) * 8))`

**C. Bônus Triangulação (Posição)**
Se o passe obedece a regras de fluxo posicional lógico (Ex: Goleiro -> Zagueiro, Lateral -> Ponta, Volante -> Meia), ele recebe um bônus fixo:
`Score += 40`

**D. Espaço do Recebedor (O Peso da Marcação Absoluta)**
Avalia quão livre está o cara que vai RECEBER a bola (`distMarcador`). Este é um dos maiores pesos do jogo:
- **`>= 4.0 metros`:** Bônus colossal de **`+300`** (Jogador totalmente livre).
- **`>= 2.5 metros`:** Bônus de conforto de **`+100`**.
- **`< 2.5 metros` (Marcado de perto):**
  - Goleiro (se ele for o alvo): **`-605`** (Evitar recuo na fogueira).
  - Defesa / Zona Defensiva: **`-550`** (Evitar erro que custa gol).
  - Restante do campo: **`-165`**.

**E. Progressão (Passes pra frente)**
Se a bola está avançando no campo (`progression > 0`):
- `ProgBonus = Min(25, progression * 0.9) * verticalidade_da_equipe`
- **Lançamento / Bola no Vazio:** Se o espaço à frente estiver limpo (nenhum adversário a menos de `8.0m` da linha), soma um bônus gigante dependendo da distância e agressividade da IA:
  `ProgBonus += 60 * (0.6 + Agressividade * 0.8) * Curva_de_Distancia`
- `Score += ProgBonus`

**F. Recuo (Passes pra trás)**
Se o passe for para trás (`progression <= 0`):
- *Orquestradores* AMAM recuar a bola para ditar ritmo: `Score += Abs(progression) * 0.8`.
- *Qualquer outro jogador*: É penalizado por estar atrasando: `Score -= Abs(progression) * 1.5 / circulacao_da_equipe`.

**G. Inversão de Jogo (Virada)**
- *Orquestrador:* Ganha **`+80`** se cruzar a bola para o flanco oposto (delta X > 20m).
- *Outros:* Ganham até **`+50`** (multiplicado pela tática de `viradas`) se o lado atual estiver muito congestionado de adversários e o lado do alvo estiver livre.

**H. Risco de Espirrar a Bola (Borda do Campo)**
Se o alvo projetado for muito perto da lateral ou linha de fundo (`< 3.2m`), o jogo aplica uma penalidade proporcional, deduzindo até **`120 pontos`**. O erro é mitigado se o passador tiver técnica/passe alto.

---

### 1.4. Os Multiplicadores do Passe (Aplicados ao Total Acumulado)

Depois de todas as somas acima, a nota final passa por multiplicadores cruciais:

1. **Jogada de Segurança (Lado ou Trás):** 
   Se o passe avançar menos de 2m e viajar pro lado (mais de 5m), ou se for explicitamente pra trás, ele ganha segurança: `Score *= 1.20`.
2. **Penalidade de Rotação (Apertado por Trás):**
   Se o passador precisar girar o corpo **mais de 120 graus** E houver um marcador apertando-o nas costas (`<= 2.0m`):
   - Se a nota era POSITIVA: `Score *= 0.80` (Abaixa o bônus).
   - Se a nota era NEGATIVA: `Score *= 1.20` (Piora o mal).
3. **Playing Style do Alvo:**
   O estilo de jogo de quem vai receber dita se ele se impõe na escolha.
   `Score *= alvo.PlayingStyle.passe` (Ex: Target Man (1.25), Classic No. 10 (1.4)).

---

## 2. Cruzamentos (`CrossModel` em `player_bt.js`)

Cruzamentos não usam a rotina de passes normal. Têm regras cravadas:

**A. Gatilhos de Existência (Se não atingir, não cruza):**
1. O cruzador deve estar na **Ala**: Abs(X) > `20.0m` (O campo vai até 34m no X).
2. O cruzador deve estar no **Fundo**: Z > `25.0m` (Z = 0 é meio campo, ataque vai até 53m).
3. Deve haver um companheiro (não Goleiro) dentro da **Área**: Abs(X) < `10.0m` e Z > `35.0m`.
4. O alvo deve estar a mais de `10.0m` de distância (senão é só um passe curto e rasteiro).

**B. Chance (Utility Score do Cruzamento):**
A chance final em porcentagem é o que dita se a IA vai optar pelo cruzamento.
`Chance = 30 (Base) + 10 por cada alvo extra na área`
`+ 15 * FatorLargura` (Quanto mais grudado na lateral, de 0 a 1, maior o bônus).
`+ 15 * FatorFundo` (Quanto mais perto da linha de fundo, de 0 a 1, maior o bônus).
- Se houver adversário em cima (Pressão a `< 2.0m`): `Chance -= 20`.
- Se a distância for muito grande (Excesso além de 18.0m): `Chance -= Distancia_Extra * 0.035`.
- **Tática de Equipe:** Tudo é multiplicado pela preferência tática (ex: `Wing Play` multiplica a chance pra cima).

---

## 3. Finalizações (Remates - `ShootingModel` e `emZonaDeRemate`)

O remate ocorre se o portador da bola entrar no modelo estrito e tiver o caminho razoável.
1. **Alcance Máximo de Chute:**
   O jogador avalia quão longe consegue mandar a bola baseado em seu atributo `KICKING_POWER`.
   - `baseRange = 12.0m` (Isso ele faz até com chute = 0).
   - `skillRange = 12.0m` (Bônus máximo extra no chute = 100).
   Ou seja, o alcance de chute vai de `12m a 24m`.
2. **Ângulo Ofensivo (Lateralidade):**
   Ele só chuta se `Abs(X) < 24.0m` (Ou seja, não chuta da linha de fundo encostado na bandeirinha, `maxOffsetX`).
3. **Decisão / Limpeza (Cone de Visão):**
   A IA traça um cone até os dois postes (traves). Se estiver muito entupido de defensores (`minOppDist` na linha da trave), a chance despenca, a não ser que ele seja um matador de alto nível. Defensores puros (CB, LB, RB) têm as chances cortadas pela metade (`defenderFactor: 0.55`) para não desperdiçarem a bola com chutes horríveis de longe, preferindo rodar a posse.

---

## 4. Condução de Bola (Carry / Drible)

Ao invés de uma "Nota Esmagadora", a condução compõe a IA medindo **Risco Constante**. Ela usa a fórmula `notaDireccaoCarry` em `utils.js`:

`Score de Condução = Espaço_Livre * PesoDaTecnica + Progresso_Frontal * PesoProgresso - PerigoSetor * PesoSetor`

- **Espaço Livre:** Quão longe ele pode avançar em linha reta antes de trombar num defensor. Se o espaço fecha (menos de `bloqueioDist = 14.0m` com `bloqueioMin = 2` oponentes na frente e largura de corredor `6.0m`), o jogador desiste da condução frontal e tenta priorizar passes para o lado/trás (`PassModel` regras).
- **Grace Period:** Jogadores ganham uma `carryTouchGrace` logo depois de dar um toque na frente, impedindo a máquina de estados de ficar engasgando ou piscando o passe enquanto a bola quica alguns metros adiante.

---

## 5. Falhas de Execução (Balística e Erros)

Mesmo depois da Utility decidir que um passe de Nota +400 vai ocorrer, entram as funções de falha motora:
- `PassModel.erroPesoMax: 0.18`: Um jogador de Pass = 0 erra a FORÇA da bola em até 18%. Com Pass = 80, o erro vira ~3.6%. 
- `PassErrorModel.sigmaMax: 0.16 (~9.2 graus)`: O passe sai com erro de direção (ângulo horizontal). A dispersão sobe absurdamente sob marcação (`pressaoMult: 1.8x`) ou se o jogador estiver passando de costas (`costasMult: 2.0x`). Um passe apertado de costas pode errar por muito e ir reto para o pé do zagueiro.
- `BallPhysics`: Todos os passes longos (mais de `20.0m`) usam `ThroughBall` e balística elevada (Passe Aéreo) para garantir a cobertura parabólica (24 a 25 graus), aterrizando levemente antes ou levemente a frente do alvo de acordo com o intuito do passe.
