Quero fazer uma alteração importante no sistema tático do meu jogo de futebol.

NÃO implemente novamente os Playing Styles dos jogadores. Eles já existem e devem permanecer exatamente como estão.

O objetivo desta tarefa é criar uma nova camada de comportamento coletivo para que as equipes deixem de atacar constantemente e passem a apresentar circulação de bola, movimentos pendulares, atração da defesa, viradas de jogo e ataques somente quando houver espaço.

## 1. TRANSFORMAR DEFESA / MISTO / ATAQUE EM MENTALIDADE

Atualmente meu jogo possui:

* Defesa
* Misto
* Ataque

Esses três conceitos devem deixar de ser chamados de "estilos".

Renomear conceitualmente para:

* Mentalidade Defensiva
* Mentalidade Equilibrada
* Mentalidade Ofensiva

A Mentalidade deve funcionar como um modificador de comportamento.

### Defensiva

* menor risco
* maior preocupação com estrutura
* maior valorização de passes seguros
* maior tendência a recuar e reorganizar
* menor agressividade

### Equilibrada

* equilíbrio entre circulação e progressão
* risco moderado
* circulação quando necessário
* progressão quando houver espaço

### Ofensiva

* maior agressividade
* maior número de jogadores participando do ataque
* maior aceitação de risco
* maior prioridade para progressão e finalização

IMPORTANTE:

A Mentalidade NÃO deve obrigar a equipe a atacar.

Uma equipe ofensiva também deve circular a bola se o ataque estiver congestionado.

---

# 2. CRIAR ESTILOS DE JOGO DA EQUIPE

Criar uma nova variável:

TeamPlayStyle

Começar somente com estes estilos:

* Possession
* Direct
* Counter Attack
* Wing Play
* Positional
* High Press

Não criar sistemas complexos para cada estilo.

Cada estilo deve apenas modificar os pesos das decisões coletivas.

Exemplo:

Possession:

* mais circulação
* mais passes seguros
* mais passes para trás
* mais viradas
* menor urgência para atacar

Direct:

* maior prioridade para passes verticais e longos
* menor circulação

Counter Attack:

* maior velocidade após recuperação
* maior prioridade para atacar espaços disponíveis

Wing Play:

* maior utilização dos corredores
* maior procura pelos lados
* maior probabilidade de cruzamentos

Positional:

* maior preocupação com ocupação das zonas
* maior circulação
* maior procura por superioridade

High Press:

* maior agressividade após perda
* maior pressão sobre o adversário

Esses estilos devem trabalhar junto com a Mentalidade.

Exemplo:

Possession + Mentalidade Ofensiva

é diferente de:

Possession + Mentalidade Defensiva.

---

# 3. CRIAR TEAM MOMENTUM

Criar um sistema simples de:

TeamMomentum

O Momentum representa a tendência atual da equipe no campo.

Ele deve perceber para qual lado a equipe está conduzindo o jogo.

Exemplo:

Momentum para a direita:

RIGHT ← 0 → LEFT

ou utilizar um valor normalizado:

-1 = esquerda
0 = centro
+1 = direita

O Momentum deve ser suavizado.

Ele não deve mudar instantaneamente a cada passe.

---

# 4. O PÊNDULO

Este é o comportamento mais importante da implementação.

Quando a bola estiver em um lado do campo, a equipe deve naturalmente deslocar parte da sua estrutura para esse lado.

Porém, NÃO deve mandar todos os jogadores para a bola.

Deve existir:

* jogadores próximos para apoio;
* jogadores no centro para conexão;
* jogadores do lado oposto mantendo amplitude.

Exemplo:

Bola na direita:

ESQUERDA       CENTRO        DIREITA

●             ● ●           ●
●             ●             ⚽
●

A equipe está inclinada para a direita, mas mantém jogadores disponíveis no lado esquerdo.

---

# 5. CIRCULAÇÃO QUANDO NÃO EXISTE ESPAÇO

Esse é o principal problema atual.

Hoje o sistema tende a:

receber bola
→ procurar ação ofensiva
→ avançar
→ avançar
→ atacar

Alterar isso.

Quando o setor da bola estiver congestionado e não existir uma boa opção ofensiva, a equipe deve preferir:

PASSE PARA TRÁS
→ PASSE LATERAL
→ APOIO
→ CIRCULAÇÃO
→ VIRADA

em vez de forçar:

PASSE VERTICAL
→ DRIBLE
→ CRUZAMENTO
→ CHUTE

Adicionar ao sistema de decisão coletivo o conceito:

SPACE AVAILABLE

Se houver espaço:

→ PROGRESS

Se não houver espaço:

→ CIRCULATE

Se o lado oposto estiver livre:

→ SWITCH

---

# 6. CONGESTIONAMENTO

Criar um cálculo simples de congestionamento dos lados do campo.

Por exemplo:

LeftCongestion
CenterCongestion
RightCongestion

O cálculo deve considerar principalmente a concentração de jogadores adversários naquela região.

Exemplo:

Left = 30
Center = 45
Right = 85

A direita está congestionada.

Se a bola estiver na direita e o lado esquerdo estiver livre, aumentar significativamente a prioridade de:

* passe para trás
* circulação
* inversão de jogo

---

# 7. VIRADA DE JOGO

Quando:

lado da bola = congestionado

e

lado oposto = livre

a equipe deve começar a preparar uma virada.

Não fazer necessariamente um lançamento imediato.

O comportamento desejado é:

BOLA NA DIREITA
↓
DIREITA CONGESTIONA
↓
PASSE PARA TRÁS
↓
APOIO
↓
PASSE PELO CENTRO
↓
ESQUERDA
↓
PROGRESSÃO

Isso deve criar o movimento de pêndulo.

---

# 8. MOMENTUM + ESPAÇO

O Momentum deve influenciar a intenção da equipe.

Se o Momentum está muito direcionado para a direita e a direita está ficando congestionada:

reduzir a agressividade naquela direção.

Se o lado esquerdo possui espaço:

aumentar a tendência de deslocamento da equipe para a esquerda.

Assim o comportamento deve ser:

DIREITA
→ congestionou
→ desacelera
→ circula
→ muda o Momentum
→ ESQUERDA
→ encontra espaço
→ acelera
→ ataca

Depois o processo pode acontecer novamente no sentido contrário.

Esse é o "pêndulo" que quero.

---

# 9. AGRESSIVIDADE DINÂMICA

Criar:

TeamAggression

Esse valor deve ser influenciado por:

* Mentalidade
* TeamPlayStyle
* Momentum
* espaço disponível
* congestionamento
* situação atual da posse

Não quero uma agressividade fixa.

Exemplo:

Equipe Ofensiva + espaço disponível:

→ agressividade alta

Equipe Ofensiva + defesa totalmente compactada:

→ agressividade diminui temporariamente
→ circulação aumenta

Equipe Defensiva + espaço para contra-ataque:

→ pode aumentar temporariamente a agressividade

Portanto, a Mentalidade define a tendência geral, mas o Momentum e o espaço determinam o comportamento momentâneo.

---

# 10. RESULTADO ESPERADO

O jogo deve deixar de parecer:

ATAQUE → ATAQUE → ATAQUE → CHUTE

e começar a produzir:

CONSTRUÇÃO
→ PROGRESSÃO
→ CONGESTIONAMENTO
→ CIRCULAÇÃO
→ VIRADA
→ PROGRESSÃO
→ ATAQUE

Ou:

DIREITA
→ CIRCULA
→ CENTRO
→ ESQUERDA
→ ESPAÇO
→ ATAQUE

Ou:

ATAQUE
→ NÃO ENCONTRA ESPAÇO
→ RECULA
→ REORGANIZA
→ NOVA TENTATIVA

O mais importante é que **a equipe não deve atacar simplesmente porque possui a bola**.

Ela deve procurar espaço.

Quando não houver espaço, deve circular.

Quando um lado estiver congestionado e o outro estiver livre, deve inverter.

Quando encontrar espaço, deve acelerar novamente.

## REGRAS IMPORTANTES

* Não alterar os Playing Styles existentes.
* Não recriar o sistema de decisão individual.
* Não substituir o Decision Grid.
* Não criar dezenas de regras.
* Manter a implementação simples.
* Usar pesos/modificadores em vez de lógica rígida.
* O Momentum deve ser suavizado.
* A circulação deve surgir naturalmente da combinação entre espaço, congestionamento, mentalidade e estilo de jogo.
* A equipe deve manter jogadores no lado oposto para permitir a virada.

O objetivo principal desta implementação é fazer o futebol ter **ritmo e respiração**:

**avançar → encontrar resistência → circular → inverter → encontrar espaço → acelerar → atacar.**
