const fs = require('fs');
let code = fs.readFileSync('js/main.js', 'utf8');

code = code.replace(/if \(bbA && bbA\.state\) document\.getElementById\('hud-state-a'\)\.innerText = bbA\.state;\s*const bbB = TeamAI\.blackboards\['TeamB'\];\s*if \(bbB && bbB\.state\) document\.getElementById\('hud-state-b'\)\.innerText = bbB\.state;/g, `if (bbA && bbA.state) {
            const el = document.getElementById('hud-state-a');
            if (el.innerText !== bbA.state) el.innerText = bbA.state;
        }
        const bbB = TeamAI.blackboards['TeamB'];
        if (bbB && bbB.state) {
            const el = document.getElementById('hud-state-b');
            if (el.innerText !== bbB.state) el.innerText = bbB.state;
        }`);

fs.writeFileSync('js/main.js', code);
