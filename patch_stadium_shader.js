const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

// 1. In createStadium, find specMat creation and add onBeforeCompile
const specMatOriginal = `const specMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });`;
const specMatNew = `const specMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
        specMat.userData = { time: { value: 0 }, excitement: { value: 0 } };
        specMat.onBeforeCompile = function (shader) {
            shader.uniforms.uTime = specMat.userData.time;
            shader.uniforms.uExcitement = specMat.userData.excitement;
            shader.vertexShader = 'uniform float uTime;\\nuniform float uExcitement;\\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                \`
                #ifdef USE_INSTANCING
                float phase = instanceMatrix[3].x * 13.0 + instanceMatrix[3].z * 7.0;
                float t = uTime;
                float exc = uExcitement;
                
                float standUp = 0.0;
                float armWave = 0.0;
                float lean = 0.0;
                
                float wavePhase = mod(floor(phase * 10.0), 3.0);
                standUp = abs(sin(t * (4.0 + wavePhase) + phase)) * 0.12;
                
                if (exc > 0.7) {
                    standUp = 0.15 + abs(sin(t * 9.0 + phase)) * 0.18;
                    armWave = sin(t * 11.0 + phase) * 0.25;
                } else if (exc > 0.35) {
                    standUp *= 1.4;
                    armWave = sin(t * 6.0 + phase) * 0.12;
                    lean = sin(t * 4.0 + phase) * 0.04;
                } else {
                    lean = sin(t * 2.0 + phase) * 0.02;
                }

                transformed.y += standUp;
                transformed.x += lean;
                
                float cW = cos(armWave);
                float sW = sin(armWave);
                float tx = transformed.x;
                float tz = transformed.z;
                transformed.x = tx * cW - tz * sW;
                transformed.z = tx * sW + tz * cW;
                #endif
                
                #include <project_vertex>
                \`
            );
        };`;

code = code.replace(specMatOriginal, specMatNew);

// 2. Replace updateCrowd function entirely
const updateCrowdRegex = /updateCrowd:\s*function\s*\(dt\)\s*\{[\s\S]*?\}\s*,\s*\/\*/;
const updateCrowdNew = `updateCrowd: function (dt) {
        if (!this.specMesh || !this.specMesh.material.userData.time) return;
        
        this.crowdTimer += dt;
        let targetExcitement = 0.0;
        
        if (this.state === 'GOAL') {
            targetExcitement = 1.0;
        } else if (this.ballVel.lengthSq() > 400) {
            targetExcitement = 0.7;
        } else if (this.ball && Math.abs(this.ball.position.z) > 40) {
            targetExcitement = 0.5;
        } else if (this.ballCarrier && this.ballVel.lengthSq() > 100) {
            targetExcitement = 0.3;
        } else {
            targetExcitement = 0.05;
        }
        
        this.crowdExcitement += (targetExcitement - this.crowdExcitement) * dt * 3.0;
        
        // Pass uniforms to GPU Shader
        this.specMesh.material.userData.time.value = this.crowdTimer;
        this.specMesh.material.userData.excitement.value = this.crowdExcitement;
    },

    /*`;

code = code.replace(updateCrowdRegex, updateCrowdNew);

fs.writeFileSync('js/match.js', code);
