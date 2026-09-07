const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Inject Replay button
html = html.replace(
    /<button class="btn-action" style="flex: 1; margin-top: 0;" id="btn-pause"/,
    `<button class="btn-action" style="flex: 1; margin-top: 0;" id="btn-replay" onclick="if(window.MatchReplay) window.MatchReplay.toggleReplay()">Replay (20s)</button>
                <button class="btn-action" style="flex: 1; margin-top: 0;" id="btn-pause"`
);

// Inject script
html = html.replace(
    /<script src="js\/main.js"><\/script>/,
    `<script src="js/match/match_replay.js"></script>
    <script src="js/main.js"></script>`
);

fs.writeFileSync('index.html', html);
console.log('Patched index.html');
