const fs = require('fs');
let code = fs.readFileSync('js/crowd.js', 'utf8');

code = code.replace(/    ritmoSalto: 7\.0,\s+    (\/\*)/g, '    ritmoSalto: 7.0,\n    */\n\n    $1');
code = code.replace(/    fraccaoGolo: 1\.00,\s+    (\/\*)/g, '    fraccaoGolo: 1.00,\n    */\n\n    $1');
code = code.replace(/    permanenciaMin: 2\.0\n};/g, '    permanenciaMin: 2.0\n    */\n};');
code = code.replace(/            : bolaZ < -CrowdModel\.tercoZ;\n    },/g, '            : bolaZ < -CrowdModel.tercoZ;\n    */\n    },'); // wait, the comment is inside the function?
// Let's just find the `/*` and find the end of the comment text and insert `*/`.

