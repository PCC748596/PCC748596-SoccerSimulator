const fs = require('fs');
let indexCode = fs.readFileSync('index.html', 'utf8');
indexCode = indexCode.replace(/0\.0593/g, '0.0594');
fs.writeFileSync('index.html', indexCode);
console.log("Bumped version");
