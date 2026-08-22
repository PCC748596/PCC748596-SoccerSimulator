const fs = require('fs');

let fsm = fs.readFileSync('js/fsm.js', 'utf8');
fsm = fsm.replace(/let dirToOpp = _v1\.subVectors\(opp\.model\.position, p\.model\.position\)\.normalize\(\);/g, 
  "let dirToOpp = new THREE.Vector3().subVectors(opp.model.position, p.model.position).normalize();");
fsm = fsm.replace(/let toOpp = _v1\.subVectors\(opp\.model\.position, p\.model\.position\);/g,
  "let toOpp = new THREE.Vector3().subVectors(opp.model.position, p.model.position);");
fsm = fsm.replace(/const toDefender = _v1\.subVectors\(p\.model\.position, carrier\.model\.position\);/g,
  "const toDefender = new THREE.Vector3().subVectors(p.model.position, carrier.model.position);");
fsm = fsm.replace(/const toDef = _v1\.subVectors\(p\.model\.position, carrierSlide\.model\.position\);/g,
  "const toDef = new THREE.Vector3().subVectors(p.model.position, carrierSlide.model.position);");

fsm = fsm.replace(/_v1\.copy\(Match\.ball\.position\)/g, "Match.ball.position.clone()");
fsm = fsm.replace(/_v1\.copy\(Match\.cornerAlvo\)/g, "Match.cornerAlvo.clone()");
fsm = fsm.replace(/_v1\.copy\(p\.velocity\)\.normalize\(\)/g, "p.velocity.clone().normalize()");
fsm = fsm.replace(/_v1\.copy\(carrier\.velocity\)\.normalize\(\)/g, "carrier.velocity.clone().normalize()");
fsm = fsm.replace(/_v1\.copy\(carrierSlide\.velocity\)\.normalize\(\)/g, "carrierSlide.velocity.clone().normalize()");
fs.writeFileSync('js/fsm.js', fsm);

let player = fs.readFileSync('js/player.js', 'utf8');
player = player.replace(/let lookPos = _v1\.copy\(Match\.ball\.position\);/g, "let lookPos = Match.ball.position.clone();");

player = player.replace(/let fwd = _v1\.set\(0, 0, 1\)\.applyQuaternion\(this\.model\.quaternion\)\.normalize\(\);/g,
  "let fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.model.quaternion).normalize();");
player = player.replace(/let toTarget = _v1\.subVectors\(optPos, this\.model\.position\);/g,
  "let toTarget = new THREE.Vector3().subVectors(optPos, this.model.position);");
player = player.replace(/let maoOffset = _v1\.set\(0, 0, avancoBola\)\.applyQuaternion\(this\.model\.quaternion\);/g,
  "let maoOffset = new THREE.Vector3(0, 0, avancoBola).applyQuaternion(this.model.quaternion);");
player = player.replace(/let footOffset = _v2\.set\(0, 0, 0\.6\)\.applyQuaternion\(this\.model\.quaternion\);/g,
  "let footOffset = new THREE.Vector3(0, 0, 0.6).applyQuaternion(this.model.quaternion);");
player = player.replace(/let desired = _v1\.subVectors\(target, this\.model\.position\);/g,
  "let desired = new THREE.Vector3().subVectors(target, this.model.position);");

player = player.replace(/Match\.ball\.position\.lerp\(_v3\.copy\(this\.model\.position\)\.add\(maoOffset\)\.setY\(maoY\), 0\.5\);/g,
  "Match.ball.position.lerp(this.model.position.clone().add(maoOffset).setY(maoY), 0.5);");
player = player.replace(/Match\.ball\.position\.lerp\(_v3\.copy\(this\.model\.position\)\.add\(footOffset\), 0\.5\);/g,
  "Match.ball.position.lerp(this.model.position.clone().add(footOffset), 0.5);");
fs.writeFileSync('js/player.js', player);

let bt = fs.readFileSync('js/bt/player_bt.js', 'utf8');
bt = bt.replace(/_v2\.copy\(opp\.model\.position\)\.setY\(0\)/g, "opp.model.position.clone().setY(0)");
fs.writeFileSync('js/bt/player_bt.js', bt);
console.log("Reverted global vectors");
