Crie um **Procedural Human Animation System completo para um jogo de futebol 3D usando Three.js**.

O objetivo NÃO é criar dezenas de animações pré-gravadas.

O objetivo é construir um sistema matemático capaz de gerar, adaptar, combinar e modificar movimentos humanos em tempo real a partir de:

* posição;
* velocidade;
* aceleração;
* direção;
* rotação;
* posição da bola;
* velocidade da bola;
* ação desejada;
* terreno;
* obstáculos;
* adversários;
* estado corporal;
* atributos do jogador.

O sistema deve funcionar para jogadores de linha e goleiros.

A arquitetura deve ser modular, reutilizável e orientada a solvers.

---

# 1. FILOSOFIA DO SISTEMA

O sistema deve separar claramente:

1. O QUE o jogador está fazendo.
2. COMO o corpo executa esse movimento.

O Decision System do jogo determina:

```text
IDLE
WALK
RUN
SPRINT
TURN
STOP
ACCELERATE
DECELERATE
DRIBBLE
PASS
CROSS
KICK
HEADER
TACKLE
RECEIVE
SHIELD
JUMP
```

O Procedural Animation System recebe a ação e gera a pose corporal correspondente.

Para goleiros, adicionar:

```text
GK_READY
GK_SHUFFLE
GK_SET
GK_STEP
GK_JUMP
GK_DIVE
GK_CATCH
GK_PARRY
GK_PUNCH
GK_LAND
GK_RECOVER
```

---

# 2. ARQUITETURA PRINCIPAL

Criar:

```text
ProceduralHumanAnimationController
```

com os seguintes subsistemas:

```text
MotionPhaseSystem
LocomotionSolver
FootTrajectorySolver
FootIKSolver
LegIKSolver
ArmIKSolver
HandIKSolver
SpineSolver
PelvisSolver
HeadLookSolver
ShoulderSolver
BalanceSolver
LeanSolver
GroundSolver
AccelerationSolver
TurnSolver
SpringSolver
InertiaSolver
ProceduralNoise
AnimationBlender
FootballActionSolver
GoalkeeperSolver
```

Arquitetura:

```text
GAMEPLAY / DECISION SYSTEM
          ↓
      ACTION DATA
          ↓
   MOTION PARAMETERS
          ↓
┌───────────────────────────────┐
│ PROCEDURAL HUMAN CONTROLLER   │
│                               │
│ Motion Phase                  │
│ Locomotion                    │
│ Body Dynamics                 │
│ IK                            │
│ Balance                       │
│ LookAt                        │
│ Ground Adaptation             │
│ Football Actions              │
│ Goalkeeper Actions            │
└───────────────────────────────┘
          ↓
    FINAL BONE POSE
          ↓
    THREE.JS SKELETON
```

---

# 3. REPRESENTAÇÃO DO CORPO

O sistema deve trabalhar com um esqueleto humano hierárquico:

```text
Root
 └─ Pelvis
     ├─ Spine
     │   ├─ Chest
     │   │   ├─ Neck
     │   │   │   └─ Head
     │   │   ├─ LeftShoulder
     │   │   │   └─ LeftArm
     │   │   │       └─ LeftForearm
     │   │   │           └─ LeftHand
     │   │   └─ RightShoulder
     │   │       └─ RightArm
     │   │           └─ RightForearm
     │   │               └─ RightHand
     │   ├─ LeftHip
     │   │   └─ LeftKnee
     │   │       └─ LeftAnkle
     │   │           └─ LeftFoot
     │   └─ RightHip
     │       └─ RightKnee
     │           └─ RightAnkle
     │               └─ RightFoot
```

Não assumir nomes fixos de ossos.

Criar um sistema de mapeamento/configuração:

```javascript
SkeletonMap
```

para adaptar o sistema a diferentes personagens.

---

# 4. SISTEMA DE FASE

Criar um sistema universal de fase:

```text
phase = 0 ... 2π
```

A fase representa a progressão de um ciclo corporal.

Exemplo:

```javascript
phase += cadence * deltaTime;
```

Permitir ciclos independentes:

```text
gaitPhase
breathPhase
dribblePhase
balancePhase
recoveryPhase
```

Cada movimento deve poder utilizar:

```text
sin(phase)
cos(phase)
sin(2 * phase)
sin(phase + offset)
```

---

# 5. AMPLITUDE E FREQUÊNCIA

Todos os movimentos periódicos devem possuir:

```text
amplitude
frequency
phase
offset
weight
```

Modelo básico:

```text
motion = offset + amplitude * sin(phase * frequency + phaseOffset)
```

Permitir combinação de harmônicos:

```text
motion =
A1 * sin(phase)
+
A2 * sin(2 * phase)
+
A3 * sin(3 * phase)
```

Isso deve ser utilizado para produzir movimentos humanos menos mecânicos.

---

# 6. GAIT SYSTEM

Criar um sistema procedural de caminhada e corrida.

Não depender exclusivamente de animações prontas.

O sistema deve calcular:

* comprimento da passada;
* frequência da passada;
* posição do pé;
* altura do pé;
* avanço do pé;
* recuo do pé;
* tempo de apoio;
* tempo de swing;
* posição da pelve;
* rotação da pelve;
* movimento da coluna;
* movimento dos braços;
* movimento da cabeça.

---

# 7. FOOT TRAJECTORY

Criar trajetória procedural para cada pé.

A trajetória deve possuir duas fases:

```text
STANCE
SWING
```

Durante STANCE:

* pé permanece relativamente fixo no solo;
* corpo se desloca sobre o pé.

Durante SWING:

* pé é levantado;
* avança;
* passa pelo corpo;
* retorna ao solo.

A trajetória pode utilizar uma curva paramétrica.

Modelo inicial:

```text
x = strideLength * f(phase)
y = groundHeight + footLift * sin(swingPhase)
```

Não utilizar círculo perfeito.

Permitir deformação da trajetória.

---

# 8. FOOT PLANTING

Criar detecção de apoio do pé.

Quando o pé está em STANCE:

```text
footPlant = true
```

Sua posição no mundo deve permanecer estável enquanto o corpo se desloca.

Quando entra em SWING:

```text
footPlant = false
```

O pé passa a seguir a trajetória procedural.

Criar transições suaves entre os estados.

---

# 9. FOOT IK

Criar `FootIKSolver`.

Usar raycast para detectar:

* chão;
* inclinação;
* altura;
* normal da superfície.

Calcular:

```text
footPosition
footRotation
```

A rotação do pé deve respeitar a normal do terreno.

Não permitir que o personagem pareça flutuar.

---

# 10. TWO-BONE LEG IK

Implementar IK matemático para:

```text
Hip
 ↓
Knee
 ↓
Ankle
```

Utilizar:

* distância entre hip e target;
* comprimento da coxa;
* comprimento da canela;
* lei dos cossenos;
* pole vector.

Calcular os ângulos usando:

```text
cos(A) =
(L1² + D² - L2²)
/
(2 * L1 * D)
```

e:

```text
cos(B) =
(L1² + L2² - D²)
/
(2 * L1 * L2)
```

Aplicar clamp antes de `acos`.

---

# 11. ARM IK

Implementar:

```text
Shoulder
 ↓
Elbow
 ↓
Hand
```

Usar o mesmo princípio de Two-Bone IK.

Permitir:

```text
handTarget
poleVector
```

Usar para:

* alcançar bola;
* proteger bola;
* equilíbrio;
* goleiro;
* cabeceio;
* comemoração;
* colisão.

---

# 12. POLE VECTOR

Criar suporte universal para pole vectors.

O pole vector deve controlar:

* direção do joelho;
* direção do cotovelo.

Evitar inversões anatômicas.

Permitir que o pole vector seja alterado dinamicamente de acordo com:

* direção do movimento;
* ação;
* postura;
* lado do corpo.

---

# 13. PELVIS MOTION

Criar um `PelvisSolver`.

A pelve deve possuir:

### Vertical

```text
pelvisY =
baseY +
verticalAmplitude * sin(2 * gaitPhase)
```

### Lateral

```text
pelvisX =
lateralAmplitude * sin(gaitPhase)
```

### Rotação

Criar rotação alternada da pelve durante a passada.

A amplitude deve depender da velocidade.

---

# 14. HIP MOTION

A pelve deve compensar o apoio das pernas.

Durante o apoio esquerdo:

```text
weight → esquerda
```

Durante o apoio direito:

```text
weight → direita
```

Criar transferência de peso procedural.

---

# 15. SPINE SOLVER

A coluna não deve ser uma única rotação.

Distribuir o movimento entre:

```text
Spine
Chest
Neck
Head
```

Exemplo:

```text
totalRotation = 30°

Spine = 8°
Chest = 10°
Neck = 7°
Head = 5°
```

Permitir distribuição configurável.

---

# 16. HEAD STABILIZATION

A cabeça deve compensar parcialmente os movimentos da pelve.

Se o corpo subir:

```text
bodyY ↑
```

a cabeça deve ter uma resposta menor e parcialmente compensatória.

Adicionar:

* head bob;
* head stabilization;
* look-at;
* antecipação.

---

# 17. LOOK AT SOLVER

Criar sistema para a cabeça olhar para um alvo.

Targets possíveis:

```text
Ball
Opponent
Teammate
Goal
ActionTarget
```

Calcular:

```text
direction = target - headPosition
```

Usar quaternion.

Distribuir rotação entre:

```text
Chest
Neck
Head
```

Aplicar limites anatômicos.

---

# 18. ARM SWING

Durante caminhada e corrida:

```text
LeftArm  ≈ sin(phase)
RightArm ≈ sin(phase + π)
```

O braço deve acompanhar a passada de forma oposta às pernas.

A amplitude deve aumentar com a velocidade.

---

# 19. LEAN SOLVER

Calcular a inclinação corporal com base na aceleração.

Usar:

```text
acceleration = velocityChange / deltaTime
```

E projetar a aceleração no eixo lateral do personagem.

Quanto maior a aceleração lateral:

```text
maior lean
```

Quanto maior a velocidade de curva:

```text
maior lean
```

Aplicar limite anatômico.

---

# 20. TURN SOLVER

Calcular o ângulo entre:

```text
currentDirection
desiredDirection
```

Usar produto escalar:

```text
dot(A, B)
```

e:

```text
angle = acos(dot)
```

Usar produto vetorial para determinar o lado da curva.

Criar:

```text
turnAngle
turnDirection
turnSpeed
```

O corpo deve começar a virar antes dos pés terminarem a mudança de direção.

---

# 21. ACCELERATION E DECELERATION

Não alterar a velocidade instantaneamente.

Usar:

```text
velocity
targetVelocity
acceleration
```

O corpo deve responder à aceleração.

Durante aceleração:

* corpo inclina para frente;
* passada aumenta;
* braços aumentam amplitude.

Durante desaceleração:

* corpo inclina para trás;
* passada encurta;
* centro de massa baixa.

---

# 22. SPRING-DAMPER

Implementar sistema genérico:

```text
force = -k * displacement - c * velocity
```

Utilizar para:

* cabeça;
* braços;
* mãos;
* tronco;
* quadril;
* recuperação;
* impacto.

Criar parâmetros:

```text
stiffness
damping
mass
```

---

# 23. BALANCE SOLVER

Criar um centro de massa aproximado.

Calcular:

```text
centerOfMass
supportPolygon
```

Quando o centro de massa se aproxima ou ultrapassa a região de apoio:

* ajustar quadril;
* ajustar tronco;
* mover braços;
* reposicionar pés.

Isso deve gerar microcorreções naturais.

---

# 24. PROCEDURAL NOISE

Adicionar pequenas variações contínuas.

Nunca usar:

```javascript
Math.random()
```

diretamente a cada frame.

Utilizar:

* Perlin noise;
* Simplex noise;
* smooth noise;
* funções interpoladas.

Aplicar apenas pequenas amplitudes.

Usar para:

* respiração;
* cabeça;
* mãos;
* equilíbrio;
* postura;
* ombros.

---

# 25. BREATHING

Criar:

```text
breathPhase
```

Modelo:

```text
chestExpansion =
sin(breathPhase) * amplitude
```

A frequência deve depender do estado:

```text
Idle
Walking
Running
Sprint
AfterAction
```

---

# 26. FOOTBALL ACTION SOLVER

Criar um sistema genérico:

```text
FootballActionSolver
```

com:

```text
KickSolver
PassSolver
CrossSolver
HeaderSolver
DribbleSolver
ReceiveBallSolver
ShieldBallSolver
TackleSolver
ClearanceSolver
```

Cada ação deve produzir targets para o corpo.

---

# 27. KICK SOLVER

Receber:

```text
ballPosition
ballVelocity
kickTarget
kickType
```

Calcular:

```text
kickDirection =
normalize(kickTarget - ballPosition)
```

Criar fases:

```text
Approach
Plant
BackSwing
ForwardSwing
Contact
FollowThrough
Recovery
```

Usar:

* Foot IK;
* Leg IK;
* pelvis rotation;
* spine rotation;
* arm balance.

O pé deve chegar à bola no momento correto.

---

# 28. PASS SOLVER

O passe deve funcionar como uma versão controlada do chute.

Parâmetros:

```text
target
power
curve
height
foot
```

O corpo deve adaptar:

* posição do pé;
* orientação do quadril;
* tronco;
* apoio;
* follow-through.

---

# 29. CROSS SOLVER

Permitir:

```text
crossDirection
crossHeight
crossPower
```

Modificar a posição de contato do pé e o follow-through.

---

# 30. HEADER SOLVER

Calcular a posição prevista da bola.

Criar:

```text
jumpTarget
headTarget
```

O corpo deve:

* ajustar os pés;
* flexionar joelhos;
* saltar;
* orientar tronco;
* posicionar cabeça;
* pousar.

Usar IK e trajetória balística.

---

# 31. DRIBBLE SOLVER

Criar um sistema contínuo.

Parâmetros:

```text
dribbleDirection
dribbleSpeed
ballDistance
ballControl
```

A bola não deve ficar presa a uma animação.

Criar offsets procedurais para:

* pé esquerdo;
* pé direito;
* bola;
* quadril;
* tronco.

O ângulo do drible deve ser contínuo:

```text
-90° ... +90°
```

e não apenas:

```text
left
center
right
```

---

# 32. TACKLE SOLVER

Criar:

```text
Approach
Plant
Extension
Contact
Slide
Recovery
```

O sistema deve calcular:

* direção;
* extensão da perna;
* inclinação;
* rotação do tronco;
* posição do pé;
* recuperação.

---

# 33. GOALKEEPER LAYER

Criar uma camada especializada:

```text
GoalkeeperProceduralSolver
```

que reutiliza todos os sistemas humanos.

Não duplicar:

* IK;
* LookAt;
* Balance;
* Spine;
* Pelvis;
* Foot IK;
* Spring.

Adicionar apenas comportamentos específicos.

---

# 34. GOALKEEPER READY

Criar postura de preparação com:

* joelhos flexionados;
* centro de massa baixo;
* pés afastados;
* mãos à frente;
* cotovelos flexionados;
* tronco levemente inclinado.

Adicionar microcorreções procedurais.

---

# 35. GOALKEEPER SHUFFLE

Criar deslocamento lateral específico.

Usar:

* Foot Planting;
* Foot IK;
* transferência de peso;
* Pelvis;
* Lean.

Permitir:

```text
shuffleLeft
shuffleRight
crossover
backpedal
forwardStep
```

---

# 36. BALL PREDICTION

Criar:

```text
BallPredictionSolver
```

Para movimento simples:

```text
P(t) = P0 + Vt
```

Com gravidade:

```text
P(t) = P0 + Vt + 0.5Gt²
```

Calcular o ponto provável de interceptação.

---

# 37. GOALKEEPER SAVE SOLVER

Calcular:

```text
saveVector =
predictedBallPosition -
goalkeeperPosition
```

Separar:

```text
horizontalDistance
verticalDistance
timeToImpact
```

Determinar:

```text
step
jump
dive
```

de acordo com esforço necessário.

---

# 38. DIVE SOLVER

Criar fases:

```text
Read
Prepare
Compress
Push
Flight
Reach
Contact
Land
Recover
```

O centro de massa pode seguir:

```text
position =
startPosition +
velocity * t +
0.5 * gravity * t²
```

A velocidade inicial depende de:

```text
saveDirection
effort
agility
strength
```

---

# 39. GOALKEEPER HAND IK

Durante uma defesa:

```text
handTarget = predictedBallPosition
```

Usar Arm IK.

As mãos devem buscar a bola continuamente.

Permitir:

```text
oneHandSave
twoHandSave
catch
parry
punch
```

---

# 40. GOALKEEPER LANDING

Criar:

```text
Impact
Compression
Rotation
Slide
Stabilization
Recovery
```

A intensidade depende da velocidade no impacto.

---

# 41. PLAYER ATTRIBUTES

Permitir que os atributos do jogador modifiquem o sistema.

Exemplos:

```text
speed
acceleration
agility
balance
strength
technique
jump
reach
reaction
recovery
```

Exemplo:

```text
reach
```

aumenta a distância máxima do Hand IK.

```text
agility
```

aumenta a velocidade de mudança de direção.

```text
balance
```

reduz oscilações e melhora recuperação.

```text
acceleration
```

aumenta a velocidade de entrada na corrida.

---

# 42. MOTION STYLE

Permitir diferentes estilos de movimento.

Criar parâmetros:

```text
strideLength
strideFrequency
hipAmplitude
armAmplitude
headBob
leanFactor
stiffness
damping
balance
```

Assim dois jogadores podem executar a mesma ação de maneira diferente.

Exemplo:

Jogador A:

```text
passos curtos
cadência alta
corpo mais rígido
```

Jogador B:

```text
passos longos
cadência baixa
maior movimento de quadril
```

---

# 43. ANIMATION LAYERS

Combinar:

```text
Base Locomotion
+
Pelvis
+
Spine
+
Head
+
LookAt
+
Foot IK
+
Hand IK
+
Balance
+
Lean
+
Football Action
+
Goalkeeper Action
```

Cada camada deve possuir:

```text
weight = 0 ... 1
```

As rotações devem ser combinadas utilizando quaternions e interpolação apropriada.

---

# 44. PRIORIDADE DOS SOLVERS

Criar uma ordem de avaliação.

Sugestão:

```text
1. Base Pose
2. Locomotion
3. Ground
4. Pelvis
5. Legs
6. Balance
7. Spine
8. Arms
9. Action
10. Head
11. LookAt
12. Final Constraints
```

As ações críticas devem poder substituir parcialmente os resultados anteriores.

---

# 45. LIMITES ANATÔMICOS

Criar limites configuráveis para:

```text
hip
knee
ankle
spine
chest
shoulder
elbow
wrist
neck
head
```

Nenhum solver deve gerar poses anatomicamente impossíveis.

---

# 46. UPDATE LOOP

Separar claramente:

```javascript
updatePerception(deltaTime)
updateMotionState(deltaTime)
updatePhase(deltaTime)
updateLocomotion(deltaTime)
updateBodyDynamics(deltaTime)
updateIK(deltaTime)
updateFootballAction(deltaTime)
updateGoalkeeperAction(deltaTime)
blendLayers(deltaTime)
applyPose()
```

Não criar objetos temporários continuamente.

Reutilizar:

```text
Vector3
Quaternion
Matrix4
Raycaster
```

para evitar garbage collection.

---

# 47. DEBUG VISUAL

Criar modo:

```text
proceduralDebug = true
```

Mostrar:

* skeleton;
* bone axes;
* IK targets;
* pole vectors;
* foot targets;
* hand targets;
* center of mass;
* velocity;
* acceleration;
* direction;
* gait phase;
* predicted ball trajectory;
* goalkeeper save target;
* dive trajectory.

Usar:

```text
THREE.Line
THREE.ArrowHelper
THREE.SphereGeometry
```

para visualização.

---

# 48. CONFIGURAÇÃO

Criar um objeto:

```javascript
ProceduralAnimationConfig
```

contendo todos os parâmetros.

Não espalhar números mágicos pelo código.

Exemplo:

```javascript
{
    gait: {
        strideLength: ...,
        cadence: ...,
        footLift: ...,
        hipAmplitude: ...,
        armAmplitude: ...
    },

    balance: {
        stiffness: ...,
        damping: ...
    },

    goalkeeper: {
        divePower: ...,
        reactionTime: ...,
        recoverySpeed: ...
    }
}
```

---

# 49. DESIGN ORIENTADO A DADOS

O sistema deve permitir que diferentes personagens tenham configurações diferentes.

Criar:

```text
HumanAnimationProfile
```

com parâmetros individuais.

Exemplo:

```text
PlayerProfile
GoalkeeperProfile
FastPlayerProfile
HeavyPlayerProfile
AgilePlayerProfile
```

Não criar código específico para cada jogador.

---

# 50. OBJETIVO FINAL

O resultado deve ser um sistema capaz de produzir proceduralmente:

### Locomoção

* idle;
* breathing;
* walk;
* jog;
* run;
* sprint;
* acceleration;
* deceleration;
* stop;
* turn;
* strafe;
* backpedal.

### Corpo

* pelvis motion;
* hip motion;
* spine motion;
* shoulder motion;
* head stabilization;
* look-at;
* balance;
* lean;
* inertia;
* foot planting.

### Futebol

* dribble;
* pass;
* cross;
* kick;
* header;
* receive;
* shield;
* tackle;
* clearance.

### Goleiro

* ready;
* shuffle;
* set;
* step;
* jump;
* dive;
* catch;
* parry;
* punch;
* landing;
* recovery.

O sistema deve priorizar **movimento procedural contínuo**, evitando classificações rígidas como:

```text
runLeft
runRight
run45
run30
runDiagonal
```

Sempre que possível, utilizar parâmetros contínuos:

```text
direction
speed
acceleration
phase
amplitude
target
effort
balance
```

O sistema deve permitir que um único movimento matemático produza infinitas variações.

---

# 51. PRINCÍPIO FUNDAMENTAL

Não implementar o sistema como uma grande máquina de animações.

Implementar como uma combinação de:

```text
PARAMETERS
+
PHASE
+
TRIGONOMETRY
+
KINEMATICS
+
IK
+
QUATERNIONS
+
SPRING-DAMPER
+
PHYSICS
+
CONSTRAINTS
+
NOISE
+
BLENDING
```

A animação final deve ser consequência desses sistemas.

O objetivo é construir uma **"linguagem matemática do movimento humano"** para o jogo.

Começar a implementação pela fundação, nesta ordem:

```text
1. Skeleton abstraction
2. Vector/Quaternion utilities
3. Motion Phase System
4. Two-Bone IK
5. Foot IK
6. Hand IK
7. Pelvis Solver
8. Spine Solver
9. Head Look
10. Gait Cycle
11. Balance
12. Lean
13. Spring/Damper
14. Football Actions
15. Goalkeeper Actions
16. Layer Blending
17. Debug System
```

Não começar pelos movimentos do goleiro.

Primeiro construir o **Human Procedural Animation Core**. Depois utilizar esse núcleo para gerar todos os jogadores e, finalmente, adicionar os comportamentos específicos dos goleiros.
