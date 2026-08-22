const fs = require('fs');
let code = fs.readFileSync('js/bt/team_bt.js', 'utf8');

const target = /function pickBlocker\(bb\) \{[\s\S]*?const score = distToLine \+ \(distToCenter \* 0\.5\);/m;

const replacement = `function pickBlocker(bb) {
    if (bb.isAttacking) { bb.blocker = null; return; }
    const ballPos = Match.ball.position;
    if (!bb._goalPosCache) bb._goalPosCache = new THREE.Vector3();
    bb._goalPosCache.set(0, 0, bb.ownGoalZ);
    
    if (!bb._vBallToGoal) bb._vBallToGoal = new THREE.Vector3();
    bb._vBallToGoal.subVectors(bb._goalPosCache, ballPos);
    bb._vBallToGoal.y = 0;
    
    const distBallToGoal = bb._vBallToGoal.length();
    if (distBallToGoal < 0.1) { bb.blocker = null; return; }
    
    if (!bb._dirBallToGoal) bb._dirBallToGoal = new THREE.Vector3();
    bb._dirBallToGoal.copy(bb._vBallToGoal).normalize();
    
    let bestScore = Infinity;
    let bestBlocker = null;
    
    if (!bb._vBallToPlayer) bb._vBallToPlayer = new THREE.Vector3();
    if (!bb._vProjPos) bb._vProjPos = new THREE.Vector3();
    
    for (const p of bb.own) {
        if (!p || p.role === 'gk' || p === bb.chaser) continue;
        bb._vBallToPlayer.subVectors(p.model.position, ballPos);
        bb._vBallToPlayer.y = 0;
        
        const projLen = bb._vBallToPlayer.dot(bb._dirBallToGoal);
        if (projLen > 0 && projLen < distBallToGoal) {
            bb._vProjPos.copy(ballPos).addScaledVector(bb._dirBallToGoal, projLen);
            const distToLine = p.model.position.distanceTo(bb._vProjPos);
            const distToCenter = Math.abs(p.model.position.x);
            const score = distToLine + (distToCenter * 0.5);`;

code = code.replace(target, replacement);
fs.writeFileSync('js/bt/team_bt.js', code);
console.log("Patched pickBlocker correctly!");
