'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));

test('v54 removes the assistant UI, route, source module and server API', () => {
  const app = read('src/app.js');
  const server = read('server.js');
  assert.equal(fs.existsSync(path.join(root, 'src/assistant.mjs')), false);
  assert.doesNotMatch(app, /assistantPage|requestAssistantAnswer|resolveAssistantPrompt|data-ask-lesson|data-ask-question|data-assistant-prompt/u);
  assert.doesNotMatch(server, /\/api\/assistant|SYSTEM_PROMPT|async function assistant/u);
});

test('v54 removes the dedicated lesson search but retains question-bank and glossary search', () => {
  const app = read('src/app.js');
  assert.doesNotMatch(app, /courseFinder|courseSearch|course-finder|course-search-box|data-course-lesson-row|Cerca una lezione|ابحث عن درس/u);
  assert.match(app, /id="searchForm"/u);
  assert.match(app, /id="glossarySearch"/u);
});

test('Arabic text stays visible but Arabic speech controls and locale are absent', async () => {
  const app = read('src/app.js');
  const speech = read('src/speech.mjs');
  assert.match(app, /q\.ar/u);
  assert.doesNotMatch(`${app}\n${speech}`, /ARABIC_TTS_LOCALE|ar-EG|data-speak/u);
  assert.doesNotMatch(app, /data-tts-locale="\$\{[^}]*ar/u);
  const controllerModule = await import(path.join(root, 'src/speech.mjs'));
  assert.equal('ARABIC_TTS_LOCALE' in controllerModule, false);
  const spoken = [];
  class FakeUtterance { constructor(text) { this.text = text; } }
  const controller = controllerModule.createSpeechController({webSpeech: {Utterance: FakeUtterance, synthesis: {getVoices: () => [], speak: utterance => { spoken.push(utterance); queueMicrotask(() => utterance.onend?.()); }, cancel() {}}}});
  assert.equal(await controller.speak('النص العربي باقٍ', 'ar-EG'), false);
  assert.deepEqual(spoken, []);
});

test('v54 asks the system for it-IT when no Italian voice is listed', async () => {
  const {createSpeechController} = await import(path.join(root, 'src/speech.mjs'));
  const utterances = [];
  class FakeUtterance { constructor(text) { this.text = text; } }
  const controller = createSpeechController({webSpeech: {
    Utterance: FakeUtterance,
    synthesis: {getVoices: () => [{name: 'Default', lang: 'en-US'}], speak: utterance => { utterances.push(utterance); queueMicrotask(() => utterance.onend?.()); }, cancel() {}}
  }});
  assert.equal(await controller.speak('Riconoscere i segnali.', 'it-IT'), true);
  assert.equal(utterances.length, 1);
  assert.equal(utterances[0].lang, 'it-IT');
  assert.equal(utterances[0].voice, undefined);
});

test('v54 dictionary includes contextual translations for the three words in the video', () => {
  const dictionary = json('data/italian_arabic_dictionary_lookup.json');
  const words = new Map(dictionary.entries.map(row => [row.word, row]));
  const expected = {forme: 'أشكال', offrono: 'توفّر / تقدّم', concreto: 'المحدّد / الملموس'};
  for (const [word, arabic] of Object.entries(expected)) {
    assert.equal(words.get(word)?.translation_ar, arabic);
    assert.equal(words.get(word)?.translation_kind, 'contextual_translation');
    assert.equal(words.get(word)?.source, 'video-lesson-context-v54');
    assert.equal(words.get(word)?.review_required, 0);
  }
});

test('v58 release metadata agrees across the PWA and Android package', () => {
  assert.equal(json('package.json').version, '58.0.0');
  assert.equal(json('package-lock.json').version, '58.0.0');
  assert.equal(json('public/release.json').version, 58);
  assert.match(read('android/app/build.gradle'), /versionCode 58/u);
  assert.match(read('android/app/build.gradle'), /versionName "58\.0\.0"/u);
  assert.match(read('.github/workflows/build.yml'), /patente-b-v58-debug-apk/u);
});
