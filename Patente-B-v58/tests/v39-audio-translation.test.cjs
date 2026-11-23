'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

let translation;
test('load local word-translation module', async () => {
  translation = await import(path.join(root, 'src/lesson-translation.mjs'));
});

test('single-tap lookup resolves one isolated word and labels machine drafts honestly', () => {
  assert.equal(translation.wordAtOffset('La corsia è libera.', 4), 'corsia');
  assert.equal(translation.wordAtOffset('---', 1), '');
  assert.equal(translation.wordAtOffset('   ', 1), '');
  translation.setGeneratedDictionary([{
    word: 'corsia', translation_ar: 'مسودة لحارة السير', source: 'local model@pinned revision',
    provider: 'opus-mt-local', status: 'machine_draft_needs_review', review_required: 1,
    confidence: null, note: '',
  }]);
  const draft = translation.translateTappedWord('corsia', []);
  assert.equal(draft.word, 'corsia');
  assert.equal(draft.arabic, 'مسودة لحارة السير');
  assert.equal(draft.status, 'machine_draft_needs_review');
  assert.equal(draft.confidence, null);
  assert.match(draft.note, /مسودة ترجمة آلية غير مراجعة/u);
  const missing = translation.translateTappedWord('parola non presente', []);
  assert.equal(missing.arabic, '');
  assert.match(missing.note, /لم يُسجَّل مقابل عربي مفرد لهذه الكلمة/u);
  const app = read('src/app.js');
  const tooltipStart = app.indexOf('function showWordTooltip(');
  const tooltipEnd = app.indexOf('function openTappedWord(', tooltipStart);
  const tooltipHandler = app.slice(tooltipStart, tooltipEnd);
  assert.ok(tooltipHandler.includes('translateTappedWord(word,[])'));
  assert.ok(!tooltipHandler.includes('translateLessonSentence'));
  assert.match(app.slice(app.indexOf('function openTappedWord('), app.indexOf('function showInlineSentenceTranslation(')), /loadLocalWordDictionary\(\)/u);
  assert.match(app, /main\.addEventListener\('click',event=>\{/u);
  assert.match(app, /const tappedWord=event\.target\.closest\('\.wt-word\[data-term\]'\)/u);
  assert.match(app, /openTappedWord\(tappedWord,event\)/u);
  assert.doesNotMatch(app, /wordHoldTimer|heldItalianTarget/u);
});

test('only project-approved terms are presented as reviewed overrides', () => {
  const overrides = JSON.parse(read('prototypes/v40-dictionary/approved_overrides.json'));
  assert.equal(overrides.corsia.arabic, 'حارة سير');
  assert.equal(overrides.carreggiata.arabic, 'الطريق المخصص للمركبات');
  assert.equal(overrides.prudenza.arabic, 'حذر');
  const app = read('src/app.js');
  assert.ok(app.includes('document.querySelector(\'#translationTooltipNote\').textContent=matched.note'));
});

test('v49 ships the corrected dictionary in JSON and a valid SQLite asset', () => {
  const dictionary = JSON.parse(read('data/italian_arabic_dictionary_lookup.json'));
  assert.equal(dictionary.entries.length, 5281);
  assert.ok(dictionary.entries.every(row => row.word && row.translation_ar));
  assert.equal(dictionary.entries.filter(row => row.status === 'fallback_draft_needs_review').length, 0);
  assert.equal(dictionary.entries.filter(row => row.source === 'owner-approved-correction-v42' && row.status === 'reviewed_override' && row.review_required === 0).length, 9);
  for (const letterArtifact of ['b', 'f', 'g', 'h', 'p', 'v', 'x']) assert.equal(dictionary.entries.some(row => row.word === letterArtifact), false);
  const get = word => dictionary.entries.find(row => row.word.toLocaleLowerCase('it') === word);
  assert.equal(get('corsia').translation_ar, 'حارة سير');
  assert.equal(get('carreggiata').translation_ar, 'الطريق المخصص للمركبات');
  assert.equal(get('prudenza').translation_ar, 'حذر');
  assert.equal(get('riconoscere').translation_ar, 'يتعرف على');
  assert.equal(get('riconoscere').status, 'reviewed_override');
  assert.equal(get('spiegazione').translation_ar, 'شرح / تفسير');
  assert.equal(get('spiegazione').source, 'user-requested-lemma-v51');
  assert.equal(get('spiegazione').translation_ar, 'شرح / تفسير');
  assert.equal(get('spiegazione').source, 'user-requested-lemma-v51');
  const db = fs.readFileSync(path.join(root, 'android/app/src/main/assets/dictionary.db'));
  assert.equal(db.subarray(0, 16).toString('ascii'), 'SQLite format 3\0');
});

test('v51 uses Web Speech only, with Italian lesson audio and no bundled local TTS', () => {
  const index = read('index.html');
  const app = read('src/app.js');
  const speech = read('src/speech.mjs');
  const mainActivity = read('android/app/src/main/java/it/patenteb/sideload/v29/MainActivity.java');
  const gradle = read('android/app/build.gradle');
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(index, /data-audio-backend="web-speech"/u);
  assert.match(speech, /speechSynthesis|SpeechSynthesisUtterance/u);
  assert.match(speech, /getVoices\(\)/u);
  assert.match(app, /createSpeechController\(\{getRate:/u);
  assert.ok(app.includes("ITALIAN_TTS_LOCALE} from './speech.mjs'"));
  assert.doesNotMatch(speech, /playItalianAudio|isAudioUnlocked/u);
  assert.match(mainActivity, /registerPlugin\(RewardedAdsPlugin\.class\)/u);
  assert.doesNotMatch(mainActivity, /SpeechSettingsPlugin/u);
  assert.doesNotMatch(manifest, /TTS_SERVICE/u);
  assert.doesNotMatch(`${app}\n${speech}\n${gradle}\n${manifest}\n${mainActivity}`, /Piper|piperAlpha|nativeTts|ONNX|sherpa-onnx|piper-phonemize/u);
  for (const rel of ['android/app/src/piperAlpha', 'android/app/src/main/assets/piper']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must remain absent`);
  }
  assert.equal(fs.existsSync(path.join(root, 'scripts/build-piper-alpha.sh')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts/download_piper_runtime.sh')), false);
  assert.match(app, /Capacitor\.isNativePlatform\(\)/u);
});

test('v43 top bar keeps the brand only and removes install controls and listeners', () => {
  const index = read('index.html');
  const app = read('src/app.js');
  assert.doesNotMatch(index, /installApp|installDialog|install-button|Installa|تثبيت التطبيق/u);
  assert.doesNotMatch(app, /installPrompt|beforeinstallprompt|appinstalled|showInstallHelp|updateInstallButton|isStandalone/u);
});

test('Web Speech speaks Italian only and rejects Arabic playback requests', async () => {
  const { createSpeechController } = await import(path.join(root, 'src/speech.mjs'));
  const utterances = [];
  class FakeUtterance { constructor(text) { this.text = text; } }
  const voices = [{name: 'Italian', lang: 'it-IT'}, {name: 'Arabic', lang: 'ar-EG'}];
  const webSpeech = {
    Utterance: FakeUtterance,
    synthesis: {getVoices: () => voices, speak: utterance => { utterances.push(utterance); queueMicrotask(() => utterance.onend?.()); }, cancel() {}, pause() {}, resume() {}}
  };
  const states = [];
  const controller = createSpeechController({webSpeech, onStateChange: state => states.push(state)});
  assert.equal(await controller.speak('Ciao, prudenza.', 'it-IT'), true);
  assert.equal(await controller.speak('يجب القيادة بحذر.', 'ar-EG'), false);
  assert.deepEqual(utterances.map(({text, lang}) => ({text, lang})), [{text: 'Ciao, prudenza.', lang: 'it-IT'}]);
  assert.equal(utterances[0].voice, voices[0]);
  assert.equal(utterances[0].rate, 0.8);
  for (const utterance of utterances) {
    assert.equal(utterance.pitch, 1.0);
    assert.equal(utterance.volume, 1.0);
  }
  assert.ok(states.some(state => state.status === 'playing' && state.voiceSource === 'browser' && state.qualityHint === 'device-speech'));
  assert.equal(controller.state, 'idle');
});

test('missing or incomplete speech engines fail safely and stop clears the error', async () => {
  const { createSpeechController } = await import(path.join(root, 'src/speech.mjs'));
  const states = [];
  const controller = createSpeechController({webSpeech: {synthesis: {}, Utterance: null}, onStateChange: state => states.push(state)});
  assert.equal(await controller.speak('Ciao.', 'it-IT'), false);
  assert.equal(controller.state, 'error');
  assert.ok(states.some(state => state.status === 'error'));
  await controller.stop();
  assert.equal(controller.state, 'idle');
});

test('stopping a pending browser fallback cancels it without an unhandled error', async () => {
  const { createSpeechController } = await import(path.join(root, 'src/speech.mjs'));
  let current = null;
  let cancelCount = 0;
  class FakeUtterance { constructor(text) { this.text = text; } }
  const webSpeech = {
    Utterance: FakeUtterance,
    synthesis: {
      getVoices: () => [{name: 'Italian', lang: 'it-IT'}],
      speak: utterance => { current = utterance; },
      cancel: () => { cancelCount += 1; current?.onerror?.({error: 'canceled'}); },
      pause() {},
      resume() {}
    }
  };
  const controller = createSpeechController({webSpeech});
  const playing = controller.speak('Una frase.', 'it-IT');
  for (let attempt = 0; attempt < 10 && !current; attempt += 1) await new Promise(resolve => setImmediate(resolve));
  assert.ok(current);
  await controller.stop();
  assert.equal(await playing, false);
  assert.ok(cancelCount >= 2);
  assert.equal(controller.state, 'idle');
});

test('Web Speech waits briefly for Italian voices before falling back to the system language selector', async () => {
  const { createSpeechController } = await import(path.join(root, 'src/speech.mjs'));
  const utterances = [];
  const listeners = new Set();
  const states = [];
  let voices = [];
  class FakeUtterance { constructor(text) { this.text = text; } }
  const italianVoice = {name: 'Italian', lang: 'it-IT'};
  const webSpeech = {
    Utterance: FakeUtterance,
    synthesis: {
      getVoices: () => voices,
      addEventListener: (name, listener) => { if (name === 'voiceschanged') listeners.add(listener); },
      removeEventListener: (name, listener) => { if (name === 'voiceschanged') listeners.delete(listener); },
      speak: utterance => { utterances.push(utterance); queueMicrotask(() => utterance.onend?.()); },
      cancel() {}
    }
  };
  const controller = createSpeechController({webSpeech, onStateChange: state => states.push(state)});
  const speaking = controller.speak('Voce di sistema.', 'it-IT');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(states.some(state => state.status === 'preparing'));
  assert.equal(utterances.length, 0);
  voices = [italianVoice];
  for (const listener of [...listeners]) listener();
  assert.equal(await speaking, true);
  assert.equal(utterances.length, 1);
  assert.equal(utterances[0].voice, italianVoice);
  assert.equal(listeners.size, 0);
});

test('stopping while voices load cleans up the listener and never speaks', async () => {
  const { createSpeechController } = await import(path.join(root, 'src/speech.mjs'));
  const listeners = new Set();
  const utterances = [];
  class FakeUtterance { constructor(text) { this.text = text; } }
  const webSpeech = {
    Utterance: FakeUtterance,
    synthesis: {
      getVoices: () => [],
      addEventListener: (name, listener) => { if (name === 'voiceschanged') listeners.add(listener); },
      removeEventListener: (name, listener) => { if (name === 'voiceschanged') listeners.delete(listener); },
      speak: utterance => utterances.push(utterance),
      cancel() {}
    }
  };
  const controller = createSpeechController({webSpeech});
  const speaking = controller.speak('Una frase.', 'it-IT');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(listeners.size, 1);
  await controller.stop();
  assert.equal(await speaking, false);
  assert.equal(listeners.size, 0);
  assert.equal(utterances.length, 0);
  assert.equal(controller.state, 'idle');
});

test('Web Speech falls back to it-IT when the voice list is empty or unavailable', async () => {
  const { createSpeechController } = await import(path.join(root, 'src/speech.mjs'));
  class FakeUtterance { constructor(text) { this.text = text; } }
  const states = [];
  const utterances = [];
  const webSpeech = {
    Utterance: FakeUtterance,
    synthesis: {getVoices() { throw new Error('voice list unavailable'); }, speak(utterance) { utterances.push(utterance); queueMicrotask(() => utterance.onend?.()); }, cancel() {}}
  };
  const controller = createSpeechController({webSpeech, onStateChange: state => states.push(state)});
  assert.equal(await controller.speak('Ciao.', 'it-IT'), true);
  assert.equal(utterances.length, 1);
  assert.equal(utterances[0].lang, 'it-IT');
  assert.equal(utterances[0].voice, undefined);
  assert.equal(controller.state, 'idle');
});

test('published video links remain high-contrast controls and unpublished lessons are status-only', () => {
  const app = read('src/app.js');
  const css = read('src/v50-contrast.css');
  assert.ok(app.includes('lesson-video-status-link" data-youtube-cta'));
  assert.ok(app.includes('lesson-video-upcoming-status'));
  assert.ok(app.includes('role="status"'));
  assert.ok(!app.includes('Watch the video explanation (coming soon)'));
  assert.match(css, /#main \.lesson-video-cta-link \{ background: #145766 !important; color: #c8e5ea !important;/u);
  assert.match(css, /#main \.lesson-video-upcoming-status/u);
});

test('warning cards use the v50 teal palette with WCAG AA contrast', () => {
  const css = read('src/v50-contrast.css');
  const luminance = hex => {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  };
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + .05) / (lo + .05);
  };
  assert.match(css, /#main \.lesson-warning-block[\s\S]*?background: #173d4a !important/u);
  assert.ok(contrast('#c8e5ea', '#173d4a') >= 4.5);
  assert.ok(contrast('#2edbc0', '#173d4a') >= 4.5);
});

test('floating audio player uses SVG controls, a fixed 0.8x speed, and compact dimensions', () => {
  const index = read('index.html');
  const css = read('src/v40-audio.css');
  assert.match(index, /id="speechStop"[^>]*aria-label="إيقاف الصوت"/u);
  assert.match(index, /class="speech-rate-control"[\s\S]*?class="speech-rate-value" aria-label="سرعة الصوت الإيطالي">0\.8×/u);
  assert.match(css, /bottom: max\(20px, env\(safe-area-inset-bottom\)\)/u);
  assert.match(css, /width: 90%;[\s\S]*?max-width: 400px;[\s\S]*?height: 60px/u);
});

test('generated dictionary preserves Italian diacritics instead of merging distinct token forms', () => {
  translation.setGeneratedDictionary([
    {word: 'velocita', translation_ar: 'شكل بلا علامة', source: 'test', provider: 'test', status: 'machine_draft_needs_review', confidence: null},
    {word: 'velocità', translation_ar: 'شكل بعلامة صوتية', source: 'test', provider: 'test', status: 'machine_draft_needs_review', confidence: null},
  ]);
  assert.equal(translation.translateTappedWord('velocita', []).arabic, 'شكل بلا علامة');
  assert.equal(translation.translateTappedWord('velocità', []).arabic, 'شكل بعلامة صوتية');
});

test('bilingual key-point cards keep readable contrast in the unified v50 palette', () => {
  const css = read('src/v50-contrast.css');
  const luminance = color => {
    const channels = color.match(/[0-9a-f]{2}/giu).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (first, second) => {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  assert.ok(contrast('#c8e5ea', '#193543') >= 4.5);
  assert.ok(contrast('#91c4cf', '#193543') >= 4.5);
  assert.match(css, /#main \.lesson-key-point-card/u);
  assert.match(css, /:root\[data-theme="dark"\] #main \.lesson-key-point-rule/u);
  assert.match(css, /:root\[data-theme="system"\] #main \.lesson-key-point-card/u);
});

test('new word taps dismiss the previous tooltip and touch hover cannot stay on a stale word', () => {
  const app = read('src/app.js');
  const css = read('src/v40-audio.css');
  const v50Css = read('src/v50-contrast.css');
  const start = app.indexOf('function openTappedWord(');
  const end = app.indexOf('function showInlineSentenceTranslation(', start);
  assert.ok(start >= 0 && end > start);
  assert.match(app.slice(start, end), /^function openTappedWord\(node,event=\{\}\)\{\s*closeWordTooltip\(\);/u);
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)[\s\S]*#main \.lesson-it-text \.wt-word:hover:not\(:focus-visible\)/u);
  assert.match(v50Css, /#main \.lesson-it-text \.wt-word:active \{ background: #1b5660 !important;/u);
});
