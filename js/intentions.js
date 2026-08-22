const Intentions = (function() {
    let contratos = [];
    let _relogio = 0;

    function abertos(equipa) {
        return contratos.filter(c => c.dono.team === equipa && c.estado === 'aberto');
    }

    function doJogador(p) {
        return contratos.find(c => c.dono === p && (c.estado === 'aberto' || c.estado === 'servido')) || null;
    }

    function posicaoEm(c, t) {
        const dt = t - c.tPedido;
        const res = new THREE.Vector3(c.dir.x, 0, c.dir.z).multiplyScalar(c.velocidade * dt).add(c.origem);
        return res;
    }

    function projetarEncontro(c, ballPos) {
        let t = ballPos.distanceTo(c.dono.model.position) / 11.0;
        let ponto;
        for (let i = 0; i < 3; i++) {
            ponto = posicaoEm(c, _relogio + t);
            t = typeof tempoDeVoo !== 'undefined' ? tempoDeVoo(ballPos.distanceTo(ponto), true) : ballPos.distanceTo(ponto) / 11.0;
        }
        if (_relogio + t > c.tExpira) return null;
        const dist = ballPos.distanceTo(ponto);
        if (dist < IntentModel.distMin || dist > IntentModel.distMax) return null;
        return { ponto: { x: ponto.x, z: ponto.z }, tempoVoo: t, dist: dist };
    }

    function pedir(p, dir, vel, duracao) {
        if (p.intentCooldown && p.intentCooldown > _relogio) return null;
        if (doJogador(p)) return null;
        if (abertos(p.team).length >= IntentModel.maxPorEquipa) return null;

        const c = {
            dono: p,
            origem: p.model.position.clone(),
            dir: new THREE.Vector3(dir.x, 0, dir.z).normalize(),
            velocidade: vel,
            duracao: duracao,
            tPedido: _relogio,
            tExpira: _relogio + duracao,
            estado: 'aberto',
            motivo: null,
            passador: null,
            pontoEncontro: null,
            tempoVoo: null
        };
        contratos.push(c);
        if (typeof EventBus !== 'undefined') EventBus.emit('Ball_Request', { player: p, intent: c });
        return c;
    }

    function servir(c, passador, pontoEncontro, tempoVoo) {
        if (c.estado !== 'aberto') return false;
        c.estado = 'servido';
        c.passador = passador;
        c.pontoEncontro = new THREE.Vector3(pontoEncontro.x, 0, pontoEncontro.z);
        c.tempoVoo = tempoVoo;
        if (typeof EventBus !== 'undefined') EventBus.emit('Long_Ball_Inform', { player: c.dono, passador: passador, intent: c });
        return true;
    }

    function limpar() {
        contratos.length = 0;
        _relogio = 0;
    }

    function tick(dt) {
        _relogio += dt;
        for (let i = contratos.length - 1; i >= 0; i--) {
            const c = contratos[i];
            if (c.estado === 'aberto' || c.estado === 'servido') {
                if (_relogio > c.tExpira) {
                    cancelar(c, 'expirou');
                } else {
                    const bb = typeof TeamAI !== 'undefined' ? TeamAI.get(c.dono.team) : null;
                    if (bb && !bb.isAttacking) {
                        cancelar(c, 'posse');
                    }
                }
                
                if (c.estado === 'servido') {
                    if (c.pontoEncontro) {
                        const dist = c.dono.model.position.distanceTo(c.pontoEncontro);
                        if (dist < IntentModel.raioChegada) {
                            c.estado = 'cumprido';
                            c.dono.intentCooldown = _relogio + IntentModel.cooldown;
                        }
                    }
                    if (typeof Match !== 'undefined' && Match.lastTouchedTeam && Match.lastTouchedTeam !== c.dono.team && (!c.passador || Match.lastTouchedTeam !== c.passador.team)) {
                        c.estado = 'falhado';
                        c.dono.intentCooldown = _relogio + IntentModel.cooldown;
                    }
                }
            }
        }
        contratos = contratos.filter(c => c.estado === 'aberto' || c.estado === 'servido');
    }

    function cancelar(c, motivo) {
        if (c.estado !== 'aberto' && c.estado !== 'servido') return;
        c.estado = 'cancelado';
        c.motivo = motivo;
        c.dono.intentCooldown = _relogio + IntentModel.cooldown;
        if (typeof EventBus !== 'undefined') EventBus.emit('Intent_Cancel', { player: c.dono, intent: c, reason: motivo });
    }

    return { 
        abertos, 
        doJogador, 
        projetarEncontro, 
        pedir, 
        servir, 
        limpar, 
        tick, 
        posicaoEm, 
        get relogio() { return _relogio; }, 
        set relogio(v) { _relogio = v; }, 
        cancelar 
    };
})();
