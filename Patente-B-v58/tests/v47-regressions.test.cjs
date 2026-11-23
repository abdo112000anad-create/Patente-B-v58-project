'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));

test('dictionary resolves riconoscere directly and the attached pronoun in riconoscerlo', async () => {
  const payload = json('data/italian_arabic_dictionary_lookup.json');
  const lemma = payload.entries.find(row => row.word === 'riconoscere');
  assert.ok(lemma);
  assert.equal(lemma.translation_ar, 'يتعرف على');
  assert.equal(lemma.status, 'reviewed_override');

  const translation = await import(path.join(root, 'src/lesson-translation.mjs'));
  translation.setGeneratedDictionary(payload.entries);
  const direct = translation.translateTappedWord('riconoscere');
  assert.equal(direct.italian, 'riconoscere');
  assert.equal(direct.arabic, 'يتعرف على');
  const attached = translation.translateTappedWord('riconoscerlo');
  assert.equal(attached.word, 'riconoscerlo');
  assert.equal(attached.italian, 'riconoscere');
  assert.equal(attached.arabic, 'يتعرف على');
});

test('attached-pronoun lookup accepts only dictionary-backed roots and gives exact forms priority', async () => {
  const translation = await import(path.join(root, 'src/lesson-translation.mjs'));
  translation.setGeneratedDictionary([
    {word: 'porta', translation_ar: 'باب', status: 'reviewed_override'},
    {word: 'portare', translation_ar: 'يحمل', status: 'reviewed_override'},
  ]);
  assert.equal(translation.translateTappedWord('portala').italian, 'porta');

  translation.setGeneratedDictionary([
    {word: 'portare', translation_ar: 'يحمل', status: 'reviewed_override'},
    {word: 'portarlo', translation_ar: 'خذه', status: 'reviewed_override'},
  ]);
  const exact = translation.translateTappedWord('portarlo');
  assert.equal(exact.italian, 'portarlo');
  assert.equal(exact.arabic, 'خذه');

  translation.setGeneratedDictionary([{word: 'pare', translation_ar: 'يبدو'}]);
  const ambiguous = translation.translateTappedWord('parlo');
  assert.equal(ambiguous.status, 'missing');
  assert.equal(ambiguous.arabic, '');
});

test('Web Speech fallback waits for voiceschanged with bounded cleanup and fixed voice settings', async () => {
  const {createSpeechController} = await import(path.join(root, 'src/speech.mjs'));
  let voices = [];
  const listeners = new Set();
  const utterances = [];
  class FakeUtterance { constructor(text) { this.text = text; } }
  const webSpeech = {
    Utterance: FakeUtterance,
    synthesis: {
      getVoices: () => voices,
      addEventListener: (event, handler) => { if (event === 'voiceschanged') listeners.add(handler); },
      removeEventListener: (event, handler) => { if (event === 'voiceschanged') listeners.delete(handler); },
      speak: utterance => { utterances.push(utterance); queueMicrotask(() => utterance.onend?.()); },
      cancel() {},
    },
  };
  const controller = createSpeechController({webSpeech});
  const playback = controller.speak('Ciao.', 'it-IT');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(listeners.size, 1);
  voices = [{name: 'Italian', lang: 'it-IT'}];
  for (const listener of [...listeners]) listener();
  assert.equal(await playback, true);
  assert.equal(listeners.size, 0);
  assert.equal(utterances[0].rate, 0.8);
  assert.equal(utterances[0].pitch, 1.0);

  const source = read('src/speech.mjs');
  assert.match(source, /VOICE_WAIT_TIMEOUT_MS\s*=\s*5000/u);
  assert.match(source, /addEventListener\('voiceschanged'/u);
  assert.match(source, /removeEventListener\('voiceschanged'/u);
  assert.doesNotMatch(source, /nativeTts|nativeEngineDisabled|Piper|ONNX/u);
  assert.match(source, /prepareWebVoice/u);
});

test('Android Native TTS query is absent and CI verifies it stays removed', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.doesNotMatch(manifest, /android\.intent\.action\.TTS_SERVICE/u);
  const workflow = read('.github/workflows/build.yml');
  assert.match(workflow, /Verify Native TTS service is not queried/u);
  assert.match(workflow, /! grep -Fq 'android\.intent\.action\.TTS_SERVICE'/u);
});
