'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

let diffModule;
let translationModule;
test('load local comparison and translation modules', async () => {
  diffModule = await import(path.join(root, 'src/similar-diff.mjs'));
  translationModule = await import(path.join(root, 'src/lesson-translation.mjs'));
});

test('word diff isolates a changed term and retains unchanged words and punctuation', () => {
  const changes = diffModule.diffQuestionText('La corsia è libera.', 'La carreggiata è libera.');
  assert.deepEqual(changes.filter(item => item.type !== 'equal').map(item => [item.text, item.type]), [
    ['corsia', 'removed'], ['carreggiata', 'added']
  ]);
  assert.equal(diffModule.renderDiffSide(changes, 'original', text => text), 'La <span class="diff-token diff-removed">corsia</span> è libera.');
  assert.equal(diffModule.renderDiffSide(changes, 'variant', text => text), 'La <span class="diff-token diff-added">carreggiata</span> è libera.');
});

test('word diff does not mark case-only changes and safely handles insertions and deletions', () => {
  assert.ok(diffModule.diffQuestionText('CORSIA', 'corsia').every(item => item.type === 'equal'));
  const changes = diffModule.diffQuestionText('Deve attendere il veicolo R.', 'Deve attendere il veicolo A.');
  assert.deepEqual(changes.filter(item => item.type !== 'equal').map(item => item.type), ['removed', 'added']);
});

test('mandatory road terms use the requested local glossary translations', () => {
  const glossary = JSON.parse(read('data/glossary-v37.json'));
  const entries = glossary.entries.map(entry => ({it: entry.italian, ar: entry.arabic, note: entry.note_ar}));
  assert.equal(translationModule.lookupOfflineWord('Corsia', entries).arabic, 'حارة سير');
  assert.equal(translationModule.lookupOfflineWord('Carreggiata', entries).arabic, 'الطريق المخصص للمركبات');
  assert.equal(translationModule.lookupOfflineWord('parola-non-presente', entries), null);
});

test('unknown lesson word falls back to the paired local sentence without a network translation claim', () => {
  const result = translationModule.translateLessonSentence('La corsia è libera.', 'حارة السير خالية.', 4);
  assert.equal(result.translation, 'حارة السير خالية.');
  assert.equal(result.alignment, 'paragraph');
});

test('v46 UI uses a non-modal bottom sheet, single-tap word lookup, and true pairwise comparison controls', () => {
  const index = read('index.html');
  const app = read('src/app.js');
  assert.match(index, /id="wordTranslationTooltip"[^>]*role="dialog"/u);
  assert.doesNotMatch(index, /id="instantTranslationDialog"|id="vocabularyDialog"/u);
  assert.match(app, /data-similar-variant/u);
  assert.match(app, /diffQuestionText/u);
  assert.match(app, /\.wt-word\[data-term\]/u);
  assert.match(app, /openTappedWord\(tappedWord,event\)/u);
  assert.doesNotMatch(app, /wordHoldTimer|heldItalianTarget/u);
  assert.match(read('src/v40-audio.css'), /inset:\s*auto 0 0/u);
  assert.match(read('src/v29-theme.css'), /\.wt-word[^}]*user-select:\s*none/u);
  assert.ok(app.includes('[lang="it"]'));
  assert.match(app, /wordTranslationTooltip/u);
});

test('a single click opens the tapped word card without a long-press timer', () => {
  const app = read('src/app.js');
  assert.match(app, /main\.addEventListener\('click',event=>\{/u);
  assert.match(app, /const tappedWord=event\.target\.closest\('\.wt-word\[data-term\]'\)/u);
  assert.match(app, /openTappedWord\(tappedWord,event\)/u);
  assert.doesNotMatch(app, /wordHoldTimer|heldItalianTarget|setTimeout\(\(\)=>\{openTappedWord/u);
});

test('v51 keeps Web Speech lesson controls and removes native/local TTS paths', () => {
  const index = read('index.html');
  const app = read('src/app.js');
  const speech = read('src/speech.mjs');
  const mainActivity = read('android/app/src/main/java/it/patenteb/sideload/v29/MainActivity.java');
  assert.match(index, /data-audio-backend="web-speech"/u);
  assert.match(index, /speechPlaybackBar/u);
  assert.match(app, /createSpeechController\(\{getRate:/u);
  assert.match(app, /speak\(lessonItalianAudio\.dataset\.ttsText/u);
  assert.match(speech, /SpeechSynthesisUtterance|speechSynthesis/u);
  assert.doesNotMatch(`${app}\n${speech}\n${mainActivity}`, /Piper|nativeTts|nativeEngineDisabled|ONNX/u);
  assert.match(mainActivity, /registerPlugin\(RewardedAdsPlugin\.class\)/u);
  assert.doesNotMatch(mainActivity, /SpeechSettingsPlugin/u);
});

test('lesson renders accessible topic-specific 2D diagrams without claiming 3D', () => {
  const animation = read('src/lesson-animation.mjs');
  assert.match(animation, /\$\{sceneSvg\(type\)\}/u);
  assert.match(animation, /role="img" aria-label="\$\{escapeHtml\(sceneDescription\)\}"/u);
  assert.doesNotMatch(animation, /lesson-animation-unavailable|3D animation is not available/u);
});
