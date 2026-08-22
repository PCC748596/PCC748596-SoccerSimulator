const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

code = code.replace(/const distSq = p\.model\.position\.distanceToSquared\(new THREE\.Vector3\(targetX, ALTURA_BASE_Y, targetZ\)\);/g,
  "const distSq = p.model.position.distanceToSquared(_v1.set(targetX, ALTURA_BASE_Y, targetZ));");

code = code.replace(/this\.cornerAlvo = new THREE\.Vector3\(canto\.alvo\.x, ALTURA_BASE_Y, canto\.alvo\.z\);/g,
  "if (!this.cornerAlvo) this.cornerAlvo = new THREE.Vector3(); this.cornerAlvo.set(canto.alvo.x, ALTURA_BASE_Y, canto.alvo.z);");

code = code.replace(/p\.dynamicTarget = new THREE\.Vector3\(0, ALTURA_BASE_Y, -48 \* dir\);/g,
  "p.dynamicTarget.set(0, ALTURA_BASE_Y, -48 * dir);");

code = code.replace(/p\.dynamicTarget = new THREE\.Vector3\(p\.baseTarget\.x, ALTURA_BASE_Y, z\);/g,
  "p.dynamicTarget.set(p.baseTarget.x, ALTURA_BASE_Y, z);");

fs.writeFileSync('js/match.js', code);
console.log("Patched match!");
