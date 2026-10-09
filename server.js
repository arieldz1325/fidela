const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DIST_PATH = path.join(__dirname, 'dist', 'fiel', 'browser');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(DIST_PATH, req.url);

  // Security: prevent directory traversal
  if (!filePath.startsWith(DIST_PATH)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Check if it's a file
  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      // Serve the file
      const ext = path.extname(filePath);
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

      // Set cache headers
      let cacheControl = 'public, max-age=3600';
      if (/\.[0-9a-f]{8,}\.(js|css)$/.test(filePath)) {
        cacheControl = 'public, max-age=31536000, immutable';
      } else if (ext === '.html') {
        cacheControl = 'public, max-age=0, must-revalidate';
      }

      res.writeHead(200, {
        'Content-Type': mimeType,
        'Cache-Control': cacheControl,
      });

      fs.createReadStream(filePath).pipe(res);
    } else {
      // SPA fallback: check for index.html
      if (req.url === '/' || !req.url.includes('.')) {
        const indexPath = path.join(DIST_PATH, 'index.html');
        fs.stat(indexPath, (err, stats) => {
          if (!err && stats.isFile()) {
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=0, must-revalidate',
            });
            fs.createReadStream(indexPath).pipe(res);
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
          }
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving from ${DIST_PATH}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
