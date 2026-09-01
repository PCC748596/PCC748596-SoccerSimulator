const profundidade = 30; // short
const targetOffsetZ = profundidade / 6; // 5
console.log("targetOffsetZ:", targetOffsetZ);
const centroZ = 0 + targetOffsetZ; // ball at 0
const z0 = centroZ - profundidade/2;
const z1 = centroZ + profundidade/2;
const zMid = z0 + profundidade/3;
const zAtk = z0 + 2*profundidade/3;
console.log(`z0: ${z0}, zMid: ${zMid}, ball: 0, zAtk: ${zAtk}, z1: ${z1}`);
