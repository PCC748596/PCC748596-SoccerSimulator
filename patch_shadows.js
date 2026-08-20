const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

code = code.replace(/function criarPeca\(geo, mat\) \{[\s\S]*?return m;\s*\}/, `function criarPeca(geo, mat, castShadow = true) { 
            const m = new THREE.Mesh(geo, mat); 
            m.castShadow = castShadow; 
            m.receiveShadow = true; 
            return m; 
        }`);

// Replace calls to `criarPeca` to pass `false` for small parts.
// Pelvis, Chest, Head, Legs cast shadows. Arms, elbows, feet, neck do not.
// Wait, to be safe, I'll just change the default to false, and only enable it for a few.
code = code.replace(/function criarPeca\(geo, mat, castShadow = true\) \{/, `function criarPeca(geo, mat, castShadow = false) {`);

// Pelvis (includes shorts)
code = code.replace(/const pelvis = criarPeca\(new THREE\.BoxGeometry\(u \* 1\.3, u \* 0\.6, u \* 0\.8\), blockMat\);/, 
                    `const pelvis = criarPeca(new THREE.BoxGeometry(u * 1.3, u * 0.6, u * 0.8), blockMat, true);`);

// Chest
code = code.replace(/const chest = criarPeca\(new THREE\.BoxGeometry\(u \* 1\.4, u \* 1\.3, u \* 0\.85\), blockMat\);/,
                    `const chest = criarPeca(new THREE.BoxGeometry(u * 1.4, u * 1.3, u * 0.85), blockMat, true);`);

// Head
code = code.replace(/const cabeca = criarPeca\(new THREE\.BoxGeometry\(u, u \* 1\.1, u\), skinMat\);/,
                    `const cabeca = criarPeca(new THREE.BoxGeometry(u, u * 1.1, u), skinMat, true);`);
                    
// Legs
code = code.replace(/const perna = criarPeca\(new THREE\.BoxGeometry\(u \* 0\.55, u \* 1\.1, u \* 0\.55\), skinMat\);/g,
                    `const perna = criarPeca(new THREE.BoxGeometry(u * 0.55, u * 1.1, u * 0.55), skinMat, true);`);

fs.writeFileSync('js/player.js', code);
