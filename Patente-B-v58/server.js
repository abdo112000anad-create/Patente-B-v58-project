'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const {makeSecurityHeaders} = require('./scripts/security.cjs');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
const SECURITY_HEADERS = makeSecurityHeaders(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'));
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_FILES = new Set(['favicon.svg', 'app-icon-192.png', 'app-icon-512.png', 'app-icon-maskable-512.png', 'manifest.webmanifest', 'sw.js', 'manus-routes.json', 'offline-assets.json', 'app.bundle.js', 'release.json']);
const STATIC_SOURCE_FILES = new Set(['app.js', 'styles.css', 'rebuild.css', 'v24.css', 'progress-backup.mjs', 'session-recovery.mjs', 'startup.mjs', 'boot-guard.js', 'account-ui.css', 'theme-dark.css']);
const STATIC_DATA_FILES = new Set(['questions.json', 'lessons.json', 'topic-labels.json', 'similar-groups.json']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};

function send(res, status, body) {
  if (res.writableEnded || res.destroyed) return;
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': bytes.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin'
  });
  res.end(bytes);
}

function resolveStaticFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes('\0')) return null;
  const segments = decoded.split('/').filter(Boolean);
  if (segments.some(segment => segment.startsWith('.') || segment === '..')) return null;
  if (decoded === '/' || decoded === '/index.html') return path.join(DIST, 'index.html');
  if (segments.length === 1 && PUBLIC_FILES.has(segments[0])) return path.join(PUBLIC, segments[0]);
  if (segments.length === 2 && segments[0] === 'src' && STATIC_SOURCE_FILES.has(segments[1])) return path.join(ROOT, ...segments);
  if (segments.length === 2 && segments[0] === 'data' && STATIC_DATA_FILES.has(segments[1])) return path.join(ROOT, ...segments);
  if (segments.length === 2 && (segments[0] === 'quiz-images' || segments[0] === 'lessons') && /\.(?:jpg|webp|svg)$/i.test(segments[1])) return path.join(PUBLIC, ...segments);
  return null;
}

function serveStatic(req, res, pathname) {
  let file;
  try { file = resolveStaticFile(pathname); }
  catch { res.writeHead(400); res.end('Bad path'); return; }
  if (!file || !(file === ROOT || file.startsWith(ROOT + path.sep))) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Not found'); return;
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' }); res.end('Not found'); return;
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const noCache = ['index.html', 'sw.js', 'manus-routes.json', 'manifest.webmanifest', 'app.bundle.js', 'release.json'].includes(path.basename(file));
    const compressible = /^(text\/|application\/(json|javascript|manifest\+json))/.test(type) || type === 'image/svg+xml';
    const gzip = compressible && stat.size > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const headers = {
      ...SECURITY_HEADERS,
      'content-type': type,
      'cache-control': noCache ? 'no-cache' : 'public, max-age=300'
    };
    if (gzip) { headers['content-encoding'] = 'gzip'; headers.vary = 'Accept-Encoding'; }
    else headers['content-length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(file);
    if (gzip) stream.pipe(zlib.createGzip()).pipe(res);
    else stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  if (url.pathname === '/api/healthz' && req.method === 'GET') { send(res, 200, { ok: true }); return; }
  if (url.pathname.startsWith('/api/')) { send(res, 404, { error: 'not_found' }); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, '0.0.0.0', () => console.log(`Patente server listening on 0.0.0.0:${PORT}`));
