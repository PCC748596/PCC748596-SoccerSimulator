# Sistema de Salto do Guarda-Redes (GK Jump System)

Este documento descreve a arquitectura física e procedural do salto do guarda-redes, substituindo o antigo sistema de mergulho rasante por uma parábola balística fisicamente exacta, passadas laterais de ajuste e IK dinâmico.

## 1. Princípios Biomecânicos e Físicos

O salto do guarda-redes não é uma animação genérica. É um solver físico em tempo real composto por:
*   **Parábola Balística:** O centro de massa (umbigo/pelve) do guarda-redes segue uma trajectória de projecção ($y = y_0 + v_{y0}t - \frac{1}{2}gt^2$). Isso permite atingir bolas em qualquer altura, incluindo ângulos altos (gaveta) e travessão.
*   **Passos Laterais (Footwork):** Antes de saltar, o guarda-redes executa passos rápidos de ajuste lateral para transferir momento linear horizontal para a impulsão.
*   **Alcance Procedural (IK):** Não há uma "pose de defesa no ângulo" fixa. Os braços estendem-se procedimentalmente na direcção do ponto exato onde a bola interceptará o plano do golo.

## 2. Fases do Movimento

O ciclo de defesa (`GkDive`) agora divide-se nas seguintes fases:

1.  **`DELAY` (Reação):** O guarda-redes aguarda a leitura da trajectória. O tempo (`gkDelayReacao`) é inversamente proporcional ao atributo `GK`. Goleiros de elite reagem rápido; goleiros fracos perdem milissegundos críticos.
2.  **`STEPS` (Passada Lateral):** O modelo desloca-se lateralmente mantendo a altura base, cruzando as pernas ou fazendo "shuffles" rápidos para cortar o ângulo ou aproximar-se do alvo. A quantidade de passos e a velocidade dependem do tempo de voo restante da bola e da técnica do GK.
3.  **`TAKEOFF` (Impulsão):** A energia acumulada é disparada. O solver calcula as velocidades iniciais $v_{x0}$ e $v_{y0}$ necessárias para que o centro de massa atinja o ápice ou o ponto óptimo de interceptação no momento exacto em que a bola chega.
4.  **`FLIGHT` (Voo):** Trajectória em parábola sob acção exclusiva da gravidade. O corpo roda (pitch e roll) consoante a direcção e altura do salto. Os braços buscam activamente (IK) o ponto projectado.
5.  **`INTERCEPT` (Contacto/Erro):** A precisão do contacto (se a mão chega perfeita na bola ou se raspa) depende do atributo `GK` do guarda-redes. Se a margem de erro (desvio induzido) for superior ao raio da mão, o GK falha a defesa.
6.  **`LANDING` (Queda/Recuperação):** O corpo aterra no relvado absorvendo o impacto, procedendo para a animação de recuperação (`levantar`).

## 3. Solver de Interceptação e Erro

O ponto que a mão tenta alcançar não é exactamente o centro real da bola (salvo num guarda-redes perfeito). A posição alvo sofre um offset (erro):

*   **Ponto Real:** $P = (X_{bola}, Y_{bola})$ no momento de cruzamento da linha de baliza.
*   **Erro de Leitura:** Aplicamos uma dispersão aleatória Gaussiana no plano XY, cujo raio é inversamente proporcional ao atributo `GK`.
    *   $GK = 100 \Rightarrow Erro \approx 0$
    *   $GK = 50 \Rightarrow Erro \approx 0.3m \text{ a } 0.8m$ (suficiente para a mão não cobrir o raio da bola).
*   **Ponto Alvo IK:** $P_{alvo} = P + Erro$. Os braços do guarda-redes seguem *sempre* $P_{alvo}$. Se o erro for grande, a mão estende-se para o ar e a bola passa.

## 4. Integração no Código

*   **`js/player.js`:** Controlo do temporizador de reacção, activação da decisão de salto, e gestão do estado.
*   **`js/gk_dive.js`:** Motor da física de voo (agora suportando $v_{y0}$ altas, remoção do cap rasteiro) e máquina de estados (`ler` $\rightarrow$ `passos` $\rightarrow$ `voo` $\rightarrow$ `chao`).
*   **`js/config/goalkeeper.js`:** Configuração dos delays baseados em skill, velocidades máximas de impulsão lateral e vertical (aumentadas para permitir salto no ângulo), e tolerância de erro.

## Conclusão

Esta arquitectura garante que os guarda-redes não dependem de animações "enlatadas" e falham ou defendem pelos motivos físicos correctos: chegaram tarde, não impulsionaram o suficiente, ou calcularam mal a trajectória.
