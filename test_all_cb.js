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
    if (cbs.length > 0) {
        cbs.forEach(cb => {
            if (cb.z !== -0.7) {
                console.log(`Formation ${form} has CB at z=${cb.z}`);
            }
        });
    }
}
console.log("Done");
