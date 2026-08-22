const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

code = code.replace(/let fwd = new THREE\.Vector3\(0, 0, 1\)\.applyQuaternion\(this\.model\.quaternion\)\.normalize\(\);/g,
  "let fwd = _v1.set(0, 0, 1).applyQuaternion(this.model.quaternion).normalize();");

code = code.replace(/let toTarget = new THREE\.Vector3\(\)\.subVectors\(optPos, this\.model\.position\);/g,
  "let toTarget = _v1.subVectors(optPos, this.model.position);");

code = code.replace(/let maoOffset = new THREE\.Vector3\(0, 0, avancoBola\)\.applyQuaternion\(this\.model\.quaternion\);/g,
  "let maoOffset = _v1.set(0, 0, avancoBola).applyQuaternion(this.model.quaternion);");

code = code.replace(/let footOffset = new THREE\.Vector3\(0, 0, 0\.6\)\.applyQuaternion\(this\.model\.quaternion\);/g,
  "let footOffset = _v2.set(0, 0, 0.6).applyQuaternion(this.model.quaternion);");

code = code.replace(/let desired = new THREE\.Vector3\(\)\.subVectors\(target, this\.model\.position\);/g,
  "let desired = _v1.subVectors(target, this.model.position);");

fs.writeFileSync('js/player.js', code);
console.log("Patched player.js vectors!");
