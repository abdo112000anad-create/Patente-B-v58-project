'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Android manifest does not request Native TTS package visibility', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.doesNotMatch(manifest, /<queries>|TTS_SERVICE/u);
});

test('key points render as vertical bilingual cards without a two-column table', async () => {
  const { renderLessonSections } = await import(path.join(root, 'src/lesson-template.mjs'));
  const markup = renderLessonSections({
    summaryIt: 'La carreggiata è destinata ai veicoli.',
    summaryAr: 'المسار مخصص للمركبات.',
    keyPoints: [{it: 'La parte della strada destinata ai veicoli.', ar: 'الجزء من الطريق المخصص للمركبات.'}]
  });
  assert.match(markup, /class="lesson-key-point-card key-point-card"/u);
  assert.doesNotMatch(markup, /<table\b|<tr\b/u);
  const cardAt = markup.indexOf('class="lesson-key-point-card key-point-card"');
  const italianAt = markup.indexOf('La parte della strada destinata ai veicoli.', cardAt);
  const arabicAt = markup.indexOf('الجزء من الطريق المخصص للمركبات.', cardAt);
  assert.ok(cardAt >= 0 && italianAt > cardAt && arabicAt > italianAt);
  assert.ok(markup.includes('La parte della strada destinata ai veicoli.'));
  assert.ok(markup.includes('الجزء من الطريق المخصص للمركبات.'));
  const css = read('src/rebuild.css');
  assert.match(css, /\.lesson-key-point-card,\.key-point-card\{[^}]*border:1px solid var\(--line\)[^}]*background:/u);
  assert.match(css, /\.lesson-key-point-card,\.key-point-card\{[^}]*box-shadow:0 2px 8px/u);
  assert.match(css, /\.lesson-key-point-title \[lang="it"\][^{]*\{[^}]*direction:ltr/u);
});

test('lesson detail renders the short Italian then Arabic summary and keeps it spoken and tappable', async () => {
  const { renderLessonSections } = await import(path.join(root, 'src/lesson-template.mjs'));
  const markup = renderLessonSections({
    summaryIt: 'La strada è destinata alla circolazione pubblica.',
    summaryAr: 'الطريق مخصص لحركة المرور العامة.',
    keyPoints: [],
    body_it: 'LEGACY_LONG_ITALIAN_BODY',
    body_ar: 'LEGACY_LONG_ARABIC_BODY'
  });
  const italianAt = markup.indexOf('La strada è destinata alla circolazione pubblica.');
  const arabicAt = markup.indexOf('الطريق مخصص لحركة المرور العامة.');
  assert.ok(italianAt >= 0 && arabicAt > italianAt);
  assert.match(markup, /class="lesson-it-text"/u);
  assert.doesNotMatch(markup, /LEGACY_LONG_/u);
  const app = read('src/app.js');
  assert.match(app, /node\.dataset\.translationTappable='true'/u);
  assert.match(read('src/speech.mjs'), /lesson\.summaryIt/u);
});

test('voice-loading state displays an Arabic progress message', () => {
  const app = read('src/app.js');
  assert.match(app, /status==='preparing'\?'جارٍ تجهيز صوت إيطالي\.\.\. انتظار تحميل الأصوات\.'/u);
  assert.doesNotMatch(app, /الصوت المحلي|Piper|nativeTts/u);
});

test('Italian voice selection prefers an available Italian voice and ignores Arabic voices', async () => {
  const { createSpeechController } = await import(path.join(root, 'src/speech.mjs'));
  const utterances = [];
  class FakeUtterance { constructor(text) { this.text = text; } }
  const voices = [
    {name: 'Italian system voice', lang: 'it-IT', localService: true},
    {name: 'Google Italiano', lang: 'it-IT', localService: true},
    {name: 'Voce araba', lang: 'ar-EG', localService: true},
    {name: 'Arabic network voice', lang: 'ar-SA', localService: false}
  ];
  const webSpeech = {
    Utterance: FakeUtterance,
    synthesis: {getVoices: () => voices, speak: utterance => { utterances.push(utterance); queueMicrotask(() => utterance.onend?.()); }, cancel() {}}
  };
  const controller = createSpeechController({webSpeech});
  assert.equal(await controller.speak('Ciao.', 'it-IT'), true);
  assert.equal(await controller.speak('مرحبا.', 'ar-EG'), false);
  assert.equal(utterances.length, 1);
  assert.equal(utterances[0].voice, voices[1]);
  const speech = read('src/speech.mjs');
  assert.match(speech, /selectionEvidence:.*unverified-name-hint/u);
  assert.doesNotMatch(speech, /nameQualityHint:.*natural voice/u);
});

test('an unlisted Italian voice falls back to the system language selector', async () => {
  const { createSpeechController } = await import(path.join(root, 'src/speech.mjs'));
  const states = [];
  const utterances = [];
  class FakeUtterance { constructor(text) { this.text = text; } }
  const webSpeech = {
    Utterance: FakeUtterance,
    synthesis: {getVoices: () => [{name: 'English default', lang: 'en-US'}], speak: utterance => { utterances.push(utterance); queueMicrotask(() => utterance.onend?.()); }, cancel() {}}
  };
  const controller = createSpeechController({webSpeech, onStateChange: state => states.push(state)});
  assert.equal(await controller.speak('Ciao.', 'it-IT'), true);
  assert.equal(utterances.length, 1);
  assert.equal(utterances[0].lang, 'it-IT');
  assert.equal(utterances[0].voice, undefined);
  assert.ok(states.some(state => state.status === 'playing' && state.locale === 'it-IT'));
});

test('Native TTS settings plugin is absent and browser Web Speech remains available', () => {
  const activity = read('android/app/src/main/java/it/patenteb/sideload/v29/MainActivity.java');
  assert.doesNotMatch(activity, /SpeechSettingsPlugin/u);
  assert.equal(fs.existsSync(path.join(root, 'android/app/src/main/java/it/patenteb/sideload/v29/SpeechSettingsPlugin.java')), false);
  assert.match(read('src/speech.mjs'), /SpeechSynthesisUtterance|speechSynthesis/u);
});
