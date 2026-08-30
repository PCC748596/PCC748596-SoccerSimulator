const profundidade = 30;
function test(bolaZDir, dir, isOffensive) {
    let targetOffsetZ = 0;
    let offsetDefesa = (isOffensive ? 5.0 : 0.0) + (profundidade / 3);
    let offsetMeio = 10.0;
    let offsetAtaque = 5.0 - (profundidade / 3);

    let bZ = bolaZDir;
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

    let centroZ = bolaZDir + targetOffsetZ;
    let z0 = centroZ - (profundidade / 2);
    let z1 = centroZ + (profundidade / 2);

    let cbZ = z0;
    let cmZ = centroZ;

    let zAlvoCB = cbZ;
    let zAlvoCM = cmZ;

    // distFrente/Tras for CB
    let distFrenteCB = 0;
    let distTrasCB = 15;
    if (zAlvoCB > bolaZDir + distFrenteCB) zAlvoCB = bolaZDir + distFrenteCB;
    if (zAlvoCB < bolaZDir - distTrasCB) zAlvoCB = bolaZDir - distTrasCB;

    // distFrente/Tras for CM
    let distFrenteCM = 5;
    let distTrasCM = 5;
    if (zAlvoCM > bolaZDir + distFrenteCM) zAlvoCM = bolaZDir + distFrenteCM;
    if (zAlvoCM < bolaZDir - distTrasCM) zAlvoCM = bolaZDir - distTrasCM;

    // Cap CB
    const zMidDir = z0 + 0.45 * (z1 - z0);
    const zDefTeto = zMidDir - 3.5;
    const zCBAcompanha = Math.min(0.0, zDefTeto);
    if (zAlvoCB > zCBAcompanha) zAlvoCB = zCBAcompanha;

    let targetCB = zAlvoCB * dir;
    let targetCM = zAlvoCM * dir;

    // Check if CB is in front of CM
    let cbInFront = (dir === -1) ? (targetCB < targetCM) : (targetCB > targetCM);
    if (cbInFront) {
        console.log(`BUG FOUND: ball=${bolaZDir}, cbTarget=${targetCB}, cmTarget=${targetCM}`);
    }
}

for (let b = -40; b <= 40; b += 5) {
    test(b, -1, true);
    test(b, 1, true);
}
console.log("Done");
