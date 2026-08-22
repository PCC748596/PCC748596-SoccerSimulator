const fs = require('fs');
let code = fs.readFileSync('js/fsm.js', 'utf8');

// We have things like:
// let dirToOpp = new THREE.Vector3().subVectors(opp.model.position, p.model.position).normalize();
code = code.replace(/let dirToOpp = new THREE\.Vector3\(\)\.subVectors\((.*?), (.*?)\)\.normalize\(\);/g, 
  "let dirToOpp = _v1.subVectors($1, $2).normalize().clone(); // Need to clone if used later? Wait, no, we can avoid new.");
fs.writeFileSync('js/fsm.js', code);
