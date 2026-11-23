'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');
const playerCss = read('src/v50-contrast.css');
const app = read('src/app.js');
const lessonVisuals = read('src/lesson-animation.mjs');

function rgb(token) {
  const value = token.toLowerCase();
  if (value === 'white') return [255, 255, 255];
  if (value.startsWith('#')) {
    let hex = value.slice(1);
    if ([3, 4].includes(hex.length)) hex = [...hex.slice(0, 3)].map(x => x + x).join('');
    if (![6, 8].includes(hex.length)) return null;
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  }
  if (value.startsWith('rgb')) {
    const n = value.match(/\d+(?:\.\d+)?/g);
    return n && n.length >= 3 ? n.slice(0, 3).map(Number) : null;
  }
  return null;
}
function isDisallowed(token) {
  const c = rgb(token);
  if (!c) return token.toLowerCase() === 'white';
  const [r, g, b] = c.map(x => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0, saturation = 0;
  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
    if (hue < 0) hue += 360;
  }
  const nearWhite = Math.min(...c) >= 244 && Math.max(...c) - Math.min(...c) <= 30;
  const yellow = hue >= 34 && hue <= 74 && saturation >= .18;
  return nearWhite || yellow;
}

test('v58 identity is consistent across the PWA and Android package', () => {
  assert.match(index, /data-app-version="58"/);
  assert.match(read('package.json'), /"version": "58\.0\.0"/);
  assert.match(read('package-lock.json'), /"version": "58\.0\.0"/);
  assert.match(read('android/app/build.gradle'), /versionCode 58/);
  assert.match(read('android/app/build.gradle'), /versionName "58\.0\.0"/);
  assert.match(read('android/app/build.gradle'), /applicationId "it\.patenteb\.sideload\.v29"/);
  assert.match(read('android/app/build.gradle'), /System\.getenv\('PATENTE_DEBUG_STORE_PASSWORD'\)/);
  assert.match(read('android/app/build.gradle'), /System\.getenv\('PATENTE_DEBUG_KEY_ALIAS'\)/);
  assert.match(read('android/app/build.gradle'), /System\.getenv\('PATENTE_DEBUG_KEY_PASSWORD'\)/);
  assert.match(read('public/sw.js'), /patente-ar-v58-learning-path-1/);
});

test('v53 applies the same legible dark palette in every theme preference', () => {
  const dark = read('src/v52-dark-overhaul.css');
  assert.match(index, /v52-dark-overhaul\.css\?v=55/);
  assert.match(dark, /color-scheme:\s*dark/u);
  assert.match(dark, /background-color:\s*#0b171d\s*!important/u);
  assert.match(dark, /\.feedback\.good/u);
  assert.match(dark, /\.feedback\.bad/u);
});

test('audio bar and fixed 0.8x rate are visible, labelled, and above mobile navigation', () => {
  assert.match(index, /class="speech-rate-value" aria-label="سرعة الصوت الإيطالي">0\.8×/);
  assert.match(index, /class="speech-rate-language" aria-hidden="true">سرعة<\/span>/);
  assert.match(read('src/v57-learning-path.css'), /\.speech-rate-value\s*\{[^}]*font-weight:\s*800/s);
  assert.match(playerCss, /\.speech-playback-bar:not\(\[hidden\]\)\s*\{[^}]*flex-wrap:\s*nowrap\s*!important/s);
  assert.match(playerCss, /inset-block-end:\s*calc\(var\(--v50-mobile-nav-clearance\) \+ 12px\)/);
  assert.match(playerCss, /body\.audio-player-open #main\s*\{[^}]*var\(--v50-player-height\)/s);
  assert.match(playerCss, /--v50-mobile-nav-clearance:\s*calc\(66px \+ max\(7px, env\(safe-area-inset-bottom\)\)\)/);
  assert.match(app, /classList\.toggle\('audio-player-open',active\)/);
  assert.match(playerCss, /@media \(max-width: 760px\) and \(max-height: 560px\)/);
});

test('only the five existing bottom navigation tabs remain and loading skeleton preview is removed', () => {
  const nav = index.match(/<nav class="mobile-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.equal((nav.match(/<button\b/g) || []).length, 5);
  assert.doesNotMatch(index, /v29-loading-preview/);
});

test('welcome loading keeps only a concise accessible status and spinner', () => {
  const loader = index.match(/<div class="loading-state welcome-loading"[\s\S]*?<\/div>/)?.[0] || '';
  assert.ok(loader);
  assert.match(loader, /جارٍ تحميل محتوى التطبيق/u);
  assert.match(loader, /class="spinner" aria-hidden="true"/u);
  assert.doesNotMatch(loader, /welcome-icon|welcome-title|welcome-eyebrow|Lezioni, quiz|Impara le regole|<img|PATENTE B/u);
  assert.doesNotMatch(loader, /<div\s*<\/div>/u);
});

test('vertical learning path and lesson scenes remain accessible', () => {
  const home = app.slice(app.indexOf('function homePage(){'), app.indexOf('function lessonDetailPage('));
  assert.match(home, /<ol class="lesson-path">/u);
  assert.match(home, /<button class="lesson-path-step"[^>]*aria-current=/u);
  assert.match(home, /class="lesson-path-marker" aria-hidden="true"/u);
  assert.match(lessonVisuals, /\$\{sceneSvg\(type\)\}/);
  assert.match(lessonVisuals, /aria-label="\$\{escapeHtml\(sceneDescription\)\}"/);
  assert.doesNotMatch(lessonVisuals, /3D animation is not available|رسوم ثلاثية الأبعاد بعد إنشائها/);
});

test('linked app styles and lesson illustrations contain no pure-white or yellow color values', () => {
  const hrefs = [...index.matchAll(/<link rel="stylesheet" href="\/([^"?]+\.css)/g)].map(m => m[1]);
  const files = [...new Set([...hrefs, 'src/lesson-animation.mjs'])];
  const tokenPattern = /#[0-9a-f]{3,8}\b|(?<![\w-])white(?![\w-])|rgba?\([^)]*\)/gi;
  const violations = [];
  for (const file of files) {
    for (const match of read(file).matchAll(tokenPattern)) {
      if (isDisallowed(match[0])) violations.push(`${file}: ${match[0]}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('v51 excludes all bundled speech models and native local TTS dependencies', () => {
  assert.equal(fs.existsSync(path.join(root, 'android/app/src/piperAlpha')), false);
  assert.equal(fs.existsSync(path.join(root, 'android/app/src/main/assets/piper')), false);
  const source = [
    read('android/app/build.gradle'),
    read('android/app/src/main/AndroidManifest.xml'),
    read('android/app/src/main/java/it/patenteb/sideload/v29/MainActivity.java'),
    read('src/app.js'),
    read('src/speech.mjs'),
  ].join('\n');
  assert.doesNotMatch(source, /Piper|piperAlpha|sherpa-onnx|piper-phonemize|ONNX|nativeTts/u);
});
