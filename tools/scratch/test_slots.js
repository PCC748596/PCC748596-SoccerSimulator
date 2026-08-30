const FormationsData = {
    '442': [
        { x: 0, z: -0.95, role: 'gk', pos: 'GK', num: 1 },
        { x: -0.7, z: -0.6, role: 'def', pos: 'RB', num: 2 },
        { x: -0.3, z: -0.7, role: 'def', pos: 'CB', num: 4 },
        { x: 0.3, z: -0.7, role: 'def', pos: 'CB', num: 3 },
        { x: 0.7, z: -0.6, role: 'def', pos: 'LB', num: 6 }
    ],
    '433': [
        { x: 0, z: -0.95, role: 'gk', pos: 'GK', num: 1 },
        { x: -0.7, z: -0.6, role: 'def', pos: 'RB', num: 2 },
        { x: -0.3, z: -0.7, role: 'def', pos: 'CB', num: 4 },
        { x: 0.3, z: -0.7, role: 'def', pos: 'CB', num: 3 },
        { x: 0.7, z: -0.6, role: 'def', pos: 'LB', num: 6 }
    ],
    '343': [
        { x: 0, z: -0.95, role: 'gk', pos: 'GK', num: 1 },
        { x: -0.5, z: -0.7, role: 'def', pos: 'CB', num: 2 },
        { x: 0, z: -0.7, role: 'def', pos: 'CB', num: 4 },
        { x: 0.5, z: -0.7, role: 'def', pos: 'CB', num: 3 },
    ]
};

for (const form in FormationsData) {
    const fData = FormationsData[form];
    const campo = fData.filter(f => f.role !== 'gk');
    const zMin = Math.min(...campo.map(f => f.z));
    const zMax = Math.max(...campo.map(f => f.z));
    const zSpan = (zMax - zMin) || 1;
    console.log("Formation:", form, "zMin:", zMin, "zSpan:", zSpan);
    campo.forEach(f => {
        if (f.pos === 'CB') {
            console.log(`  CB (x: ${f.x}, z: ${f.z}) -> v: ${(f.z - zMin) / zSpan}`);
        }
    });
}
