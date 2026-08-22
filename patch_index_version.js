const fs = require('fs');
let index = fs.readFileSync('index.html', 'utf8');
index = index.replace(/0\.0587/g, '0.0588');
fs.writeFileSync('index.html', index);
console.log("Bumped version");
