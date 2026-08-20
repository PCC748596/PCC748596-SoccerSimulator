const fs = require('fs');
let code = fs.readFileSync('js/main.js', 'utf8');

code = code.replace(/if \(!window\._teamBtChannel\) window\._teamBtChannel = new BroadcastChannel\('teamBtTrace'\);\s*window\._teamBtChannel\.postMessage\(\{\s*TeamA: bbA \? \{ trace: bbA\.trace, posture: bbA\.posture \} : null,\s*TeamB: bbB \? \{ trace: bbB\.trace, posture: bbB\.posture \} : null\s*\}\);/, `if (!window._teamBtChannel) window._teamBtChannel = new BroadcastChannel('teamBtTrace');
        if (!window._lastBtPost || time - window._lastBtPost > 200) {
            window._lastBtPost = time;
            window._teamBtChannel.postMessage({
                TeamA: bbA ? { trace: bbA.trace, posture: bbA.posture } : null,
                TeamB: bbB ? { trace: bbB.trace, posture: bbB.posture } : null
            });
        }`);

fs.writeFileSync('js/main.js', code);
