'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Italian word-tap surfaces suppress selection and prevent default only on a recognized word click', () => {
  const css = read('src/v29-theme.css');
  const paragraphRule = css.match(/\.lesson-it-text,\s*\.lesson-it-text \*,\s*\.lesson-sentence\s*\{[^}]*\}/u)?.[0] || '';
  assert.match(paragraphRule, /user-select:\s*none\s*!important/u);
  assert.match(paragraphRule, /-webkit-user-select:\s*none\s*!important/u);
  assert.match(paragraphRule, /-webkit-touch-callout:\s*none\s*!important/u);
  const wordRule = css.match(/\.wt-word\s*\{[^}]*\}/u)?.[0] || '';
  assert.match(wordRule, /user-select:\s*none\s*!important/u);
  assert.match(wordRule, /-webkit-user-select:\s*none\s*!important/u);
  assert.match(wordRule, /-webkit-touch-callout:\s*none\s*!important/u);
  assert.match(wordRule, /cursor:\s*pointer/u);

  const app = read('src/app.js');
  const clickStart = app.indexOf("const tappedWord=event.target.closest('.wt-word[data-term]')");
  const clickEnd = app.indexOf('const sentenceControl=', clickStart);
  const wordClickBranch = app.slice(clickStart, clickEnd);
  assert.match(wordClickBranch, /if\(tappedWord\)\{event\.preventDefault\(\);openTappedWord\(tappedWord,event\);return;\}/u);
});

test('word-tap guidance gives the exact single-tap instruction in both languages', () => {
  const app = read('src/app.js');
  assert.ok(app.includes("pair('Tocca una parola per tradurre','انقر على الكلمة للترجمة')"));
  assert.doesNotMatch(app, /Tieni premuta una parola|اضغط مطولًا على كلمة إيطالية/u);
  const bundle = read('public/app.bundle.js');
  assert.ok(bundle.includes('Tocca una parola per tradurre'));
  assert.ok(bundle.includes('انقر على الكلمة للترجمة'));
  assert.doesNotMatch(bundle, /Tieni premuta una parola|اضغط مطولًا على كلمة إيطالية/u);
});

test('inline sentence translation displays only Arabic beneath the already visible Italian sentence', () => {
  const app = read('src/app.js');
  const start = app.indexOf('function showInlineSentenceTranslation(');
  const end = app.indexOf('\nfunction openVocabularyCard(', start);
  const renderer = app.slice(start, end);
  assert.match(renderer, /arabic\.textContent=matched\.translation/u);
  assert.match(renderer, /note\.append\(arabic\);placement\.insertAdjacentElement\('afterend',note\)/u);
  assert.doesNotMatch(renderer, /matched\.source|createElement\('small'\)|note\.append\(italian/u);
});

test('key points use stacked bilingual cards with isolated Italian and Arabic labels', async () => {
  const { renderLessonSections } = await import(path.join(root, 'src/lesson-template.mjs'));
  const markup = renderLessonSections({
    summaryIt: 'La carreggiata è destinata ai veicoli.',
    summaryAr: 'المسار مخصص للمركبات.',
    keyPoints: [{it: 'La parte della strada destinata ai veicoli.', ar: 'الجزء من الطريق المخصص للمركبات.'}]
  });
  assert.match(markup, /class="lesson-key-point-list key-points-list key-points-grid"/u);
  assert.match(markup, /class="lesson-key-point-card key-point-card"/u);
  assert.match(markup, /class="kp-it" lang="it" dir="ltr"/u);
  assert.match(markup, /class="kp-ar" lang="ar" dir="rtl"/u);
  assert.match(markup, /role="heading" aria-level="3"/u);
  assert.doesNotMatch(markup, /<table\b|<tr\b|<td\b/u);
  const css = read('src/rebuild.css');
  assert.match(css, /\.lesson-key-point-list,\.key-points-list,\.key-points-grid\{display:flex;flex-direction:column;gap:12px/u);
  assert.match(css, /\.kp-it\{[^}]*font:750/u);
  assert.match(css, /\.kp-ar\{[^}]*direction:rtl/u);
});

test('Web Speech keeps Italian cancellation, rate, neutral pitch, full volume, and unverified name hints', async () => {
  const { createSpeechController } = await import(path.join(root, 'src/speech.mjs'));
  const utterances = [];
  let cancelCount = 0;
  class FakeUtterance { constructor(text) { this.text = text; } }
  const voices = [
    {name: 'Device Italian', lang: 'it-IT', localService: true},
    {name: 'Google Natural Italiano', lang: 'it-IT', localService: true},
    {name: 'Google Arabic', lang: 'ar-EG', localService: true}
  ];
  const webSpeech = {
    Utterance: FakeUtterance,
    synthesis: {
      getVoices: () => voices,
      speak: utterance => { utterances.push(utterance); queueMicrotask(() => utterance.onend?.()); },
      cancel: () => { cancelCount += 1; }
    }
  };
  const controller = createSpeechController({ webSpeech, getRate: () => 1 });
  assert.equal(await controller.speak('Ciao.', 'it-IT'), true);
  assert.equal(await controller.speak('مرحبا.', 'ar-EG'), false);
  assert.ok(cancelCount >= 2);
  assert.equal(utterances.length, 1);
  assert.equal(utterances[0].lang, 'it-IT');
  for (const utterance of utterances) {
    assert.equal(utterance.rate, 1.0);
    assert.equal(utterance.pitch, 1.0);
    assert.equal(utterance.volume, 1.0);
  }
  assert.equal(utterances[0].voice, voices[1]);
  const speech = read('src/speech.mjs');
  assert.match(speech, /selectionEvidence:.*unverified-name-hint/u);
  await controller.stop();
});

test('missing Web Speech API fails gracefully without throwing or starting native audio', async () => {
  const { createSpeechController } = await import(path.join(root, 'src/speech.mjs'));
  const states = [];
  const controller = createSpeechController({ webSpeech: {}, onStateChange: state => states.push(state) });
  assert.equal(await controller.speak('Ciao.', 'it-IT'), false);
  assert.equal(controller.state, 'error');
  assert.ok(states.some(state => state.status === 'error'));
  await controller.stop();
  assert.equal(controller.state, 'idle');
});
