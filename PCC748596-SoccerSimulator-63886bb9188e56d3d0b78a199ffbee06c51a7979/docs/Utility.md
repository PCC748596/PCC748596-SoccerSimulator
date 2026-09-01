# Guia de Utility e Tomada de Decisão (Números e Multiplicadores)

Este documento detalha como a IA do jogo avalia matematicamente cada ação (Passe, Cruzamento, Chute, Lançamento, etc). O motor de decisão usa um sistema de pontuação (Utility System), onde a IA lista todas as opções possíveis, calcula uma "nota" (score) para cada uma com base no contexto (distância, adversários, estilo de jogo), e escolhe a opção com a maior pontuação.

---

## 1. Passes (Passe Normal)
Acontece na função `findPassTarget` e avalia todos os companheiros de equipe.

### Limites Rígidos (Quem é descartado na hora)
- **Distância Mínima:** 2.0 metros (não toca para quem está colado).
- **Distância Máxima Base:** `Math.max(10, skill_de_passe * 0.6)`. Um jogador com passe 80 alcança até 48 metros.
- **Distância Máxima (Goleiro/Zagueiro):** O Goleiro ou Zagueiro podem avaliar passes em até **60.0 metros**, permitindo que encontrem pontas abertos no campo.
- **Linha de Passe Interceptada:** Se o adversário mais próximo da linha que liga o passador ao recebedor estiver a menos de um limite de segurança (depende do skill de Interceptação do adversário vs Passe do jogador), o passe é abortado.
- **Fora de Campo:** Alvos projetados para fora das quatro linhas são ignorados.

### Cálculo da Pontuação (Score)
Se o passe for viável, ele ganha uma nota base e vários modificadores:
1. **Nota Base de Distância (`notaDistanciaPasse`):** 
   - Varia de 0 a 100.
   - Pesa a distância do passe junto com as instruções táticas (Estilo de posse vs Contra-ataque/Verticalidade).
2. **Qualidade da Linha de Passe:**
   - Ganha bônus de até `+50` pontos quanto mais limpa for a trajetória da bola (adversários longe da linha).
3. **Marcação do Recebedor (O Peso do Espaço Absoluto):**
   - **`+300` pontos** se o companheiro tiver **mais de 4.0m** de distância de qualquer adversário (Bônus Esmagador para jogadores completamente livres, como laterais e pontas).
   - **`+100` pontos** se tiver **mais de 2.5m** de distância.
   - **`-550` pontos** se tiver **menos de 2.5m** de um adversário E estiver no campo de defesa. Erro fatal, joga a nota pro chão para evitar passe no fogo na zaga.
   - **`-165` pontos** se tiver **menos de 2.5m** de um adversário no campo de ataque.
4. **Bônus de Posição / Progressão:**
   - **`+20` a `+30` pontos** para alas/pontas (LMF, RMF, LWF, RWF, LB, RB) se a intenção for abrir o jogo (`prioridade: lado`).
   - A pontuação final é multiplicada pela progressão de campo: Passes para a frente multiplicam a nota de progressão, passes para trás ganham penalidades dependendo do estilo de jogo.

---

## 2. Passes Sob Pressão (Relaxed & Desperate)
Quando o jogador está cercado e pressionado, ele abandona a busca pelo "passe perfeito" e tenta se salvar.

### Passe Relaxed (Pressão Média)
- Reduz as exigências da linha de passe.
- Ainda pontua baseado em quão livre o companheiro está (usando os mesmos pesos massivos de `+300` e `-500` da marcação).
- Valoriza mais o fato de tirar a bola da "zona de confusão".

### Passe Desperate (Pressão Máxima / Pânico)
- Se o jogador estiver prestes a ser desarmado e o tempo de decisão estourar.
- **Ignora a linha de passe completamente:** Ele não olha mais se a bola vai ser interceptada no caminho, ele apenas quer jogar a bola para quem quer que esteja livre (`distMarcador * 5`).
- Limite de distância fixo de 35.0m (passe curto a médio).

---

## 3. Lançamentos (Through Balls)
O motor não tem uma função separada que avalie o lançamento desde o zero. O lançamento é um modificador aplicado em cima do resultado do passe normal.

- **Gatilho:** Se após o `findPassTarget` escolher o alvo ideal, a distância até o alvo for **maior que 25.0 metros**, o motor transforma a ação automaticamente em um `ThroughBall` (Passe em Profundidade / Lançamento).
- O passe vira uma bola alta (`throughBallAlto = true`).

---

## 4. Cruzamentos (Crosses)
Os cruzamentos são filtrados rigidamente por zonas e condições antes de sequer pontuarem.

### Condições para o Gatilho (`CrossModel`)
1. **Posição do Portador (Zona de Cruzamento):** 
   - Precisa estar na ala: `Abs(X) > 20.0 metros` (Perto das laterais).
   - Precisa estar no fundo do campo: `Z > 35.0 metros` (Referencial de ataque. O campo de ataque termina em 53m).
2. **Alvos na Área:**
   - O cruzamento **não acontece** se não houver um atacante ou médio ofensivo correndo para dentro da área. O alvo precisa estar dentro da grande área adversária (`Abs(X) < 12` e `Z > 35`).
3. **Decisão:** Se as duas condições forem satisfeitas, a IA usa o modificador de `EstiloBase.cruzar` do jogador para aumentar as chances dele realizar a ação em vez de tocar para trás ou conduzir.

---

## 5. Finalizações (Chutes / Shots)
A decisão de chutar avalia o risco/recompensa.

### Gatilhos e Limites
- **Distância Máxima:** Cerca de 30 metros (depende do atributo de Força do Chute e Finalização).
- **Cone de Visão (Clear Sight):** A IA traça retas entre a bola e as duas traves da baliza adversária.
- Se o cone entre o jogador e as traves estiver entupido de zagueiros (interceptação da reta), a nota do chute cai drasticamente.
- Se houver uma fresta clara, a nota multiplica de acordo com a habilidade do jogador e a proximidade. Atacantes com estilo de jogo específico ganham multiplicadores extras (`EstiloBase.remate: 1.2` a `1.5`).

---

## 6. Condução (Carry / Drible)
A condução não ganha notas como um passe, ela é uma avaliação de espaço livre contínuo no `fsm.js` (Máquina de Estados).

- A IA avalia o **Espaço à frente**: Distância até o obstáculo (adversário) mais próximo no corredor de condução.
- **Risco:** Se o adversário estiver a menos de X metros, ele pondera tentar o drible (dependendo do atributo de Drible) ou abortar e acionar as rotinas de passe.
- **Verticalidade:** Táticas de campo determinam se a condução será feita para a linha de fundo, cortando para o meio, ou protegendo a bola girando de costas.

---

## 7. Multiplicadores de Estilos de Jogo (Playing Styles)
Os Estilos de Jogo (Configurados em `EstiloBase` no `config.js`) são multiplicadores cruciais que entram multiplicando a pontuação base da decisão.

*Exemplo de Multiplicadores Base `1.0 = Neutro`*
- **Prolific Winger (Ponta):** `conduzir: 1.35` (35% mais chance de não passar e preferir carregar), `cruzar: 1.25`, `avanco: +15` (Mete-se lá na frente).
- **Target Man (Pivô):** `remate: 1.2`, `seguraBola: true`.
- **Anchor Man (Volante Cabeça de Área):** `lancar: 0.5` (Reduz pela metade a chance de arriscar um passe de +25m), `pressao: 1.25` (Desarma e toca curto).
- **Classic No. 10:** `passe: 1.4` (Aumenta a nota de todos os passes vistos em 40%), `conduzir: 0.55` (Corre pouco com a bola, prefere ditar o ritmo de passe).

---

## 8. Defesa e Pressão
A avaliação para "bater a carteira" (Tackle/Desarme) depende da distância:
- **Fecho Z / Fecho Lateral:** A equipe defensivamente empacota o meio campo (`LineShape.fecho.semBola` reduz o tamanho horizontal e vertical do bloco de marcação).
- Se a bola entra na zona de pressão (`distanciaPorPressao`: de 1.5m a 4.5m dependendo da Mentalidade), os jogadores saem do bloco e acionam o `Tackle`.
- **Match-up de Desarme:** Se o jogador chegar perto o suficiente da bola, roda um dado comparando a `Defesa/Desarme` do defensor contra o `Controle de Bola/Drible` do atacante. Se ganhar, muda o dono da bola (posse). Se perder, pode fazer falta ou ficar para trás.
