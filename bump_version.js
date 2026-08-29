const fs = require('fs');
let indexCode = fs.readFileSync('index.html', 'utf8');
const targetVersion = process.argv[2];
if (targetVersion) {
    indexCode = indexCode.replace(/v\s*(\d+\.\d+)/g, `v ${targetVersion}`);
} else {
    indexCode = indexCode.replace(/v\s*(\d+\.)(\d+)/g, (match, prefix, num) => {
        const nextNum = String(parseInt(num, 10) + 1).padStart(num.length, '0');
        return `v ${prefix}${nextNum}`;
    });
}
fs.writeFileSync('index.html', indexCode);
console.log("Bumped version");

