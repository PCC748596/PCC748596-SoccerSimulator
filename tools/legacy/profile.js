const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

code = code.replace(/update: function \(dt\) \{/, `update: function (dt) {
        if (!this._pf_stats) this._pf_stats = { count: 0, time: 0 };
        const t0 = performance.now();`);

code = code.replace(/this\.updateCrowd\(dt\);\s*\}/, `this.updateCrowd(dt);
        const t1 = performance.now();
        this._pf_stats.time += (t1 - t0);
        this._pf_stats.count++;
        if (this._pf_stats.count === 60) {
            console.log("Avg Match.update ms:", this._pf_stats.time / 60);
            this._pf_stats.count = 0;
            this._pf_stats.time = 0;
        }
    }`);

fs.writeFileSync('js/match.js', code);
