/*
=============================================================================
EDITOR DE ANIMAÇÃO — a lógica do animEditor.html
=============================================================================
Spec em docs/superpowers/specs/2026-08-25-editor-de-animacao-design.md.

Não conhece o jogo: fala com os clips do `js/config.js` e com as poses do
`js/pose.js`, e é tudo. As poses são as MESMAS que o `js/player.js` chama, e é
isso que impede o editor de mostrar um gesto que o jogo não faz.
=============================================================================
*/

/*
OS CLIPS que o editor abre, e como cada um se desenha.

`aplicar` é a ponte para o js/pose.js. As assinaturas diferem porque os gestos
diferem — o lateral precisa do ângulo do giro da cintura, o chutão precisa do
tempo normalizado para abrir os braços — e é preferível que isso apareça aqui,
à vista, do que uniformizá-las e perder o que cada uma precisa.
*/
const CLIPS = {
    ShotClip: {
        rotulo: 'Remate',
        clip: () => ShotClip,
        duracao: () => ActionAnimClips.shot.duration,
        aplicar: (rig, corpo, K) => {
            aplicarPoseRemate(rig, K);
            corpo.position.y = K.altura || 0;
        },
        amostrar: (t) => amostrarClipRemate(t)
    },
    GoalkeeperKickClip: {
        rotulo: 'Chutão do guarda-redes',
        clip: () => GoalkeeperKickClip,
        duracao: () => ActionAnimClips.gkPunt.duration,
        aplicar: (rig, corpo, K, t) => {
            aplicarPoseChutaoGR(rig, K, t);
            corpo.position.y = K.altura || 0;
        },
        amostrar: (t) => amostrarClipChuteGR(t)
    },
    GoalkeeperGroundKickClip: {
        rotulo: 'Tiro de meta (bola no chão)',
        clip: () => GoalkeeperGroundKickClip,
        duracao: () => ActionAnimClips.gkPuntChao.duration,
        // Sem `poseAnterior`: no editor não há corrida de onde misturar, o que
        // é o mesmo que uma mistura já terminada.
        aplicar: (rig, corpo, K) => aplicarPoseChuteChaoGR(rig, K, corpo, {}),
        amostrar: (t) => amostrarClipChuteChaoGR(t)
    },
    GoalkeeperThrowClip: {
        rotulo: 'Lançamento com as mãos (GR)',
        clip: () => GoalkeeperThrowClip,
        duracao: () => ActionAnimClips.gkThrow.duration,
        aplicar: (rig, corpo, K) => {
            aplicarPoseLancamentoGR(rig, K);
            corpo.position.y = K.altura || 0;
        },
        amostrar: (t) => amostrarClipLancamentoGR(t)
    },
    ThrowInClip: {
        rotulo: 'Arremesso lateral',
        clip: () => ThrowInClip,
        duracao: () => ActionAnimClips.throwIn.duration,
        /*
        O giro da cintura é fracção de um ângulo que, no jogo, aponta ao colega
        a quem se atira. Aqui não há ninguém: usa-se um valor fixo só para o
        gesto não sair todo de frente e o canal `giro` se ver a mexer.
        */
        aplicar: (rig, corpo, K) => {
            aplicarPoseLateral(rig, K, LateralPose.giroMax || 0.6);
            corpo.position.y = K.altura || 0;
        },
        amostrar: (t) => amostrarClipLateral(t)
    }
};

/*
A LEGENDA DO SINAL de cada canal.

É a parte do editor que responde a "não percebo os números": o que cada
radiano faz, e para que lado. Sai da documentação que já estava escrita nos
cabeçalhos dos clips do config.js — aqui fica debaixo do controlo que mexe,
que é onde serve.
*/
const LEGENDAS = {
    leanZ: '> 0 inclina para o lado do pé de apoio',
    pitchX: '> 0 bacia roda para a frente',
    pelvisX: '> 0 bacia roda para a frente',
    pelvisY: '> 0 bacia abre para o lado do chute',
    chest: '> 0 tronco para a FRENTE',
    chestY: '> 0 ombros rodam para o lado do chute',
    coxaChute: '> 0 perna de chute para TRÁS (< 0 para a frente)',
    joelhoChute: '> 0 joelho dobra, calcanhar sobe',
    coxaChuteZ: '> 0 perna de chute abre para fora',
    coxaApoio: '> 0 perna de apoio para trás',
    joelhoApoio: '> 0 joelho de apoio dobra',
    coxaFrente: '> 0 perna da frente para trás',
    joelhoFrente: '> 0 joelho da frente dobra',
    coxaTras: '> 0 perna de trás recua',
    joelhoTras: '> 0 joelho de trás dobra',
    coxaL: '> 0 coxa esquerda recua',
    joelhoL: '> 0 joelho esquerdo dobra',
    coxaR: '> 0 coxa direita recua',
    joelhoR: '> 0 joelho direito dobra',
    bracoX: '> 0 braços recuam (ambos)',
    bracoZ: '> 0 braços abrem para fora',
    bracoLx: '> 0 braço esquerdo recua',
    bracoLz: '> 0 braço esquerdo abre',
    bracoRx: '> 0 braço direito recua',
    bracoRz: '< 0 braço direito abre',
    cotovelo: '> 0 cotovelos dobram',
    cotoveloL: '> 0 cotovelo esquerdo dobra',
    cotoveloR: '> 0 cotovelo direito dobra',
    giro: 'fracção do giro da cintura: < 0 carrega, > 0 chicoteia',
    peLx: '> 0 ponta do pé esquerdo desce',
    peLy: 'abre o pé esquerdo para fora',
    peRx: '> 0 ponta do pé direito desce',
    peRy: 'abre o pé direito para fora',
    cabecaX: '> 0 queixo desce (olha para o chão)',
    cabecaY: 'roda a cabeça para o lado',
    altura: 'metros: sobe (> 0) ou baixa (< 0) o corpo todo'
};

// Amplitude dos sliders. `altura` é em metros e não em radianos, portanto tem
// escala própria — um slider de ±3.2 para um canal que anda nos centímetros
// era inutilizável.
const AMPLITUDE = {
    altura: 0.5, giro: 1.2,
    // Pés e cabeça andam em ângulos pequenos; um slider de ±3.2 tornava-os
    // impossíveis de afinar.
    peLx: 1.0, peLy: 1.0, peRx: 1.0, peRy: 1.0, cabecaX: 1.2, cabecaY: 1.6
};

/*
CANAIS OPCIONAIS: os pés e a cabeça não existem nos keyframes escritos até
hoje. Aparecem no painel na mesma, a zero, e só passam a existir no clip
quando se lhes mexe — é o que deixa controlá-los sem reescrever os cinco
clips à mão.
*/
const CANAIS_OPCIONAIS = ['peLx', 'peLy', 'peRx', 'peRy', 'cabecaX', 'cabecaY'];
const AMPLITUDE_OMISSAO = 3.2;

// Quebra de linha, escrita assim para nao haver escapes a partir-se nos
// blocos de texto que o editor gera.
const LF = String.fromCharCode(10);

/*
A PASSADA: legendas e amplitudes das constantes do GaitModel.

`vel` e `passada` estão em m/s e metros; as outras em radianos. Todas são
positivas — uma amplitude negativa punha o ciclo ao contrário — por isso os
sliders começam em zero e não em -amp.
*/
const LEGENDAS_GAIT = {
    vel: 'm/s típicos deste andamento (define onde ele entra na mistura)',
    passada: 'metros por ciclo completo — mexe na CADÊNCIA, não na pose',
    anca: 'amplitude da coxa (rad): quanto a perna vai à frente e atrás',
    joelhoBase: 'flexão mínima, mesmo na perna de apoio',
    joelhoOscila: 'flexão adicional na fase de balanço',
    pe: 'oscilação do tornozelo',
    braco: 'amplitude do braço (a andar quase não se mexe)',
    cotovelo: 'flexão do cotovelo (negativo estica)',
    tronco: 'inclinação para a frente: a prumo a andar, deitado a correr',
    ressalto: 'meia-amplitude da subida e descida da anca (m)'
};

const AMPLITUDE_GAIT = {
    vel: 10, passada: 5, ressalto: 0.12,
    anca: 1.6, joelhoBase: 0.6, joelhoOscila: 2.4, pe: 1.0,
    braco: 1.6, cotovelo: 2.0, tronco: 0.8
};

/*
Reescreve os números dos keyframes de um clip DENTRO do texto do config.js,
linha a linha, mantendo comentários, indentação e tudo o resto.

Função pura de propósito: é a única parte do editor que produz código para
alguém colar por cima de um ficheiro do projecto, e portanto a única que pode
destruir trabalho. Vive fora do objecto para ter teste
(tests/anim_editor_export.test.js).

Devolve `null` — e não uma versão a fingir — se não conseguir: sem o texto, sem
encontrar o clip, ou se o número de linhas de keyframe não bater certo com o
número de keyframes. Quem chama avisa e exporta sem comentários.
*/
function reescreverClipNoTexto(fonte, nomeClip, frames) {
    if (!fonte || !frames || !frames.length) return null;

    const ini = fonte.indexOf('const ' + nomeClip + ' = {');
    if (ini < 0) return null;
    const fecho = fonte.indexOf('\n};', ini);
    if (fecho < 0) return null;

    const bloco = fonte.slice(ini, fecho + 3);
    let i = 0;
    const novo = bloco.split('\n').map(linha => {
        // Só as linhas que SÃO um keyframe: abrem e fecham chaveta na própria
        // linha. Um comentário, ou a linha do `frames: [`, não são tocados.
        if (!/^\s*\{.*\},?\s*$/.test(linha)) return linha;
        const K = frames[i++];
        if (!K) return linha;
        const indent = linha.match(/^\s*/)[0];
        const fim = linha.trimEnd().endsWith(',') ? ',' : '';
        const corpo = Object.keys(K).map(c => c + ': ' + (+K[c]).toFixed(2)).join(', ');
        return indent + '{ ' + corpo + ' }' + fim;
    }).join('\n');

    return (i === frames.length) ? novo : null;
}


/*
O mesmo para o GaitModel: reescreve os números das constantes dentro do texto
do config.js, mantendo os comentários de cada linha — e ali quase todas as
linhas TÊM comentário (`anca: 0.40,  // amplitude da coxa (rad)`), portanto
perdê-los seria perder a explicação do modelo inteiro.

`gait` é o objecto com os três andamentos. Devolve `null` se não conseguir.
*/
function reescreverGaitNoTexto(fonte, gait) {
    if (!fonte || !gait) return null;

    const ini = fonte.indexOf('const GaitModel = {');
    if (ini < 0) return null;
    const fecho = fonte.indexOf('\n};', ini);
    if (fecho < 0) return null;

    let andamento = null;
    let escritos = 0;

    const novo = fonte.slice(ini, fecho + 3).split('\n').map(linha => {
        // Abertura de um andamento: `andar: {`
        const abre = linha.match(/^\s*(andar|trote|correr):\s*\{/);
        if (abre) { andamento = abre[1]; return linha; }
        if (/^\s*\},?\s*$/.test(linha)) { andamento = null; return linha; }
        if (!andamento) return linha;

        // `    anca: 0.40,           // amplitude da coxa (rad)`
        const m = linha.match(/^(\s*)([a-zA-Z]+):\s*(-?[\d.]+)(,?)(\s*\/\/.*)?$/);
        if (!m) return linha;
        const [, indent, chave, , virgula, comentario] = m;
        const g = gait[andamento];
        if (!g || typeof g[chave] !== 'number') return linha;

        escritos++;
        // O alinhamento dos comentários é preservado pelo espaçamento original
        // do comentário capturado, que vem com os seus espaços à frente.
        return `${indent}${chave}: ${g[chave]}${virgula}${comentario || ''}`;
    }).join('\n');

    return escritos > 0 ? novo : null;
}

const Editor = {
    nomeClip: 'ShotClip',
    frame: 0,
    aCorrer: false,
    tempo: 0,
    loop: true,
    fantasma: true,

    // Cópia dos clips como estavam ao abrir a página, para o "Repor" e para o
    // boneco fantasma.
    originais: {},
    // Texto do config.js, se der para o ler — ver `exportar`.
    fonteConfig: null,

    iniciar() {
        this.originais = {};
        for (const nome in CLIPS) {
            this.originais[nome] = JSON.parse(JSON.stringify(CLIPS[nome].clip().frames));
        }
        // O GaitModel também é editável, e também precisa de um original para
        // se saber o que mudou e para o "Repor".
        this.gaitOriginal = JSON.parse(JSON.stringify(GaitModel));
        this.montarCena();
        this.montarSelector();
        this.montarAbas();
        this.montarGizmo();
        this.actualizarUndo();

        document.getElementById('btn-undo').addEventListener('click', () => this.desfazer());
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                this.desfazer();
            }
        });
        this.carregarFonte();
        this.mudarClip('ShotClip');
        this.animar();
    },

    /* ------------------------------------------------------------------ */
    /* Cena                                                                */
    /* ------------------------------------------------------------------ */
    montarCena() {
        const div = document.getElementById('cena');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x14161a);

        this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
        this.camera.position.set(2.6, 1.5, 3.2);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        div.appendChild(this.renderer.domElement);

        this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2f38, 0.9));
        const sol = new THREE.DirectionalLight(0xffffff, 0.8);
        sol.position.set(3, 6, 4);
        this.scene.add(sol);

        // Chão e grelha: sem uma referência do solo não se vê se o boneco está
        // a flutuar, e o canal `altura` mexe exactamente nisso.
        const chao = new THREE.Mesh(
            new THREE.CircleGeometry(4, 48),
            new THREE.MeshStandardMaterial({ color: 0x1e2a20, roughness: 1 })
        );
        chao.rotation.x = -Math.PI / 2;
        this.scene.add(chao);
        const grelha = new THREE.GridHelper(8, 16, 0x3a4250, 0x252b34);
        this.scene.add(grelha);

        // O boneco a editar e o fantasma com o clip como está no ficheiro.
        const feito = construirCorpo('#3498db', '#34495e');
        this.corpo = feito.corpo;
        this.rig = feito.rig;
        this.scene.add(this.corpo);

        const ghost = construirCorpo('#8fa6bd', '#8fa6bd');
        this.corpoFantasma = ghost.corpo;
        this.rigFantasma = ghost.rig;
        this.corpoFantasma.traverse(o => {
            if (o.isMesh) {
                o.material = new THREE.MeshBasicMaterial({
                    color: 0x7f8fa6, transparent: true, opacity: 0.22, depthWrite: false
                });
            }
        });
        this.scene.add(this.corpoFantasma);

        this.alvoCamera = new THREE.Vector3(0, 0.9, 0);
        this.ligarOrbita(div);
        this.redimensionar();
        window.addEventListener('resize', () => this.redimensionar());
    },

    // Órbita à mão: o OrbitControls não vem no build do THREE que o projecto
    // usa, e são três eventos.
    ligarOrbita(div) {
        let a = Math.atan2(this.camera.position.x, this.camera.position.z);
        let e = Math.asin(this.camera.position.y / this.camera.position.length());
        let r = this.camera.position.length();
        let arrastar = null;

        const colocar = () => {
            e = Math.max(-1.2, Math.min(1.35, e));
            r = Math.max(1.2, Math.min(12, r));
            this.camera.position.set(
                this.alvoCamera.x + r * Math.cos(e) * Math.sin(a),
                this.alvoCamera.y + r * Math.sin(e),
                this.alvoCamera.z + r * Math.cos(e) * Math.cos(a));
            this.camera.lookAt(this.alvoCamera);
        };

        div.addEventListener('mousedown', ev => {
            // Com o gizmo agarrado, a câmara fica quieta: senão o modelo roda
            // debaixo da mão e não se percebe o que se está a fazer.
            if (this.arrastarGizmo) return;
            arrastar = { x: ev.clientX, y: ev.clientY, botao: ev.button };
            ev.preventDefault();
        });
        window.addEventListener('mouseup', () => { arrastar = null; });
        window.addEventListener('mousemove', ev => {
            if (!arrastar) return;
            const dx = ev.clientX - arrastar.x, dy = ev.clientY - arrastar.y;
            arrastar.x = ev.clientX; arrastar.y = ev.clientY;
            if (arrastar.botao === 2) {
                this.alvoCamera.y = Math.max(0, this.alvoCamera.y + dy * 0.004);
            } else {
                a -= dx * 0.008;
                e += dy * 0.006;
            }
            colocar();
        });
        div.addEventListener('wheel', ev => {
            r *= (1 + Math.sign(ev.deltaY) * 0.09);
            colocar();
            ev.preventDefault();
        }, { passive: false });
        div.addEventListener('contextmenu', ev => ev.preventDefault());
        colocar();
    },

    redimensionar() {
        const div = document.getElementById('cena');
        const l = div.clientWidth, a = div.clientHeight;
        this.renderer.setSize(l, a);
        this.camera.aspect = l / Math.max(1, a);
        this.camera.updateProjectionMatrix();
    },

    /* ------------------------------------------------------------------ */
    /* Clip actual                                                         */
    /* ------------------------------------------------------------------ */
    def() { return CLIPS[this.nomeClip]; },
    clip() { return this.def().clip(); },
    frames() { return this.clip().frames; },
    canais() {
        // Os do keyframe, mais os opcionais que ainda lá não estão.
        const presentes = Object.keys(this.frames()[0]);
        return presentes.concat(CANAIS_OPCIONAIS.filter(c => presentes.indexOf(c) === -1));
    },

    montarSelector() {
        const sel = document.getElementById('sel-clip');
        sel.innerHTML = '';
        for (const nome in CLIPS) {
            const op = document.createElement('option');
            op.value = nome;
            op.textContent = `${CLIPS[nome].rotulo}  (${nome})`;
            sel.appendChild(op);
        }
        sel.addEventListener('change', () => this.mudarClip(sel.value));

        document.getElementById('btn-play').addEventListener('click', () => this.play());
        document.getElementById('btn-loop').addEventListener('click', (e) => {
            this.loop = !this.loop;
            e.target.classList.toggle('activo', this.loop);
        });
        document.getElementById('btn-fantasma').addEventListener('click', (e) => {
            this.fantasma = !this.fantasma;
            this.corpoFantasma.visible = this.fantasma;
            e.target.classList.toggle('activo', this.fantasma);
        });
        document.getElementById('btn-copiar').addEventListener('click', () => this.exportar());
        document.getElementById('btn-repor').addEventListener('click', () => this.repor());
    },

    mudarClip(nome) {
        this.nomeClip = nome;
        this.frame = 0;
        this.aCorrer = false;
        document.getElementById('sel-clip').value = nome;
        this.montarFrames();
        this.montarCanais();
        this.desenhar();
    },

    montarFrames() {
        const div = document.getElementById('frames');
        div.innerHTML = '';
        const contacto = this.clip().contactFrame;
        this.frames().forEach((_, i) => {
            const b = document.createElement('div');
            b.className = 'frame' + (i === this.frame ? ' actual' : '') +
                (contacto === i + 1 ? ' contacto' : '');
            b.textContent = i + 1;
            b.title = (contacto === i + 1) ? 'CONTACTO — a bola sai aqui' : `keyframe ${i + 1}`;
            b.addEventListener('click', () => {
                this.aCorrer = false;
                this.frame = i;
                this.montarFrames();
                this.montarCanais();
                this.desenhar();
            });
            div.appendChild(b);
        });
    },

    montarCanais() {
        const div = document.getElementById('canais');
        div.innerHTML = '';
        const K = this.frames()[this.frame];
        const orig = this.originais[this.nomeClip][this.frame];

        document.getElementById('titulo-canais').textContent =
            `Canais — keyframe ${this.frame + 1} de ${this.frames().length}`;

        for (const canal of this.canais()) {
            const amp = AMPLITUDE[canal] || AMPLITUDE_OMISSAO;
            const bloco = document.createElement('div');
            bloco.className = 'canal' + ((K[canal] || 0) !== (orig[canal] || 0) ? ' mudado' : '');

            const topo = document.createElement('div');
            topo.className = 'canal-topo';
            const nome = document.createElement('span');
            nome.className = 'canal-nome';
            nome.textContent = canal;
            const caixa = document.createElement('input');
            caixa.className = 'canal-valor';
            caixa.type = 'number';
            caixa.step = '0.01';
            caixa.value = (+(K[canal] || 0)).toFixed(2);
            topo.appendChild(nome);
            topo.appendChild(caixa);

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = -amp; slider.max = amp; slider.step = 0.01;
            slider.value = K[canal] || 0;

            const legenda = document.createElement('div');
            legenda.className = 'canal-legenda';
            legenda.textContent = LEGENDAS[canal] || '';

            const escrever = (v) => {
                if (!isFinite(v)) return;
                K[canal] = v;
                caixa.value = (+v).toFixed(2);
                slider.value = v;
                bloco.classList.toggle('mudado', v !== (orig[canal] || 0));
                this.desenhar();
            };
            // Um instantâneo por ARRASTO, não por evento: um slider emite
            // dezenas de `input` e encheria o histórico de passos iguais.
            slider.addEventListener('pointerdown', () => this.instantaneo());
            slider.addEventListener('input', () => escrever(parseFloat(slider.value)));
            caixa.addEventListener('change', () => { this.instantaneo(); escrever(parseFloat(caixa.value)); });

            bloco.appendChild(topo);
            bloco.appendChild(slider);
            bloco.appendChild(legenda);
            div.appendChild(bloco);
        }
    },

    /* ------------------------------------------------------------------ */
    /* Desenho                                                             */
    /* ------------------------------------------------------------------ */

    // Pose parada no keyframe escolhido, ou o clip a correr se estiver em play.
    desenhar() {
        const d = this.def();
        const n = this.frames().length;
        const t = this.aCorrer ? this.tempo : (n > 1 ? this.frame / (n - 1) : 0);

        d.aplicar(this.rig, this.corpo, d.amostrar(t), t);

        if (this.fantasma) {
            // O fantasma corre o MESMO amostrador sobre os keyframes originais:
            // troca-se o conteúdo do clip, amostra-se, e repõe-se. Assim não há
            // uma segunda implementação da interpolação a divergir desta.
            const vivos = this.clip().frames;
            this.clip().frames = this.originais[this.nomeClip];
            d.aplicar(this.rigFantasma, this.corpoFantasma, d.amostrar(t), t);
            this.clip().frames = vivos;
        }
        this.estado();
    },

    animar() {
        requestAnimationFrame(() => this.animar());

        // A passada corre SEMPRE que a aba está aberta: é um ciclo contínuo,
        // não um gesto com princípio e fim.
        if (this.aba === 'passada') {
            this.desenharPassada(1 / 60);
            this.renderer.render(this.scene, this.camera);
            return;
        }

        if (this.aCorrer) {
            const dur = this.def().duracao() || 0.5;
            this.tempo += (1 / 60) / dur;
            if (this.tempo >= 1) {
                if (this.loop) this.tempo = 0;
                else { this.tempo = 1; this.aCorrer = false; this.actualizarPlay(); }
            }
            this.desenhar();
        }
        this.renderer.render(this.scene, this.camera);
    },

    play() {
        this.aCorrer = !this.aCorrer;
        if (this.aCorrer) this.tempo = 0;
        this.actualizarPlay();
    },

    actualizarPlay() {
        const b = document.getElementById('btn-play');
        b.textContent = this.aCorrer ? '❚❚ parar' : '▶ play';
        b.classList.toggle('activo', this.aCorrer);
    },

    estado() {
        const el = document.getElementById('estado');
        const dur = this.def().duracao();
        const contacto = this.clip().contactFrame;
        const mudados = this.contarMudados();
        el.textContent =
            `${this.frames().length} keyframes · ${dur.toFixed(2)} s` +
            (contacto ? ` · contacto no ${contacto}` : '') +
            (mudados ? ` · ${mudados} valor(es) alterado(s)` : ' · sem alterações');
    },

    contarMudados() {
        let n = 0;
        const orig = this.originais[this.nomeClip];
        this.frames().forEach((f, i) => {
            for (const c in f) if (f[c] !== orig[i][c]) n++;
        });
        return n;
    },

    repor() {
        if (this.aba === 'passada') {
            const nome = this.andamentoDe(this.velocidade);
            Object.assign(GaitModel[nome], this.gaitOriginal[nome]);
            this.montarCanaisPassada();
            return;
        }
        const orig = this.originais[this.nomeClip];
        this.clip().frames = JSON.parse(JSON.stringify(orig));
        this.montarCanais();
        this.desenhar();
    },


    /* ------------------------------------------------------------------ */
    /* Aba da passada                                                      */
    /* ------------------------------------------------------------------ */

    /*
    A PASSADA NÃO É UM CLIP e o painel reflecte isso: em vez de keyframes, os
    sliders são as constantes do `GaitModel` do andamento activo, e o boneco
    anda em ciclo contínuo enquanto se mexe neles.

    O andamento sai da VELOCIDADE: o `misturarAndamento` (js/utils.js)
    interpola entre andar, trote e correr conforme os m/s. Por isso o painel
    mostra as constantes do andamento mais próximo — mexer no `trote` a 7 m/s
    não mostrava nada, e era assim que se perdia meia hora à procura do erro.
    */
    aba: 'clips',
    velocidade: 4.5,
    faseCiclo: 0,

    andamentoDe(vel) {
        if (vel <= GaitModel.andar.vel) return 'andar';
        if (vel <= GaitModel.trote.vel) return 'trote';
        return 'correr';
    },

    montarAbas() {
        const trocar = (qual) => {
            this.aba = qual;
            document.getElementById('aba-clips').classList.toggle('activo', qual === 'clips');
            document.getElementById('aba-passada').classList.toggle('activo', qual === 'passada');
            document.getElementById('painel-clips').style.display = qual === 'clips' ? '' : 'none';
            document.getElementById('painel-passada').style.display = qual === 'passada' ? '' : 'none';
            // O fantasma é a pose original de um CLIP; na passada não faz sentido.
            this.corpoFantasma.visible = (qual === 'clips') && this.fantasma;
            if (qual === 'passada') this.montarCanaisPassada();
            else { this.montarCanais(); this.desenhar(); }
        };
        document.getElementById('aba-clips').addEventListener('click', () => trocar('clips'));
        document.getElementById('aba-passada').addEventListener('click', () => trocar('passada'));

        const slider = document.getElementById('vel-slider');
        const caixa = document.getElementById('vel-valor');
        const mudarVel = (v) => {
            if (!isFinite(v)) return;
            this.velocidade = Math.max(0, Math.min(9, v));
            slider.value = this.velocidade;
            caixa.value = this.velocidade.toFixed(1);
            this.montarCanaisPassada();
        };
        slider.addEventListener('input', () => mudarVel(parseFloat(slider.value)));
        caixa.addEventListener('change', () => mudarVel(parseFloat(caixa.value)));
        document.querySelectorAll('#painel-passada [data-vel]').forEach(b => {
            b.addEventListener('click', () => mudarVel(parseFloat(b.dataset.vel)));
        });
    },

    montarCanaisPassada() {
        const div = document.getElementById('canais');
        div.innerHTML = '';
        const nome = this.andamentoDe(this.velocidade);
        const G = GaitModel[nome];
        const orig = this.gaitOriginal[nome];

        document.getElementById('titulo-canais').textContent =
            `GaitModel.${nome} — a ${this.velocidade.toFixed(1)} m/s`;

        for (const canal of Object.keys(G)) {
            const amp = AMPLITUDE_GAIT[canal] || 2.0;
            const bloco = document.createElement('div');
            bloco.className = 'canal' + (G[canal] !== orig[canal] ? ' mudado' : '');

            const topo = document.createElement('div');
            topo.className = 'canal-topo';
            const et = document.createElement('span');
            et.className = 'canal-nome';
            et.textContent = canal;
            const caixa = document.createElement('input');
            caixa.className = 'canal-valor';
            caixa.type = 'number'; caixa.step = '0.01';
            caixa.value = (+G[canal]).toFixed(3);
            topo.appendChild(et); topo.appendChild(caixa);

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = 0; slider.max = amp; slider.step = 0.005;
            slider.value = G[canal];

            const legenda = document.createElement('div');
            legenda.className = 'canal-legenda';
            legenda.textContent = LEGENDAS_GAIT[canal] || '';

            const escrever = (v) => {
                if (!isFinite(v)) return;
                G[canal] = v;
                caixa.value = (+v).toFixed(3);
                slider.value = v;
                bloco.classList.toggle('mudado', v !== orig[canal]);
            };
            slider.addEventListener('input', () => escrever(parseFloat(slider.value)));
            caixa.addEventListener('change', () => escrever(parseFloat(caixa.value)));

            bloco.appendChild(topo); bloco.appendChild(slider); bloco.appendChild(legenda);
            div.appendChild(bloco);
        }

        document.getElementById('estado').textContent =
            `Andamento ${nome}. O ciclo corre sempre — mexe nos valores e vê no boneco.`;
    },

    // Um passo do ciclo, chamado por frame enquanto a aba da passada está aberta.
    desenharPassada(dt) {
        const P = getGaitPose(this.faseCiclo, this.velocidade);

        /*
        O ciclo avança com a DISTÂNCIA percorrida, não com o tempo: são
        `velocidade / passada` ciclos por segundo, a mesma conta que o jogo faz.
        Só com o tempo, mexer na `passada` não mudava nada no ecrã — e a
        passada é precisamente uma das constantes que se quer afinar.
        */
        const ciclosPorSeg = P.passada > 0 ? (this.velocidade / P.passada) : 0;
        this.faseCiclo = (this.faseCiclo + dt * ciclosPorSeg) % 1;

        aplicarPosePassada(this.rig, P, this.faseCiclo);
        this.corpo.position.y = P.ressalto;
    },


    /* ------------------------------------------------------------------ */
    /* Undo                                                                */
    /* ------------------------------------------------------------------ */

    /*
    Pilha de instantâneos do clip inteiro. Guardar o clip todo e não o valor
    que mudou é grosseiro, mas um clip são 12 keyframes de 15 números — uns
    kilobytes — e evita ter de saber desfazer cada tipo de alteração.

    O instantâneo é tirado ANTES de cada mudança, e só quando ela começa: um
    slider arrastado emite dezenas de eventos e não pode encher a pilha com
    dezenas de passos.
    */
    historico: [],
    limiteHistorico: 60,

    instantaneo() {
        this.historico.push({
            clip: this.nomeClip,
            frames: JSON.parse(JSON.stringify(this.frames()))
        });
        if (this.historico.length > this.limiteHistorico) this.historico.shift();
        this.actualizarUndo();
    },

    desfazer() {
        const passo = this.historico.pop();
        if (!passo) return;
        // Se o passo é de outro clip, volta-se a esse clip primeiro — senão o
        // undo escrevia keyframes de um gesto por cima de outro.
        if (passo.clip !== this.nomeClip) this.mudarClip(passo.clip);
        CLIPS[passo.clip].clip().frames = passo.frames;
        this.montarCanais();
        this.desenhar();
        this.actualizarUndo();
    },

    actualizarUndo() {
        const b = document.getElementById('btn-undo');
        if (!b) return;
        b.disabled = this.historico.length === 0;
        b.textContent = this.historico.length
            ? `↶ desfazer (${this.historico.length})`
            : '↶ desfazer';
    },

    /* ------------------------------------------------------------------ */
    /* Manipulação directa: clicar num membro e rodá-lo                    */
    /* ------------------------------------------------------------------ */

    /*
    QUE CANAL É QUE CADA JUNTA ESCREVE.

    É este mapa que faz o gizmo servir para alguma coisa: rodar o joelho no
    ecrã tem de ir parar ao canal certo do keyframe, senão a rotação vive só
    no editor e desaparece ao exportar.

    Por clip, porque o mesmo osso tem nomes diferentes conforme o gesto — no
    remate a perna de chute é `coxaChute`, no lateral é `coxaFrente` ou
    `coxaTras` conforme o pé da frente.

    `null` significa: esta junta não tem canal neste clip, portanto não é
    seleccionável. Mais vale não deixar mexer do que deixar mexer e perder.
    */
    canaisDaJunta(nomeJunta) {
        const c = this.nomeClip;
        const chuteR = (this.clip().pernaChute || 'r') === 'r';
        const frenteR = (typeof LateralPose !== 'undefined' && LateralPose.peFrente === 'r');

        const perna = (lado) => {
            if (c === 'ShotClip' || c === 'GoalkeeperGroundKickClip' || c === 'GoalkeeperKickClip') {
                const ehChute = (lado === 'r') === chuteR;
                return ehChute
                    ? { x: 'coxaChute', z: (c === 'GoalkeeperGroundKickClip' ? 'coxaChuteZ' : null) }
                    : { x: 'coxaApoio' };
            }
            if (c === 'ThrowInClip') {
                return ((lado === 'r') === frenteR) ? { x: 'coxaFrente' } : { x: 'coxaTras' };
            }
            if (c === 'GoalkeeperThrowClip') return { x: lado === 'l' ? 'coxaL' : 'coxaR' };
            return null;
        };
        const joelho = (lado) => {
            if (c === 'ShotClip' || c === 'GoalkeeperGroundKickClip' || c === 'GoalkeeperKickClip') {
                return ((lado === 'r') === chuteR) ? { x: 'joelhoChute' } : { x: 'joelhoApoio' };
            }
            if (c === 'ThrowInClip') {
                return ((lado === 'r') === frenteR) ? { x: 'joelhoFrente' } : { x: 'joelhoTras' };
            }
            if (c === 'GoalkeeperThrowClip') return { x: lado === 'l' ? 'joelhoL' : 'joelhoR' };
            return null;
        };
        const braco = (lado) => {
            if (c === 'GoalkeeperKickClip') return { x: 'bracoX' };
            if (c === 'ThrowInClip') return { x: 'bracoX', z: 'bracoZ' };
            return lado === 'l' ? { x: 'bracoLx', z: 'bracoLz' } : { x: 'bracoRx', z: 'bracoRz' };
        };
        const cotovelo = (lado) => {
            if (c === 'GoalkeeperKickClip' || c === 'ThrowInClip') return { x: 'cotovelo' };
            return lado === 'l' ? { x: 'cotoveloL' } : { x: 'cotoveloR' };
        };

        switch (nomeJunta) {
            case 'pelvis':
                if (c === 'ShotClip') return { y: 'pelvisY', z: 'leanZ', posY: 'altura' };
                if (c === 'GoalkeeperGroundKickClip') return { x: 'pitchX', z: 'leanZ', posY: 'altura' };
                if (c === 'ThrowInClip') return { x: 'pelvisX', posY: 'altura' };
                return { posY: 'altura' };
            case 'chest':
                return (c === 'ShotClip') ? { x: 'chest', y: 'chestY' } : { x: 'chest' };
            case 'neck': return { x: 'cabecaX', y: 'cabecaY' };
            case 'lLeg': return perna('l');
            case 'rLeg': return perna('r');
            case 'lKnee': return joelho('l');
            case 'rKnee': return joelho('r');
            case 'lArm': return braco('l');
            case 'rArm': return braco('r');
            case 'lElbow': return cotovelo('l');
            case 'rElbow': return cotovelo('r');
            case 'lFoot': return { x: 'peLx', y: 'peLy' };
            case 'rFoot': return { x: 'peRx', y: 'peRy' };
            default: return null;
        }
    },

    montarGizmo() {
        if (typeof THREE.TransformControls === 'undefined') {
            document.getElementById('estado').textContent =
                'TransformControls não carregou — o gizmo fica de fora, os sliders funcionam.';
            return;
        }
        this.gizmo = new THREE.TransformControls(this.camera, this.renderer.domElement);
        this.gizmo.setMode('rotate');
        this.gizmo.setSize(0.6);
        this.scene.add(this.gizmo);

        // Enquanto se arrasta o gizmo, a órbita da câmara fica quieta.
        this.gizmo.addEventListener('dragging-changed', (e) => {
            this.arrastarGizmo = e.value;
            if (e.value) this.instantaneo();
            else this.lerDoGizmo();
        });
        this.gizmo.addEventListener('objectChange', () => this.lerDoGizmo(true));

        this.raycaster = new THREE.Raycaster();
        this.renderer.domElement.addEventListener('pointerdown', (ev) => {
            if (this.arrastarGizmo || this.aba !== 'clips') return;
            this.seleccionarEm(ev);
        });
    },

    /*
    Selecção por raycast. Do objecto atingido sobe-se a hierarquia até dar
    numa junta do rig — as peças do corpo são filhas das juntas, e é a junta
    que roda.
    */
    seleccionarEm(ev) {
        const r = this.renderer.domElement.getBoundingClientRect();
        const rato = new THREE.Vector2(
            ((ev.clientX - r.left) / r.width) * 2 - 1,
            -((ev.clientY - r.top) / r.height) * 2 + 1);
        this.raycaster.setFromCamera(rato, this.camera);

        const bate = this.raycaster.intersectObject(this.corpo, true);
        if (!bate.length) { this.seleccionar(null); return; }

        let no = bate[0].object;
        while (no) {
            const nome = Object.keys(this.rig).find(k => this.rig[k] === no);
            if (nome && this.canaisDaJunta(nome)) { this.seleccionar(nome); return; }
            no = no.parent;
        }
        this.seleccionar(null);
    },

    seleccionar(nomeJunta) {
        this.juntaSel = nomeJunta;
        if (!this.gizmo) return;

        if (!nomeJunta) {
            this.gizmo.detach();
            document.getElementById('estado').textContent = 'Nada seleccionado.';
            return;
        }

        const canais = this.canaisDaJunta(nomeJunta);
        this.gizmo.attach(this.rig[nomeJunta]);
        /*
        SÓ ROTAÇÃO nas juntas; a bacia leva também translação, porque essa o
        clip guarda mesmo (o canal `altura`). Arrastar a posição de um joelho
        esticava o osso — e os clips só têm ângulos, portanto isso perder-se-ia
        ao exportar.
        */
        this.gizmo.setMode('rotate');
        this.gizmo.showX = !!canais.x;
        this.gizmo.showY = !!canais.y;
        this.gizmo.showZ = !!canais.z;

        const eixos = ['x', 'y', 'z'].filter(e => canais[e]).map(e => `${e}: ${canais[e]}`);
        document.getElementById('estado').textContent = eixos.length
            ? `${nomeJunta} — ${eixos.join(', ')}`
            : `${nomeJunta} — sem canais neste clip`;
    },

    // Escreve no keyframe o que o gizmo pôs no rig.
    lerDoGizmo(aoVivo) {
        if (!this.juntaSel) return;
        const canais = this.canaisDaJunta(this.juntaSel);
        const K = this.frames()[this.frame];
        const no = this.rig[this.juntaSel];
        let mudou = false;

        for (const eixo of ['x', 'y', 'z']) {
            if (!canais[eixo]) continue;
            const v = no.rotation[eixo];
            if (K[canais[eixo]] !== v) { K[canais[eixo]] = v; mudou = true; }
        }
        if (mudou && !aoVivo) this.montarCanais();
        if (mudou && aoVivo) this.actualizarValores();
    },

    // Actualiza só os números dos sliders, sem reconstruir o painel: a meio de
    // um arrasto, reconstruir apaga o elemento que está a ser arrastado.
    actualizarValores() {
        const K = this.frames()[this.frame];
        document.querySelectorAll('#canais .canal').forEach(bloco => {
            const nome = bloco.querySelector('.canal-nome').textContent;
            if (!(nome in K)) return;
            bloco.querySelector('.canal-valor').value = (+K[nome]).toFixed(2);
            bloco.querySelector('input[type=range]').value = K[nome];
        });
    },

    /* ------------------------------------------------------------------ */
    /* Exportar                                                            */
    /* ------------------------------------------------------------------ */

    /*
    Lê o próprio config.js como TEXTO, para o exportador poder reescrever só os
    números e deixar tudo o resto onde está.

    PORQUÊ: os clips não são só números. Têm um cabeçalho que descreve as fases
    do gesto e um comentário por keyframe (`// 4 armação máxima`,
    `// 8 CONTACTO`). Um exportador que cuspisse JSON destruía tudo isso ao
    colar — e é metade do valor do ficheiro.

    Aberta a página por file://, o fetch falha. Nesse caso o editor avisa e
    exporta sem os comentários, em vez de os apagar em silêncio.
    */
    carregarFonte() {
        fetch('js/config.js')
            .then(r => r.ok ? r.text() : Promise.reject(r.status))
            .then(t => { this.fonteConfig = t; })
            .catch(() => { this.fonteConfig = null; });
    },

    /*
    Reescreve os números de cada keyframe no texto original do clip, linha a
    linha, mantendo comentários e formatação. Devolve `null` se não conseguir —
    e não uma versão a fingir.
    */
    reescreverNoTexto() {
        return reescreverClipNoTexto(this.fonteConfig, this.nomeClip, this.frames());
    },

    exportar() {
        const area = document.getElementById('saida');
        if (this.aba === 'passada') return this.exportarGait();
        const comComentarios = this.reescreverNoTexto();

        let texto;
        if (comComentarios) {
            texto = comComentarios;
        } else {
            const c = this.clip();
            const linhas = this.frames().map((K, i) =>
                `        // ${i + 1}\n        { ` +
                Object.keys(K).map(k => `${k}: ${(+K[k]).toFixed(2)}`).join(', ') + ' },');
            texto =
                `// ATENÇÃO: exportado SEM os comentários originais do config.js.\n` +
                `// (não consegui ler o ficheiro — a página está aberta por file://?\n` +
                `//  com o servidor de desenvolvimento, npm run dev, os comentários\n` +
                `//  são preservados). Compara antes de colar.\n` +
                `const ${this.nomeClip} = {\n` +
                (c.pernaChute ? `    pernaChute: '${c.pernaChute}',\n` : '') +
                (c.contactFrame ? `    contactFrame: ${c.contactFrame},\n` : '') +
                `    frames: [\n${linhas.join('\n')}\n    ]\n};`;
        }

        area.style.display = 'block';
        area.value = texto;
        area.select();
        try { document.execCommand('copy'); } catch (e) { /* o utilizador copia à mão */ }

        document.getElementById('estado').textContent = comComentarios
            ? 'Copiado, com os comentários do config.js preservados. Cola por cima do bloco antigo.'
            : 'Copiado SEM comentários — ver o aviso no texto. Cola com cuidado.';
    },

    /*
    Exporta o GaitModel inteiro — os três andamentos de uma vez, e não só o
    que está no painel: eles interpolam entre si (misturarAndamento), portanto
    colar um sem os outros deixa o config num estado que não corresponde ao
    que se viu no ecrã.
    */
    exportarGait() {
        const area = document.getElementById('saida');
        const texto = reescreverGaitNoTexto(this.fonteConfig, GaitModel);
        const estado = document.getElementById('estado');

        if (!texto) {
            area.style.display = 'block';
            area.value =
                '// Nao consegui ler o js/config.js para preservar os comentarios.' + LF +
                '// A pagina esta aberta por file://? Com o servidor (npm run dev)' + LF +
                '// isto funciona. Valores actuais, para copiares a mao:' + LF +
                JSON.stringify(GaitModel, null, 4);
            estado.textContent = 'Exportado SEM comentários — ver o aviso no texto.';
            return;
        }

        area.style.display = 'block';
        area.value = texto;
        area.select();
        try { document.execCommand('copy'); } catch (e) { /* copia-se à mão */ }
        estado.textContent = 'GaitModel copiado (os três andamentos), com os ' +
            'comentários preservados. Cola por cima do bloco no config.js.';
    }
};

window.addEventListener('DOMContentLoaded', () => Editor.iniciar());
