const fs = require('fs');
let code = fs.readFileSync('js/fsm.js', 'utf8');

code = code.replace(/let dirToOpp = new THREE\.Vector3\(\)\.subVectors\(opp\.model\.position, p\.model\.position\)\.normalize\(\);/g, 
  "let dirToOpp = _v1.subVectors(opp.model.position, p.model.position).normalize();");

code = code.replace(/let toOpp = new THREE\.Vector3\(\)\.subVectors\(opp\.model\.position, p\.model\.position\);/g,
  "let toOpp = _v1.subVectors(opp.model.position, p.model.position);");

code = code.replace(/const toDefender = new THREE\.Vector3\(\)\.subVectors\(p\.model\.position, carrier\.model\.position\);/g,
  "const toDefender = _v1.subVectors(p.model.position, carrier.model.position);");

code = code.replace(/const toDef = new THREE\.Vector3\(\)\.subVectors\(p\.model\.position, carrierSlide\.model\.position\);/g,
  "const toDef = _v1.subVectors(p.model.position, carrierSlide.model.position);");

fs.writeFileSync('js/fsm.js', code);
console.log("Patched fsm!");
