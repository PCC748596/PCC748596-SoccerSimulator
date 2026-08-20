// Servidor estático mínimo, sem dependências, só para `npm run dev`.
// O jogo em si não precisa de servidor (abre em file://) — isto é só
// conveniência para desenvolvimento (recarregar por http, evitar CORS
// em ferramentas que o exijam).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 5173;

const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.obj': 'text/plain', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(ROOT, urlPath);

    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found: ' + urlPath); return; }
        const ext = path.extname(filePath).toLowerCase();
        // Sem isto o browser cacheia agressivamente (sem ETag/Last-Modified
        // para revalidar) — um refresh normal (F5) continua a servir JS
        // velho depois de editar ficheiros, só um hard-refresh escapava.
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`Soccer Simulator em http://localhost:${PORT}`);
});
