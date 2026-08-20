/*
ActionState — sincroniza gameplay (efeito real de uma acção) com a animação
que a representa. Sem isto, o FSM executava o efeito (bola sai do pé) no
mesmo frame em que o Behavior Tree decidia, e a animação só apanhava o
gesto depois — a bola saía antes do pé "tocar" nela visualmente.

Fluxo: BT decide → FSM entra num estado → esse estado cria um ActionState
com o clip certo (ver ActionAnimClips em config.js) → cada frame chama
update(dt), que avança um tempo normalizado (0..1) e dispara onContact()
UMA vez, exactamente quando esse tempo cruza o contactTime do clip. O
estado do FSM só lê `phase`/`isDone()` para saber quando voltar a IDLE.

Começa só a cobrir o PASS — outras acções (chute, cabeceio, desarme,
condução, captura do GR) migram depois, uma de cada vez.
*/
class ActionState {
    constructor(clipKey, { onPrepare = null, onContact, onFollowThrough = null } = {}) {
        const clip = ActionAnimClips[clipKey];
        if (!clip) throw new Error('ActionAnimClips sem entrada para "' + clipKey + '"');

        this.clipKey = clipKey;
        this.duration = clip.duration;
        this.contactTime = clip.contactTime;

        this.onPrepare = onPrepare;
        this.onContact = onContact;
        this.onFollowThrough = onFollowThrough;

        this.t = 0;
        this.executed = false;
        this.phase = 'PREPARE';
    }

    // Devolve o tempo normalizado (0..1). Quem chama usa isto para posar o
    // rig — o ActionState não sabe nada de ossos, só de tempo e do contacto.
    update(dt, ctx) {
        this.t += dt;
        const norm = Math.min(1, this.t / this.duration);

        if (norm < this.contactTime) {
            this.phase = 'PREPARE';
            if (this.onPrepare) this.onPrepare(ctx, norm);
        } else if (!this.executed) {
            // Dispara exactamente uma vez, no frame em que o tempo normalizado
            // cruza o contactTime — não em todos os frames depois disso.
            this.executed = true;
            this.phase = 'CONTACT';
            this.onContact(ctx, norm);
        } else {
            this.phase = 'FOLLOWTHROUGH';
            if (this.onFollowThrough) this.onFollowThrough(ctx, norm);
        }
        return norm;
    }

    isDone() {
        return this.t >= this.duration;
    }
}
