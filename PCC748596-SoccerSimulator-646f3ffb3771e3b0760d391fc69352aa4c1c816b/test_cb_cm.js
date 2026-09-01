const fs = require('fs');
let content = fs.readFileSync('js/config/tactics.js', 'utf8');
content = content.replace(/export /g, '');
const context = {};
const script = require('vm').createScript(content);
script.runInNewContext(context);
const FormationsData = context.FormationsData;

for (const form in FormationsData) {
    const fData = FormationsData[form];
    const cbs = fData.filter(f => f.pos === 'CB');
    const cms = fData.filter(f => f.pos === 'CM');
    if (cbs.length > 0 && cms.length > 0) {
        const maxCbZ = Math.max(...cbs.map(f => f.z));
        const minCmZ = Math.min(...cms.map(f => f.z));
        if (maxCbZ > minCmZ) {
            console.log(`Formation ${form} has CB ahead of CM! CB: ${maxCbZ}, CM: ${minCmZ}`);
        }
    }
}
console.log("Done checking.");
