const fs = require('fs');
let code = fs.readFileSync('js/crowd.js', 'utf8');

const buildStart = code.indexOf('    build(scene, lugares) {');
const buildEnd = code.indexOf('    setFraccao(claque, fraccao, festa) {') - 10;

const newBuild = `    build(scene, lugares) {
        if (!lugares || !lugares.length) return null;

        const geos = this.geometrias();
        const canais = Object.keys(geos);
        const nTotal = Math.min(CrowdModel.total, lugares.length);

        const dummy = new THREE.Object3D();
        const cor = new THREE.Color();
        const uniforms = this._criarUniforms();

        let semente = 20260824;
        const rnd = () => {
            semente = (semente * 1103515245 + 12345) & 0x7fffffff;
            return semente / 0x7fffffff;
        };

        let zMin = Infinity, zMax = -Infinity;
        for (const l of lugares) { if (l.z < zMin) zMin = l.z; if (l.z > zMax) zMax = l.z; }
        const spanZ = Math.max(1e-6, zMax - zMin);

        const ordem = lugares.map((_, i) => i);
        for (let i = ordem.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const tmp = ordem[i]; ordem[i] = ordem[j]; ordem[j] = tmp;
        }

        const lugaresEscolhidos = [];
        for (let i = 0; i < nTotal; i++) {
            lugaresEscolhidos.push(lugares[ordem[i]]);
        }
        lugaresEscolhidos.sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));

        const variar = (hex) => {
            cor.set(hex);
            const k = 1 + (rnd() - 0.5) * 2 * CrowdModel.variacaoCor;
            cor.multiplyScalar(k);
            return cor;
        };

        const TAMANHO_CHUNK = 800; 
        const numChunks = Math.ceil(nTotal / TAMANHO_CHUNK);
        this._grupos = [];

        for (let c = 0; c < numChunks; c++) {
            const inicio = c * TAMANHO_CHUNK;
            const fim = Math.min(inicio + TAMANHO_CHUNK, nTotal);
            const nChunk = fim - inicio;

            const aAdepto = new Float32Array(nChunk * 4);
            const meshes = {};

            for (const canal of canais) {
                const geoChunk = geos[canal].clone();
                const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 });
                this._aplicarShader(mat, uniforms);
                
                const m = new THREE.InstancedMesh(geoChunk, mat, nChunk);
                m.castShadow = false;
                m.receiveShadow = false;
                m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
                m.frustumCulled = true;
                
                geoChunk.setAttribute('aAdepto', new THREE.InstancedBufferAttribute(aAdepto, 4));
                meshes[canal] = m;
            }

            let minBox = new THREE.Vector3(Infinity, Infinity, Infinity);
            let maxBox = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

            for (let i = 0; i < nChunk; i++) {
                const l = lugaresEscolhidos[inicio + i];
                const t = (l.z - zMin) / spanZ;
                const claque = this.claqueEm(t, rnd);
                const eq = CrowdModel.equipas[claque];
                const escala = CrowdModel.escalaMin + rnd() * (CrowdModel.escalaMax - CrowdModel.escalaMin);

                dummy.position.set(l.x, l.y, l.z);
                dummy.rotation.set(0, l.rotY + (rnd() - 0.5) * 2 * CrowdModel.variacaoRotacao, 0);
                dummy.scale.set(escala, escala, escala);
                dummy.updateMatrix();

                for (const canal of canais) meshes[canal].setMatrixAt(i, dummy.matrix);

                aAdepto[i * 4 + 0] = rnd();
                aAdepto[i * 4 + 1] = rnd() * Math.PI * 2;
                aAdepto[i * 4 + 2] = 0.85 + rnd() * 0.30;
                aAdepto[i * 4 + 3] = (claque === 'A') ? 0 : 1;

                meshes.camisa && meshes.camisa.setColorAt(i, variar(eq.camisa));
                meshes.calcao && meshes.calcao.setColorAt(i, variar(eq.calcao));
                meshes.pele && meshes.pele.setColorAt(i, variar(CrowdModel.peles[Math.floor(rnd() * CrowdModel.peles.length)]));
                meshes.cabelo && meshes.cabelo.setColorAt(i, variar(CrowdModel.cabelos[Math.floor(rnd() * CrowdModel.cabelos.length)]));

                minBox.x = Math.min(minBox.x, l.x - 3);
                minBox.y = Math.min(minBox.y, l.y - 3);
                minBox.z = Math.min(minBox.z, l.z - 3);
                maxBox.x = Math.max(maxBox.x, l.x + 3);
                maxBox.y = Math.max(maxBox.y, l.y + 6); 
                maxBox.z = Math.max(maxBox.z, l.z + 3);
            }

            const bBox = new THREE.Box3(minBox, maxBox);
            const bSphere = new THREE.Sphere();
            bBox.getBoundingSphere(bSphere);

            for (const canal of canais) {
                meshes[canal].instanceMatrix.needsUpdate = true;
                if (meshes[canal].instanceColor) meshes[canal].instanceColor.needsUpdate = true;
                meshes[canal].geometry.attributes.aAdepto.needsUpdate = true;
                meshes[canal].count = nChunk;
                
                meshes[canal].boundingBox = bBox;
                meshes[canal].boundingSphere = bSphere;

                scene.add(meshes[canal]);
            }
            
            this._grupos.push(meshes);
        }

        if (typeof console !== 'undefined' && console.log) {
            console.log(\`Crowd: \${nTotal} adeptos em \${lugares.length} lugares particionados em \${numChunks} chunks com frustum culling ativo!\`);
        }

        this._meshes = this._grupos[0]; 
        this._uniforms = uniforms;
        this._tempo = 0;
        this._frac = { A: -1, B: -1 };
        CrowdTrigger.reset();

        this.setFraccao('A', CrowdModel.fraccaoRepouso, false);
        this.setFraccao('B', CrowdModel.fraccaoRepouso, false);
        return this._grupos;
    },
`;

code = code.substring(0, buildStart) + newBuild + code.substring(buildEnd);
fs.writeFileSync('js/crowd.js', code);
