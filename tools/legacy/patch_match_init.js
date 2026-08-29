const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

// Inject lines creation in init
code = code.replace(
/this.scene.add\(this.offsideLineB\);/g,
`this.scene.add(this.offsideLineB);
        const lineGeomA = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-CAMPO_LARG/2, 0.05, 0), new THREE.Vector3(CAMPO_LARG/2, 0.05, 0)]);
        this.defLineA = new THREE.LineSegments(lineGeomA, new THREE.LineDashedMaterial({ color: 0x3498db, dashSize: 1, gapSize: 1 }));
        this.defLineA.computeLineDistances();
        this.defLineA.visible = false;
        this.scene.add(this.defLineA);
        const lineGeomB = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-CAMPO_LARG/2, 0.05, 0), new THREE.Vector3(CAMPO_LARG/2, 0.05, 0)]);
        this.defLineB = new THREE.LineSegments(lineGeomB, new THREE.LineDashedMaterial({ color: 0xe74c3c, dashSize: 1, gapSize: 1 }));
        this.defLineB.computeLineDistances();
        this.defLineB.visible = false;
        this.scene.add(this.defLineB);`
);

// Inject toggling in listener
code = code.replace(
/this.offsideLineB.visible = this.showOffsideLines;/g,
`this.offsideLineB.visible = this.showOffsideLines;
                if(this.defLineA) this.defLineA.visible = this.showOffsideLines;
                if(this.defLineB) this.defLineB.visible = this.showOffsideLines;`
);

// Inject update logic
code = code.replace(
/this.offsideLineB.position.z = Math.max\(0, outfieldB\[0\].model.position.z, this.ball.position.z\);\n            }/g,
`this.offsideLineB.position.z = Math.max(0, outfieldB[0].model.position.z, this.ball.position.z);
            }
            if (typeof TeamAI !== 'undefined') {
                const bbA = TeamAI.get('TeamA');
                if (bbA && typeof bbA.defLineZ === 'number') this.defLineA.position.z = bbA.defLineZ;
                const bbB = TeamAI.get('TeamB');
                if (bbB && typeof bbB.defLineZ === 'number') this.defLineB.position.z = bbB.defLineZ;
            }`
);

fs.writeFileSync('js/match.js', code);
