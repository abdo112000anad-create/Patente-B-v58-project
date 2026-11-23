'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');

const DAY = 86_400_000;

test('v58 contains exactly 50 ordered lesson records with the eight required fields', () => {
  const course = json('data/lessons.json');
  const serviceWorker = read('public/sw.js');
  assert.equal(course.schema_version, 4);
  assert.equal(course.modules.length, 11);
  assert.match(serviceWorker, /const lessonKeys = \['id', 'titleIt'/u);
  assert.match(serviceWorker, /lesson\.keyPoints\.length <= 4/u);
  assert.match(read('.github/workflows/build.yml'), /npm run build[\s\S]*npx cap sync android/u);
  const all = course.modules.flatMap(module => module.lessons);
  assert.equal(all.length, 50);
  assert.equal(new Set(all.map(lesson => lesson.id)).size, 50);
  for (const module of course.modules) {
    for (const [index, lesson] of module.lessons.entries()) {
      assert.deepEqual(Object.keys(lesson), ['id', 'titleIt', 'titleAr', 'summaryIt', 'summaryAr', 'keyPoints', 'trapWord', 'quickCheck']);
      assert.equal(lesson.id, `u${module.order_hint}-l${index + 1}`);
      for (const field of ['titleIt', 'titleAr', 'summaryIt', 'summaryAr']) assert.ok(lesson[field].trim(), `${lesson.id} ${field}`);
      const sentences = lesson.summaryIt.split(/(?<=[.!?])\s+(?=[A-ZÀÈÉÌÒÙ])/u).filter(Boolean);
      assert.ok(sentences.length >= 1 && sentences.length <= 2, `${lesson.id} should have one or two concise Italian sentences`);
      assert.match(lesson.summaryAr, /\([^()]*[A-Za-zÀ-ÿ][^()]*\)/u, `${lesson.id} should include an Italian term in parentheses`);
      assert.ok(lesson.keyPoints.length >= 3 && lesson.keyPoints.length <= 4, `${lesson.id} key-point count`);
      assert.ok(lesson.keyPoints.every(point => Object.keys(point).join(',') === 'it,ar' && point.it.trim() && point.ar.trim()));
      assert.ok(lesson.quickCheck.length === 3, `${lesson.id} quick-check count`);
      assert.ok(lesson.quickCheck.every(question => Object.keys(question).join(',') === 'qIt,a,explainAr' && question.qIt.trim() && ['VERO', 'FALSO'].includes(question.a) && question.explainAr.trim()));
      assert.ok(lesson.trapWord === null || (Object.keys(lesson.trapWord).join(',') === 'word,reasonAr' && lesson.trapWord.word.trim() && lesson.trapWord.reasonAr.trim()));
      assert.doesNotMatch(JSON.stringify(lesson), /<\/?[a-z][^>]*>/iu, `${lesson.id} must not contain HTML`);
    }
  }
});

test('GitHub Actions builds the current PWA consumed by Capacitor before Android sync', () => {
  const workflow = read('.github/workflows/build.yml');
  const release = json('dist/release.json');
  const lessonHash = sha256('data/lessons.json');
  assert.equal(json('package.json').scripts.build, 'node scripts/build-pwa.cjs');
  assert.equal(json('capacitor.config.json').webDir, 'dist');
  assert.match(workflow, /npm run build[\s\S]*npx cap sync android/u);
  assert.equal(release.version, 58);
  assert.equal(release.lessonsSha256, lessonHash);
  assert.equal(sha256('dist/data/lessons.json'), lessonHash);
  assert.equal(sha256('dist/app.bundle.js'), release.bundleSha256);
  assert.equal(sha256('public/app.bundle.js'), release.bundleSha256);
});

test('quick-check mistakes return tomorrow and a first correct answer returns in three days', async () => {
  const review = await import(path.join(root, 'src/quick-check-review.mjs'));
  const now = Date.UTC(2026, 10, 22);
  const wrong = review.scheduleQuickCheckAnswer({lessonId: 'u1-l1', questionIndex: 0, chosen: 'FALSO', expected: 'VERO', now});
  assert.equal(wrong.key, 'u1-l1::q1');
  assert.equal(wrong.dueAt, now + DAY);
  assert.deepEqual(wrong.wrongAnswers, ['u1-l1::q1']);
  assert.equal(review.isQuickCheckDue(wrong.schedule[wrong.key], now + DAY), true);
  const right = review.scheduleQuickCheckAnswer({schedule: wrong.schedule, wrongAnswers: wrong.wrongAnswers, lessonId: 'u1-l1', questionIndex: 0, chosen: 'VERO', expected: 'VERO', now: now + DAY});
  assert.equal(right.dueAt, now + DAY * 4);
  assert.deepEqual(right.wrongAnswers, []);
  assert.equal(review.isQuickCheckDue(right.schedule[right.key], right.dueAt - 1), false);
  assert.equal(review.isQuickCheckDue(right.schedule[right.key], right.dueAt), true);
  assert.equal(review.quickCheckId('bad-id', 0), '');
});

test('home page uses a vertical path with current, complete, and locked states; it stores quick-check reviews', () => {
  const app = read('src/app.js');
  const start = app.indexOf('function homePage(){');
  const end = app.indexOf('function quickCheckDate(', start);
  const home = app.slice(start, end);
  const css = read('src/v57-learning-path.css');
  assert.match(home, /<ol class="lesson-path">/u);
  assert.match(home, /is-current/u);
  assert.match(home, /is-complete/u);
  assert.match(home, /is-locked/u);
  assert.match(home, /data-action="quick-error-review"/u);
  assert.match(css, /\.lesson-path\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/u);
  assert.match(css, /\.lesson-path-node\.is-complete[\s\S]*?background:\s*#1f754f/u);
  assert.match(css, /\.lesson-path-node\.is-locked[\s\S]*?background:\s*#202a31/u);
  assert.match(css, /#main \.wt-word\s*\{(?=[^}]*user-select:\s*none)(?=[^}]*cursor:\s*pointer)[^}]*\}/u);
  assert.match(app, /wrongAnswers:Array\.isArray\(raw\.wrongAnswers\)/u);
  assert.match(app, /quickCheckSchedule:raw\.quickCheckSchedule/u);
  assert.match(app, /persistState\(\);render\(currentView==='quick-errors'\?'quick-errors':'lesson'/u);
  assert.match(app, /function quickErrorReviewPage\(/u);
});

test('exam uses 30 random questions, 20 minutes, fails at the fourth mistake, and highlights unanswered items', () => {
  const app = read('src/app.js');
  assert.match(app, /if\(mode==='exam'\)candidates=shuffle\(candidates\)\.slice\(0,30\)/u);
  assert.match(app, /timerMinutes\*60/u);
  assert.match(app, /errors>=4\)\{finishExam\(false,false,true\);return;\}/u);
  assert.match(app, /endedByFourthError\?'Simulazione non superata al quarto errore'/u);
  assert.match(app, /quiz\.answers\.findIndex\(value=>value===null\)/u);
  assert.match(app, /const css=marked\?'is-flagged':hasAnswer\?'is-answered':'is-blank'/u);
});

test('Web Speech is Italian-only at rate 0.8 and pitch 1.0; Native TTS is absent', () => {
  const speech = read('src/speech.mjs');
  const app = read('src/app.js');
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(speech, /utterance\.lang\s*=\s*ITALIAN_TTS_LOCALE/u);
  assert.match(speech, /utterance\.pitch\s*=\s*1\.0/u);
  assert.match(app, /const speechRate=\.8/u);
  assert.match(speech, /VOICE_WAIT_TIMEOUT_MS\s*=\s*5000/u);
  assert.doesNotMatch(`${speech}\n${app}\n${manifest}`, /Piper|ONNX|SpeechSettingsPlugin|android\.intent\.action\.TTS_SERVICE/u);
  assert.doesNotMatch(manifest, /<queries>/u);
});

test('word-tap translates from the local dictionary and resolves all required attached Italian pronouns', async () => {
  const translation = await import(path.join(root, 'src/lesson-translation.mjs'));
  const dictionary = json('data/italian_arabic_dictionary_lookup.json');
  await translation.loadLocalWordDictionary('/data/italian_arabic_dictionary_lookup.json', async () => ({ok: true, json: async () => dictionary}));
  assert.equal(translation.translateTappedWord('riconoscere', []).arabic, 'يتعرف على');
  for (const suffix of ['le', 'lo', 'la', 'ne', 'ci', 'vi', 'li']) {
    assert.equal(translation.translateTappedWord(`riconoscer${suffix}`, []).arabic, 'يتعرف على', suffix);
  }
  const app = read('src/app.js');
  assert.match(app, /class="wt-word" role="button" tabindex="0" data-term=/u);
  assert.match(app, /loadLocalWordDictionary\(\)\.then/u);
  assert.match(read('src/lesson-template.mjs'), /italianWordMarkup\(lesson\.summaryIt\)/u);
  assert.match(read('src/lesson-template.mjs'), /italianWordMarkup\(item\.it\)/u);
});
