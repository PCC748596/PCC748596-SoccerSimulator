/*
=============================================================================
AMBIENTE SONORO — o ruído do estádio
=============================================================================
Uma faixa em loop (assets/SoccerStadium1.mp3), com o volume a acompanhar o
que se passa no jogo: sobe quando uma equipa ataca, dispara no golo, e volta
ao murmúrio de fundo quando o jogo está parado.

O VOLUME SEGUE A MESMA FONTE QUE A BANCADA. O `CrowdTrigger` (js/crowd.js) já
decide quantos adeptos estão de pé a partir do estado do jogo; ler daí é o que
mantém o som e a imagem a dizer a mesma coisa. Com um gatilho próprio, o
público levantava-se num lance e o som subia noutro.

AUTOPLAY. Os browsers não deixam tocar áudio antes de a pessoa interagir com a
página — o `play()` é recusado com uma promessa rejeitada, sem erro visível.
Por isso a primeira tentativa é no arranque (funciona se a pessoa já tiver
interagido, por exemplo ao recarregar) e há uma segunda ligada ao primeiro
clique ou tecla.
=============================================================================
*/

const AmbienteSonoro = {
    /*
    Volumes por situação. São baixos de propósito: isto é ruído de fundo, e um
    som de estádio a tocar alto durante 90 minutos cansa em três.
    */
    volumeRepouso: 0.25,
    volumeAtaque: 0.55,
    volumeGolo: 1.00,

    // Segundos para o volume subir e descer. A subida é mais rápida do que a
    // descida: uma bancada acende-se de repente e vai-se abaixo devagar.
    subida: 0.6,
    descida: 2.5,

    _audio: null,
    /*
    ARRANCA DESLIGADO, e o botão do painel nasce em OFF a condizer
    (index.html, `btn-som`). Quem quiser som liga-o; um separador a abrir
    sozinho com estádio a tocar é intrusivo, e a política de autoplay dos
    browsers ia recusá-lo na mesma até à primeira interacção.
    */
    _ligado: false,
    _alvo: 0.25,
    _actual: 0.25,
    _tentouTocar: false,

    init() {
        this._audio = new Audio('assets/SoccerStadium1.mp3');
        this._audio.loop = true;
        this._audio.preload = 'auto';
        // Desligado nasce MESMO a zero: o `update` só corrige no frame
        // seguinte, e esse frame chegava a sair com som.
        this._audio.volume = this._ligado ? this._actual : 0;

        this.tentarTocar();

        /*
        Segunda tentativa, à primeira interacção. `once` em ambos: depois de
        um deles pegar, o outro deixa de interessar.
        */
        const arrancar = () => this.tentarTocar();
        window.addEventListener('pointerdown', arrancar, { once: true });
        window.addEventListener('keydown', arrancar, { once: true });
    },

    tentarTocar() {
        if (!this._audio || !this._ligado || this._tentouTocar && !this._audio.paused) return;
        const p = this._audio.play();
        if (p && p.catch) {
            // Recusado pela política de autoplay: não é erro, fica à espera da
            // interacção. Um console.error aqui só sujava a consola.
            p.then(() => { this._tentouTocar = true; }).catch(() => { });
        } else {
            this._tentouTocar = true;
        }
    },

    /*
    Corre por frame. O alvo do volume sai do que a claque está a fazer — a
    mesma leitura que põe os adeptos de pé.
    */
    update(dt) {
        if (!this._audio) return;

        this._alvo = this.volumeAlvo();

        // Aproximação exponencial, com constante de tempo diferente a subir e
        // a descer.
        const tau = (this._alvo > this._actual) ? this.subida : this.descida;
        const k = 1 - Math.exp(-dt / Math.max(0.01, tau));
        this._actual += (this._alvo - this._actual) * k;

        this._audio.volume = this._ligado
            ? Math.max(0, Math.min(1, this._actual))
            : 0;
    },

    /*
    Lê o estado do jogo pelo mesmo caminho que a bancada: se alguma claque
    está a festejar, é golo; se alguma está de pé acima do repouso, há ataque.
    Sem o Crowd carregado, fica no murmúrio de fundo.
    */
    volumeAlvo() {
        if (typeof Crowd === 'undefined' || !Crowd._frac) return this.volumeRepouso;
        if (typeof Match !== 'undefined' && Match.state === 'GOAL') return this.volumeGolo;

        const maior = Math.max(Crowd._frac.A || 0, Crowd._frac.B || 0);
        const repouso = (typeof CrowdModel !== 'undefined') ? CrowdModel.fraccaoRepouso : 0.08;
        return (maior > repouso + 0.01) ? this.volumeAtaque : this.volumeRepouso;
    },

    setLigado(on) {
        this._ligado = on;
        if (!this._audio) return;
        if (on) this.tentarTocar();
        else this._audio.volume = 0;
    },

    get ligado() { return this._ligado; }
};
