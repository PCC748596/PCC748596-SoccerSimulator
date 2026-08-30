const profundidade = 30; // short
function getOffsets(bZ, isAttacking, isOffensive) {
    let targetOffsetZ = 0;
    let offsetDefesa = (isOffensive ? 5.0 : 0.0) + (profundidade / 3);
    let offsetMeio = 10.0;
    let offsetAtaque = 5.0 - (profundidade / 3);

    if (isAttacking) {
        if (bZ < -20.0) {
            let dist = Math.min(10.0, -20.0 - bZ);
            let f = dist / 10.0;
            targetOffsetZ = offsetMeio * (1 - f) + offsetDefesa * f;
        } else if (bZ > 20.0) {
            let dist = Math.min(10.0, bZ - 20.0);
            let f = dist / 10.0;
            targetOffsetZ = offsetMeio * (1 - f) + offsetAtaque * f;
        } else {
            targetOffsetZ = offsetMeio;
        }
    } else {
        targetOffsetZ = -5.0;
        if (isOffensive && bZ < 0) {
            targetOffsetZ = offsetDefesa;
        }
    }
    
    let centroZ = bZ + targetOffsetZ;
    let z0 = centroZ - profundidade/2;
    let zMid = z0 + profundidade/3;
    let zAtk = z0 + 2*profundidade/3;
    
    let active = bZ < zMid ? "DEF" : (bZ < zAtk ? "MID" : "ATK");
    return { bZ, targetOffsetZ, zMid, active };
}

console.log("Attacking (Offensive):");
console.log(getOffsets(-30, true, true));
console.log(getOffsets(0, true, true));
console.log(getOffsets(30, true, true));
console.log("Defending (Offensive):");
console.log(getOffsets(-30, false, true));
console.log(getOffsets(0, false, true));
