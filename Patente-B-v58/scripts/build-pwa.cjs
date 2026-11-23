'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const {makeSecurityHeaders} = require('./security.cjs');
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const dist = path.join(root, 'dist');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const guard = fs.readFileSync(path.join(root, 'src/boot-guard.js'), 'utf8');
if (/<\/script/i.test(guard)) throw new Error('Unsafe script closing tag in startup guard.');
const indexPath = path.join(root, 'index.html');
let index = fs.readFileSync(indexPath, 'utf8');
if (!/<script id="bootGuard">[\s\S]*?<\/script>/.test(index)) throw new Error('Missing bootGuard placeholder.');
index = index.replace(/<script id="bootGuard">[\s\S]*?<\/script>/, `<script id="bootGuard">\n${guard}</script>`);
const version = Number(index.match(/data-app-version="(\d+)"/)?.[1]);
if (!Number.isSafeInteger(version) || version < 1) throw new Error('Missing or invalid data-app-version.');
esbuild.buildSync({
  entryPoints: [path.join(root, 'src/app.js')],
  outfile: path.join(publicDir, 'app.bundle.js'),
  bundle: true, format: 'iife', platform: 'browser', target: ['chrome80'],
  charset: 'utf8', legalComments: 'none', sourcemap: false
});
const headers = makeSecurityHeaders(index);
const metaCsp = headers['content-security-policy'].replace(/; frame-ancestors 'none'/, '');
index = index.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${metaCsp}">`);
const headerText = '/*\n' + Object.entries(headers).map(([k,v]) => `  ${k}: ${v}`).join('\n') + '\n  cache-control: no-cache\n\n' +
  '/manifest.webmanifest\n  content-type: application/manifest+json; charset=utf-8\n\n' +
  '/app.bundle.js\n  content-type: text/javascript; charset=utf-8\n\n' +
  '/sw.js\n  content-type: text/javascript; charset=utf-8\n  service-worker-allowed: /\n';
fs.writeFileSync(path.join(publicDir, '_headers'), headerText);
const release = {version, entry: `/app.bundle.js?v=${version}`, bundleSha256: sha256(path.join(publicDir, 'app.bundle.js')), lessonsSha256: sha256(path.join(root, 'data/lessons.json')), lessonSupportSha256: sha256(path.join(root, 'data/lesson-support.json')), questionBankSha256: sha256(path.join(root, 'data/questions.json')), dictionarySha256: sha256(path.join(root, 'data/italian_arabic_dictionary_lookup.json'))};
fs.writeFileSync(path.join(publicDir, 'release.json'), JSON.stringify(release, null, 2) + '\n');
fs.rmSync(dist, {recursive: true, force: true});
fs.mkdirSync(dist);
fs.cpSync(publicDir, dist, {recursive: true});
fs.writeFileSync(path.join(dist, 'index.html'), index);
fs.mkdirSync(path.join(dist, 'src'));
for (const name of fs.readdirSync(path.join(root, 'src'))) {
  if (/\.(?:css|js|mjs)$/.test(name)) fs.copyFileSync(path.join(root, 'src', name), path.join(dist, 'src', name));
}
fs.mkdirSync(path.join(dist, 'data'));
for (const name of ['questions.json', 'lessons.json', 'lesson-support.json', 'topic-labels.json', 'similar-groups.json', 'italian_arabic_dictionary_lookup.json']) fs.copyFileSync(path.join(root, 'data', name), path.join(dist, 'data', name));
console.log(`Built PWA v${version} in ${dist}`);
console.log(`Bundle SHA-256: ${release.bundleSha256}`);
