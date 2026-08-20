/*
=============================================================================
IK — cinemática inversa de duas articulações (§10, §11, §12 do spec)
=============================================================================
O rig deste projecto (ver buildBody em player.js) não é um THREE.Skeleton com
skinning: são Groups aninhados com posições locais fixas. Isso torna o IK
trivial de aplicar — resolver a pose é escrever `quaternion` no Group da raiz
e `rotation.x` no Group do meio, e a hierarquia trata do resto.

Cadeias disponíveis e os seus comprimentos, em unidades do MODELO (o `corpo`
tem scale 1.8/5.5, mas isso é absorvido pela conversão de espaço — ver
`paraEspacoDoPai`):

    braço:  lArm  -> lElbow -> lHand     L1 = 1.0   L2 = 0.8
    perna:  lLeg  -> lKnee  -> lFoot     L1 = 1.0   L2 = 0.9

CONVENÇÃO IMPORTANTE: em repouso todos estes membros apontam para -Y (o osso
de baixo está em `position.y = -L1`). Logo o "eixo do osso" é (0,-1,0), e não
o (0,1,0) habitual noutros rigs. O código todo aqui assume isso.

A flexão do meio (cotovelo/joelho) faz-se em `rotation.x` NEGATIVO — é a
convenção que o resto do projecto já usa (`lElbow.rotation.x = -0.5` na
corrida). Rodar -θ em X leva o antebraço de (0,-1,0) para (0,-cosθ,+sinθ),
ou seja para a FRENTE. Confirmado contra a pose de corrida existente.

--- Porque é que o pole vector importa -------------------------------------
`setFromUnitVectors` produz uma rotação que leva o eixo do osso ao alvo, mas
com um ROLL arbitrário à volta dessa direcção. Com o roll arbitrário, o
cotovelo aponta para onde calhar — para dentro do peito, para cima, para
trás. É a diferença entre um braço e um braço partido.

Por isso a base é construída à mão a partir de três eixos ortonormais, com o
+Z local (o lado para onde a mão balança quando o cotovelo dobra) alinhado
com um `plano` dado por quem chama. Para um braço a alcançar a bola, esse
plano é o "para cima" do mundo: assim o cotovelo fica SEMPRE por baixo da
linha ombro-mão, que é o que um humano faz.
=============================================================================
*/

const IK = {
    // Temporários reutilizados — nada de alocar por frame (§46).
    _m: new THREE.Matrix4(),
    _mBase: new THREE.Matrix4(),
    _alvo: new THREE.Vector3(),
    _origem: new THREE.Vector3(),
    _polo: new THREE.Vector3(),
    _d: new THREE.Vector3(),
    _xA: new THREE.Vector3(),
    _yA: new THREE.Vector3(),
    _zA: new THREE.Vector3(),
    _q: new THREE.Quaternion(),
    _qBend: new THREE.Quaternion(),
    _eixoX: new THREE.Vector3(1, 0, 0),

    /*
    Converte um ponto do mundo para o espaço do PAI da raiz da cadeia.

    É nesse espaço que `raiz.position` e `raiz.quaternion` vivem, por isso é
    lá que a conta tem de ser feita. A inversa da matriz de mundo do pai
    absorve automaticamente a escala do modelo (1.8/5.5) — daí os
    comprimentos poderem ficar em unidades do modelo.
    */
    paraEspacoDoPai(raiz, pontoMundo, saida) {
        const pai = raiz.parent;
        if (!pai) return saida.copy(pontoMundo);
        pai.updateWorldMatrix(true, false);
        this._m.copy(pai.matrixWorld).invert();
        return saida.copy(pontoMundo).applyMatrix4(this._m);
    },

    /*
    Resolve a cadeia de dois ossos.

        raiz      Group da articulação de cima (ombro / anca)
        meio      Group da articulação do meio (cotovelo / joelho)
        L1, L2    comprimentos, em unidades do modelo
        alvoMundo ponto do mundo que a extremidade deve alcançar
        planoMundo direcção do mundo para onde o +Z local deve apontar; é o
                  pole vector, e define o lado para onde a articulação do
                  meio dobra. Ver a nota no topo do ficheiro.

    Devolve `true` se o alvo estava ao alcance, `false` se teve de esticar
    (nesse caso aponta na direcção certa, esticado — que é o comportamento
    humano correcto: se não chegas, esticas).
    */
    resolver(raiz, meio, L1, L2, alvoMundo, planoMundo) {
        this.paraEspacoDoPai(raiz, alvoMundo, this._alvo);

        // O pole vector é uma DIRECÇÃO: converte-se levando dois pontos e
        // subtraindo, senão a translação do pai entrava na conta.
        this._origem.copy(raiz.getWorldPosition(this._d));
        this.paraEspacoDoPai(raiz, this._origem, this._polo);
        this._d.copy(this._origem).add(planoMundo);
        this.paraEspacoDoPai(raiz, this._d, this._d);
        this._polo.subVectors(this._d, this._polo);

        // Vector raiz -> alvo, no espaço do pai.
        this._d.subVectors(this._alvo, raiz.position);
        let D = this._d.length();
        if (D < 1e-5) return false;

        // Fora de alcance (ou dobrado de mais): limita antes do acos, senão
        // o argumento sai de [-1,1] e o acos devolve NaN (§10).
        const Dmin = Math.abs(L1 - L2) + 1e-3;
        const Dmax = L1 + L2 - 1e-3;
        const alcancou = (D <= Dmax && D >= Dmin);
        D = Math.min(Dmax, Math.max(Dmin, D));

        // Lei dos cossenos.
        //   B = ângulo interno no meio (π = esticado)
        //   A = ângulo entre o osso de cima e a linha raiz->alvo
        const cosB = (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2);
        const cosA = (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D);
        const B = Math.acos(Math.min(1, Math.max(-1, cosB)));
        const A = Math.acos(Math.min(1, Math.max(-1, cosA)));

        // Flexão do meio. Ver a convenção de sinal no topo.
        meio.rotation.set(-(Math.PI - B), 0, 0);

        /*
        Base ortonormal da raiz:
            -Y local  ->  direcção raiz->alvo   (o osso aponta ao alvo)
            +Z local  ->  o plano de dobra pedido
        Depois roda-se +A à volta do X local para compensar a flexão: com o
        meio dobrado, a extremidade fica a A graus do eixo do osso, e é isso
        que esta rotação desfaz para a pôr exactamente no alvo.
        */
        this._d.normalize();
        this._yA.copy(this._d).multiplyScalar(-1);          // +Y local = -dir

        // Ortogonaliza o plano contra o eixo do osso. Se forem paralelos
        // (alvo exactamente na direcção do plano) escolhe-se um perpendicular
        // qualquer — o roll é indiferente nesse caso degenerado.
        this._zA.copy(this._polo).addScaledVector(this._yA, -this._polo.dot(this._yA));
        if (this._zA.lengthSq() < 1e-6) {
            this._zA.set(0, 0, 1).addScaledVector(this._yA, -this._yA.z);
            if (this._zA.lengthSq() < 1e-6) this._zA.set(1, 0, 0);
        }
        this._zA.normalize();
        this._xA.crossVectors(this._yA, this._zA).normalize();

        this._mBase.makeBasis(this._xA, this._yA, this._zA);
        this._q.setFromRotationMatrix(this._mBase);
        this._qBend.setFromAxisAngle(this._eixoX, A);
        raiz.quaternion.copy(this._q).multiply(this._qBend);

        return alcancou;
    },

    /*
    Mistura o resultado do IK com a pose que já lá estava, para o membro não
    "saltar" para o alvo num frame só. `peso` 0 = pose antiga, 1 = IK puro.
    */
    resolverSuave(raiz, meio, L1, L2, alvoMundo, planoMundo, peso) {
        const qAnt = this._qAnt || (this._qAnt = new THREE.Quaternion());
        const xAnt = meio.rotation.x;
        qAnt.copy(raiz.quaternion);

        const ok = this.resolver(raiz, meio, L1, L2, alvoMundo, planoMundo);

        raiz.quaternion.copy(qAnt).slerp(raiz.quaternion, peso);
        meio.rotation.x = xAnt + (meio.rotation.x - xAnt) * peso;
        return ok;
    }
};

// Comprimentos do rig deste modelo, lidos de buildBody (player.js).
const IKChains = {
    braco: { L1: 1.0, L2: 0.8 },
    perna: { L1: 1.0, L2: 0.9 }
};
