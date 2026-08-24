/*
=============================================================================
MINIMAPA — o campo inteiro num canto, à maneira do FIFA/PES
=============================================================================
Canvas 2D por cima da cena, não um segundo render do THREE: são 23 pontos e
meia dúzia de linhas por frame, e uma segunda câmara custava um render inteiro
do estádio para desenhar o mesmo.

ORIENTAÇÃO. O campo é 68 m de largura (eixo X) por 106 m de comprimento (eixo
Z), mas no minimapa vê-se DEITADO — como na TV, balizas à esquerda e à direita.
Logo o eixo longo do mundo (Z) é o eixo horizontal do canvas, e o curto (X) é o
vertical. É essa a troca que `paraTela` faz, e é por isso que o `+Z` (a baliza
que o TeamA ataca) fica à DIREITA.

Tudo o que se desenha sai das mesmas constantes do jogo (CAMPO_LARG,
CAMPO_COMP, LARGURA_BALIZA): mexer no tamanho do campo mexe no minimapa
sozinho, sem números repetidos aqui.
=============================================================================
*/
const Minimap = {
    // Medidas do canvas em pixéis CSS. A altura sai da proporção real do campo.
    largura: 177,
    get altura() { return Math.round(this.largura * (CAMPO_LARG / CAMPO_COMP)); },

    margem: 6,        // relva à volta das linhas, para a bola na linha se ver
    raioJogador: 2.6,
    raioBola: 1.8,

    visivel: true,
    _canvas: null,
    _ctx: null,
    _dpr: 1,

    cores: {
        relva: 'rgba(22, 78, 42, 0.30)',
        linha: 'rgba(255, 255, 255, 0.55)',
        TeamA: '#3498db',
        TeamB: '#e74c3c',
        gk: '#f1c40f',
        bola: '#ffffff',
        portador: '#ffffff'
    },

    init: function () {
        this._canvas = document.getElementById('minimapa');
        if (!this._canvas) return;
        this._ctx = this._canvas.getContext('2d');

        /*
        Ecrã Retina: o canvas leva o tamanho em pixéis REAIS e o contexto é
        escalado, senão a 2x tudo sai desfocado. O CSS mantém o tamanho lógico.
        */
        this._dpr = window.devicePixelRatio || 1;
        this._canvas.width = Math.round(this.largura * this._dpr);
        this._canvas.height = Math.round(this.altura * this._dpr);
        this._canvas.style.width = this.largura + 'px';
        this._canvas.style.height = this.altura + 'px';
        this._ctx.scale(this._dpr, this._dpr);
    },

    /*
    Mundo -> canvas. z (comprimento) vai para o horizontal, x (largura) para o
    vertical.

    OS DOIS EIXOS SÃO INVERTIDOS, e não é escolha estética: é o que alinha o
    mapa com a câmara. A câmara de TV está em +X a olhar para a origem (ver
    updateCamera em match.js), logo o "direita do ecrã" dela é -Z e o "baixo do
    ecrã" é +X. Com o mapeamento directo (+Z à direita, +X em cima) as equipas
    apareciam no mapa do lado contrário àquele em que estavam a jogar.

    Inverter AMBOS é uma rotação de 180°, não um espelho — a esquerda e a
    direita do campo continuam certas uma em relação à outra.
    */
    paraTela: function (x, z) {
        const w = this.largura - this.margem * 2;
        const h = this.altura - this.margem * 2;
        return {
            sx: this.margem + ((-z + CAMPO_COMP / 2) / CAMPO_COMP) * w,
            sy: this.margem + ((x + CAMPO_LARG / 2) / CAMPO_LARG) * h
        };
    },

    // Rectângulo dado em metros do mundo (centro e meias-medidas).
    _rect: function (ctx, z0, z1, x0, x1) {
        const a = this.paraTela(x0, z0);
        const b = this.paraTela(x1, z1);
        ctx.strokeRect(Math.min(a.sx, b.sx), Math.min(a.sy, b.sy),
            Math.abs(b.sx - a.sx), Math.abs(b.sy - a.sy));
    },

    desenharCampo: function (ctx) {
        const meioZ = CAMPO_COMP / 2;
        const meioX = CAMPO_LARG / 2;

        ctx.strokeStyle = this.cores.linha;
        ctx.lineWidth = 1;

        // Contorno e linha de meio-campo
        this._rect(ctx, -meioZ, meioZ, -meioX, meioX);
        const c0 = this.paraTela(-meioX, 0), c1 = this.paraTela(meioX, 0);
        ctx.beginPath(); ctx.moveTo(c0.sx, c0.sy); ctx.lineTo(c1.sx, c1.sy); ctx.stroke();

        // Círculo central: 9.15 m de raio, achatado pela escala dos dois eixos.
        const centro = this.paraTela(0, 0);
        const raioZ = (9.15 / CAMPO_COMP) * (this.largura - this.margem * 2);
        const raioX = (9.15 / CAMPO_LARG) * (this.altura - this.margem * 2);
        ctx.beginPath();
        ctx.ellipse(centro.sx, centro.sy, raioZ, raioX, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Áreas dos dois lados: grande (16.5 x 40.3) e pequena (5.5 x 18.3).
        const meiaGrandeX = LARGURA_BALIZA / 2 + 16.5;
        const meiaPequenaX = LARGURA_BALIZA / 2 + 5.5;
        for (const lado of [1, -1]) {
            this._rect(ctx, lado * meioZ, lado * (meioZ - 16.5), -meiaGrandeX, meiaGrandeX);
            this._rect(ctx, lado * meioZ, lado * (meioZ - 5.5), -meiaPequenaX, meiaPequenaX);
        }
    },

    _ponto: function (ctx, x, z, raio, cor, contorno) {
        const p = this.paraTela(x, z);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, raio, 0, Math.PI * 2);
        ctx.fillStyle = cor;
        ctx.fill();
        if (contorno) {
            ctx.strokeStyle = contorno;
            ctx.lineWidth = 1.2;
            ctx.stroke();
        }
    },

    update: function () {
        if (!this._ctx || !this.visivel) return;
        if (typeof Match === 'undefined' || !Match.ball) return;

        const ctx = this._ctx;
        ctx.clearRect(0, 0, this.largura, this.altura);

        // Relva com cantos redondos, por baixo de tudo.
        ctx.beginPath();
        const r = 6;
        ctx.moveTo(r, 0);
        ctx.arcTo(this.largura, 0, this.largura, this.altura, r);
        ctx.arcTo(this.largura, this.altura, 0, this.altura, r);
        ctx.arcTo(0, this.altura, 0, 0, r);
        ctx.arcTo(0, 0, this.largura, 0, r);
        ctx.closePath();
        ctx.fillStyle = this.cores.relva;
        ctx.fill();

        this.desenharCampo(ctx);

        /*
        O portador leva um anel branco — é o único ponto que interessa seguir
        de relance, e a cor da equipa sozinha não o distingue dos outros dez.
        */
        const portador = Match.ballCarrier;
        const desenharEquipa = (lista, cor) => {
            for (const p of lista) {
                if (!p || !p.model) continue;
                const c = (p.role === 'gk') ? this.cores.gk : cor;
                this._ponto(ctx, p.model.position.x, p.model.position.z,
                    this.raioJogador, c,
                    (p === portador) ? this.cores.portador : null);
            }
        };
        desenharEquipa(Match.players, this.cores.TeamA);
        desenharEquipa(Match.opponents, this.cores.TeamB);

        this._ponto(ctx, Match.ball.position.x, Match.ball.position.z,
            this.raioBola, this.cores.bola, 'rgba(0,0,0,0.65)');
    },

    setVisivel: function (on) {
        this.visivel = on;
        if (this._canvas) this._canvas.style.display = on ? 'block' : 'none';
    }
};
