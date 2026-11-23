'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('v53 removes the top brand icon and keeps all five bottom tabs', () => {
  const index = read('index.html');
  const topbar = index.match(/<header class="topbar">[\s\S]*?<\/header>/)?.[0] || '';
  const nav = index.match(/<nav class="mobile-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.ok(topbar);
  assert.doesNotMatch(topbar, /brand-mark|<svg|<img/u);
  assert.equal((nav.match(/<button\b/g) || []).length, 5);
  assert.match(index, /data-app-version="58"/u);
  assert.match(index, /v53-mobile-nav\.css\?v=55/u);
});

test('mobile navigation icons and bilingual labels stay high-contrast and unclipped', () => {
  const css = read('src/v53-mobile-nav.css');
  assert.match(css, /--v53-mobile-nav-height:\s*calc\(88px \+ env\(safe-area-inset-bottom\)\)/u);
  assert.match(css, /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/u);
  assert.match(css, /height:\s*70px !important/u);
  assert.match(css, /stroke:\s*currentColor !important/u);
  assert.match(css, /\.mobile-nav button small[\s\S]*?opacity:\s*1 !important/u);
  assert.match(css, /\.back-to-top[\s\S]*?var\(--v53-mobile-nav-height\) \+ 14px/u);
  assert.match(css, /body\.audio-player-open \.back-to-top[\s\S]*?var\(--v50-player-height\)/u);
  assert.match(read('public/sw.js'), /patente-ar-v58-learning-path-1/u);
  assert.match(read('public/sw.js'), /'\/src\/v53-mobile-nav\.css'/u);
  assert.match(read('public/sw.js'), /'\/src\/v57-learning-path\.css'/u);
});
