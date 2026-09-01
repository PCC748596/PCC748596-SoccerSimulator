/*
=============================================================================
EFEITOS SONOROS — o apito do árbitro e o chute na bola
=============================================================================
Duas amostras curtas (assets/apito.mpeg, assets/chute.mpeg), disparadas por
acontecimentos do jogo. Não é ambiente: o `AmbienteSonoro` é uma faixa em loop
com o volume a acompanhar a bancada, isto são sons pontuais.

POOL DE VOZES, e é a razão de este módulo não ser três linhas. Um único
elemento `Audio` por som não se sobrepõe a si próprio: chamar `play()` numa
amostra que ainda está a tocar reinicia-a. Num remate seguido de um corte, ou
num apito de falta em cima de outro, o segundo som comia o primeiro. Cada som
tem `vozes` cópias e usa-se a que estiver livre — e se nenhuma estiver, a mais
antiga, que é a que já quase acabou.

O INTERRUPTOR É O MESMO do ambiente. O botão do painel (`btn-som`) chama o
`AmbienteSonoro.setLigado`, e este módulo lê `AmbienteSonoro.ligado` na hora de
tocar: um só botão desliga o som todo, que é o que a pessoa espera. Sem o
`AmbienteSonoro` carregado, toca (é a resposta menos surpreendente para quem
incluir só este ficheiro).

CADÊNCIA MÍNIMA por som (`intervaloMin`): um passe, um corte e outro passe no
mesmo terço de segundo davam três chutes sobrepostos, que se ouve como um
estalo. O primeiro toca, os que caem dentro da janela não.
=============================================================================
*/

const EfeitosSonoros = {
    /*
    Volumes por som. O apito é o mais alto de propósito — é uma decisão de
    arbitragem, tem de cortar o ruído do estádio; o chute vive por baixo dele.
    */
    volumeApito: 0.55,
    volumeChute: 0.40,

    /*
    O ESTÁDIO NO GOLO (assets/Soccer_Crowd_Cheerin.mp3).

    Alto de propósito, e acima do apito: é a única altura em que o estádio
    tapa tudo o resto. Não leva atenuação por distância — a bancada não está
    onde a bola está.
    */
    volumeGolo: 0.75,

    // Quantas cópias de cada som podem tocar ao mesmo tempo.
    vozes: 4,

    // Segundos mínimos entre dois disparos do MESMO som.
    intervaloMinApito: 0.25,
    intervaloMinChute: 0.08,
    /*
    O festejo é longo; dois golos seguidos dentro deste intervalo (só acontece
    com o jogo em 10x) não sobrepõem duas multidões.
    */
    intervaloMinGolo: 3.0,

    /*
    Distância a partir da qual o chute deixa de se ouvir, e a que ele já está
    ao pé do ouvido. Entre as duas o volume cai linearmente — sem isto, um
    passe no outro extremo do campo soava tão perto como um remate à nossa
    frente. O apito não leva isto: o árbitro apita para o estádio.
    */
    distChuteMax: 60.0,
    distChutePerto: 12.0,

    _sons: {},
    _iniciado: false,

    /*
    `caminhos` permite ao chamador trocar os ficheiros sem mexer aqui; a
    omissão usa os do projecto.
    */
    init(caminhos) {
        if (this._iniciado) return;
        this._iniciado = true;

        const c = caminhos || {};
        this._criar('apito', c.apito || 'assets/apito.mpeg', this.volumeApito);
        this._criar('chute', c.chute || 'assets/chute.mpeg', this.volumeChute);
        this._criar('golo', c.golo || 'assets/Soccer_Crowd_Cheerin.mp3', this.volumeGolo);
    },

    _criar(nome, url, volume) {
        if (typeof Audio === 'undefined') return;   // ambiente sem DOM (testes)
        const vozes = [];
        for (let i = 0; i < this.vozes; i++) {
            const a = new Audio(url);
            a.preload = 'auto';
            a.volume = volume;
            vozes.push(a);
        }
        this._sons[nome] = { vozes: vozes, volume: volume, proxima: 0, ultimo: -Infinity };
    },

    /*
    Ligado só quando o ambiente está ligado: um botão, um som. Ver o cabeçalho.
    */
    get ligado() {
        return (typeof AmbienteSonoro === 'undefined') ? true : !!AmbienteSonoro.ligado;
    },

    /*
    Toca uma amostra. `ganho` (0..1) escala o volume base — é por aí que o
    chute longe soa mais baixo do que o chute ao lado.
    */
    tocar(nome, ganho, intervaloMin) {
        if (!this.ligado) return;
        const som = this._sons[nome];
        if (!som || !som.vozes.length) return;

        const agora = (typeof performance !== 'undefined' && performance.now)
            ? performance.now() / 1000 : Date.now() / 1000;
        const janela = (typeof intervaloMin === 'number') ? intervaloMin : 0;
        if (agora - som.ultimo < janela) return;
        som.ultimo = agora;

        // Voz livre; se nenhuma estiver, a próxima da roda (a mais antiga).
        let voz = null;
        for (const a of som.vozes) {
            if (a.paused || a.ended) { voz = a; break; }
        }
        if (!voz) {
            voz = som.vozes[som.proxima];
            som.proxima = (som.proxima + 1) % som.vozes.length;
        }

        const g = (typeof ganho === 'number') ? Math.max(0, Math.min(1, ganho)) : 1;
        voz.volume = som.volume * g;
        try {
            voz.currentTime = 0;
            const pr = voz.play();
            // Autoplay recusado antes da primeira interacção: não é erro.
            if (pr && pr.catch) pr.catch(() => { });
        } catch (e) { /* a amostra ainda não carregou; o próximo disparo pega */ }
    },

    /*
    APITO. Um toque por decisão do árbitro: falta, penálti, golo, começo e fim
    de cada parte.
    */
    apito(forca) {
        this.tocar('apito', forca, this.intervaloMinApito);
    },

    /*
    GOLO. A bancada. Uma voz só, e sem atenuação por distância: o estádio
    inteiro festeja, não é um som que venha de um sítio do campo.
    */
    golo() {
        this.tocar('golo', 1.0, this.intervaloMinGolo);
    },

    /*
    CHUTE. `pos` é onde a bola foi batida — o volume cai com a distância à
    câmara (ver distChuteMax). `forca` (0..1) distingue um toque de condução
    de um remate; sem ela assume-se um passe normal.
    */
    chute(pos, forca) {
        const f = (typeof forca === 'number') ? Math.max(0.25, Math.min(1, forca)) : 0.7;
        this.tocar('chute', f * this._ganhoPorDistancia(pos), this.intervaloMinChute);
    },

    /*
    1.0 até `distChutePerto`, a descer até 0 em `distChuteMax`. Sem câmara na
    cena (ou sem posição), não atenua nada.
    */
    _ganhoPorDistancia(pos) {
        const cam = (typeof window !== 'undefined') ? window.cameraCore : null;
        if (!pos || !cam || !cam.position) return 1;
        const d = Math.hypot(
            pos.x - cam.position.x,
            (pos.y || 0) - cam.position.y,
            pos.z - cam.position.z);
        if (d <= this.distChutePerto) return 1;
        if (d >= this.distChuteMax) return 0;
        return 1 - (d - this.distChutePerto) / (this.distChuteMax - this.distChutePerto);
    }
};
