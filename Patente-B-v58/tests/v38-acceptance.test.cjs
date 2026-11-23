'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));

const course = json('data/lessons.json');
const support = json('data/lesson-support.json');
const bank = json('data/questions.json');
const index = read('index.html');
const app = read('src/app.js');


test('v58 keeps exactly 50 lessons with the ordered eight-field bilingual schema', () => {
  assert.equal(course.modules.length, 11);
  assert.equal(course.schema_version, 4);
  assert.equal(course.modules.reduce((count, module) => count + module.lessons.length, 0), 50);
  assert.deepEqual(course.modules.map(module => module.order_hint), [...course.modules.map(module => module.order_hint)].sort((a, b) => a - b));
  for (const module of course.modules) for (const lesson of module.lessons) {
    assert.deepEqual(Object.keys(lesson), ['id', 'titleIt', 'titleAr', 'summaryIt', 'summaryAr', 'keyPoints', 'trapWord', 'quickCheck']);
    assert.equal(lesson.id, `u${module.order_hint}-l${module.lessons.indexOf(lesson) + 1}`);
    assert.ok(lesson.titleIt && lesson.titleAr && lesson.summaryIt && lesson.summaryAr);
    assert.ok(Array.isArray(lesson.keyPoints) && lesson.keyPoints.length >= 3 && lesson.keyPoints.length <= 4);
    assert.ok(lesson.keyPoints.every(point => Object.keys(point).sort().join(',') === 'ar,it' && point.it && point.ar));
    assert.ok(lesson.trapWord === null || (Object.keys(lesson.trapWord).join(',') === 'word,reasonAr' && lesson.trapWord.word && lesson.trapWord.reasonAr));
    assert.equal(lesson.quickCheck.length, 3);
    assert.ok(lesson.quickCheck.every(question => Object.keys(question).join(',') === 'qIt,a,explainAr' && question.qIt && ['VERO','FALSO'].includes(question.a) && question.explainAr));
  }
});

test('legacy lesson support remains separate from the compact lesson objects', () => {
  assert.equal(support.schema_version, 1);
  assert.equal(Object.keys(support.lessons).length, 50);
  const compactIds = course.modules.flatMap(module => module.lessons.map(lesson => lesson.id)).sort();
  assert.deepEqual(Object.keys(support.lessons).sort(), compactIds);
  for (const module of course.modules) for (const lesson of module.lessons) {
    const legacy = support.lessons[lesson.id];
    assert.ok(legacy);
    const words = legacy.body_it.trim().split(/\s+/u).length;
    assert.ok(words >= 80 && words <= 120, `${lesson.titleIt}: ${words} Italian words`);
    assert.equal(String(legacy.core_it || '').split('\n').length, 2);
    assert.equal(String(legacy.core_ar || '').split('\n').length, 2);
    assert.ok(Array.isArray(legacy.key_points) && legacy.key_points.length > 0);
    assert.ok(Array.isArray(legacy.trap_words));
    assert.ok(Array.isArray(legacy.common_mistakes));
    assert.ok(legacy.quick_check && legacy.visual_script && legacy.sources?.length);
  }
});

test('course legal caveats keep the current-law limitation clear', () => {
  assert.ok(course.legal_check_date);
  assert.ok(course.disclaimer_ar);
  assert.ok(course.modules.some(module => module.caveats_ar?.some(text => /22 نوفمبر 2026/u.test(text))));
  assert.ok(course.modules.some(module => module.sources?.some(source => /normattiva\.it/iu.test(source.url || ''))));
});

test('lesson review provenance retains official Italian source URLs and verification notes', () => {
  const officialDomains = ['aci.gov.it', 'aci.it', 'normattiva.it', 'gazzettaufficiale.it', 'mit.gov.it'];
  const practicalOnly = new Set(['u10-l5']);
  const withoutLegalSources = new Set();
  for (const [id, lesson] of Object.entries(support.lessons)) {
    assert.ok(Array.isArray(lesson.review_sources_checked));
    assert.ok(lesson.review_verification_note);
    assert.ok(Array.isArray(lesson.sources) && lesson.sources.length > 0);
    assert.ok(lesson.sources.every(source => source && typeof source === 'object' && source.url && source.title));
    if (lesson.review_sources_checked.length === 0) {
      withoutLegalSources.add(id);
      assert.ok(practicalOnly.has(id));
      assert.match(lesson.review_verification_note, /non una regola|non formula una regola/u);
    }
    for (const raw of lesson.review_sources_checked) {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase().replace(/^www\./u, '');
      assert.equal(url.protocol, 'https:');
      assert.ok(officialDomains.some(domain => host === domain || host.endsWith(`.${domain}`)), `${raw} is not an approved official domain`);
    }
  }
  assert.deepEqual(withoutLegalSources, practicalOnly);
  assert.ok(support.lessons['u10-l6'].review_sources_checked.includes('https://www.mit.gov.it/nfsmitgov/files/media/normativa/2019-09/Circolare_protocollo_28819_del_19-09-2019.pdf'));
  assert.ok(support.lessons['u10-l4'].review_sources_checked.includes('https://aci.gov.it/codice-della-strada/art-148/'));
});

test('video scripts remain local planning material and are not published', () => {
  const lessons = Object.values(support.lessons);
  assert.equal(lessons.filter(lesson => lesson.video_script_available).length >= 5, true);
  assert.ok(lessons.filter(lesson => lesson.youtube_video?.status === 'published').every(lesson => /youtu\.be|youtube\.com/iu.test(lesson.youtube_video.url || '')));
});

test('glossary and reference data remain populated across approved categories', () => {
  const glossary = json('data/glossary-v37.json');
  const tools = json('data/reference-tools.json');
  assert.ok(glossary.entries.length >= 100);
  assert.ok(new Set(glossary.entries.map(entry => entry.category)).size >= 5);
  assert.ok(tools.traps.length > 0 && tools.numbers.length > 0 && tools.comparisons.length > 0);
  const terms = Object.fromEntries(glossary.entries.map(entry => [entry.italian.toLocaleLowerCase('it-IT'), entry.arabic]));
  assert.equal(terms.corsia, 'حارة سير');
  assert.equal(terms.carreggiata, 'الطريق المخصص للمركبات');
});

test('support retains nullable videoUrl fields and only the two confirmed videos are linked', () => {
  const lessons = course.modules.flatMap(module => module.lessons);
  assert.equal(lessons.length, 50);
  const legacy = lessons.map(lesson => support.lessons[lesson.id]);
  assert.ok(legacy.every(lesson => Object.hasOwn(lesson, 'videoUrl') && (lesson.videoUrl === null || typeof lesson.videoUrl === 'string')));
  assert.equal(legacy[0].videoUrl, 'https://youtu.be/cpzGIxl94x4');
  assert.equal(legacy[1].videoUrl, 'https://youtu.be/3JZWwAcSALQ');
  assert.ok(legacy.slice(2).every(lesson => lesson.videoUrl === null));
  assert.match(app, /lesson-video-cta/);
  assert.match(app, /الفيديو قريبًا/);
  assert.match(app, /lesson-video-upcoming-status/);
  assert.match(app, /loadVideoManifest/);
});

test('the official-source question bank retains 7,020 unique records', () => {
  assert.equal(bank.count, 7020);
  assert.equal(bank.questions.length, 7020);
  assert.equal(new Set(bank.questions.map(question => Number(question.id))).size, 7020);
  assert.ok(bank.questions.every(question => ['VERO', 'FALSO'].includes(question.answer)));
});

test('mobile navigation retains the five requested destinations and order', () => {
  const nav = index.match(/<nav class="mobile-nav"[\s\S]*?<\/nav>/u)?.[0] || '';
  assert.ok(nav);
  const destinations = [...nav.matchAll(/data-view="([^"]+)"/gu)].map(match => match[1]);
  assert.deepEqual(destinations, ['home', 'review', 'bank', 'simulation', 'profile']);
});

test('header stays minimal and lesson-title search is removed while question-bank search remains', () => {
  const header = index.match(/<header class="topbar"[\s\S]*?<\/header>/u)?.[0] || '';
  assert.ok(header);
  assert.match(header, /brand/u);
  assert.doesNotMatch(header, /searchInput|searchForm/u);
  assert.doesNotMatch(app, /course-finder|courseSearch|course-search-box|data-course-lesson-row/u);
  assert.match(app, /id="searchForm"/u);
});

test('the glossary and profile remain available while assistant code stays removed', () => {
  assert.doesNotMatch(app, /assistantPage|assistant\.mjs|data-ask-lesson|data-assistant-prompt/u);
  assert.equal(fs.existsSync(path.join(root, 'src/assistant.mjs')), false);
  assert.match(app, /glossaryPage\(/u);
  assert.match(app, /profilePage\(/u);
  assert.match(index, /data-view="profile"/u);
  assert.match(app, /profilePrivacyControls/u);
});

test('standard simulation remains 30 questions, 20 minutes, and at most 3 errors', () => {
  assert.match(index, /id="startStandardExam"/u);
  assert.match(app, /startQuiz\('exam',questions\)/u);
  assert.match(app, /30/u);
  assert.match(app, /20/u);
  assert.match(app, /wrong<=3/u);
});

test('lesson screen keeps its bilingual vocabulary and sentence-level translation hooks', () => {
  assert.match(app, /function lessonDetailPage/u);
  assert.match(app, /function vocabularyMarkup/u);
  assert.match(app, /data-sentence-translate/u);
  assert.match(app, /data-sentence-tap/u);
  assert.match(app, /inline-sentence-translation/u);
});

test('v51 keeps the floating player and uses Web Speech without bundled TTS', () => {
  const audioCss = read('src/v40-audio.css');
  const speech = read('src/speech.mjs');
  const mainActivity = read('android/app/src/main/java/it/patenteb/sideload/v29/MainActivity.java');
  const gradle = read('android/app/build.gradle');
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(index, /data-audio-backend="web-speech"/u);
  assert.match(index, /id="speechPlaybackBar"/u);
  assert.match(index, /id="translationTooltipAudio"/u);
  assert.match(app, /createSpeechController\(\{getRate:/u);
  assert.ok(app.includes("ITALIAN_TTS_LOCALE} from './speech.mjs'"));
  assert.doesNotMatch(`${app}\n${speech}`, /ARABIC_TTS_LOCALE|data-tts-locale=.*ARABIC/u);
  assert.match(app, /speak\(lessonItalianAudio\.dataset\.ttsText\|\|''/u);
  assert.doesNotMatch(`${app}\n${speech}`, /playItalianAudio|isAudioUnlocked/u);
  assert.match(speech, /speechSynthesis|SpeechSynthesisUtterance/u);
  assert.doesNotMatch(`${app}\n${speech}\n${mainActivity}\n${gradle}\n${manifest}`, /Piper|piperAlpha|nativeTts|ONNX/u);
  assert.match(mainActivity, /registerPlugin\(RewardedAdsPlugin\.class\)/u);
  assert.match(audioCss, /\.speech-playback-bar/u);
});

test('lesson renders accessible topic-specific 2D visuals and keeps explanatory text stages', () => {
  const animation = read('src/lesson-animation.mjs');
  assert.match(animation, /\$\{sceneSvg\(type\)\}/u);
  assert.match(animation, /role="img" aria-label="\$\{escapeHtml\(sceneDescription\)\}"/u);
  assert.match(animation, /data-explainer-step/u);
  assert.match(animation, /sceneDescription=/u);
  assert.doesNotMatch(animation, /lesson-animation-unavailable|تم تعطيل الرسم المسطّح الحالي|رُفع الرسم المسطّح القديم مؤقتًا/u);
});

test('the unified v50 dark palette keeps readable lesson copy and mobile sizing', () => {
  const dark = read('src/theme-dark.css');
  const responsive = read('src/rebuild.css');
  const updated = read('src/v50-contrast.css');
  assert.match(dark, /data-theme="dark"/u);
  assert.match(dark, /prefers-color-scheme: dark/u);
  assert.match(updated, /--v50-surface: #142733/u);
  assert.match(updated, /--v50-text: #c8e5ea/u);
  assert.match(responsive, /@media\(max-width:650px\)/u);
  assert.match(updated, /lesson-animation-svg/u);
});

test('local debug build still avoids real Firebase sign-in credentials', () => {
  const config = json('android/app/google-services.json');
  assert.match(JSON.stringify(config), /REPLACE_WITH_FIREBASE|PLACEHOLDER|YOUR_/iu);
  assert.match(read('src/app.js'), /Firebase.*not configured|placeholder|not available/iu);
});

test('Android sample ads and the Firebase placeholder are retained', () => {
  const native = read('android/app/src/main/AndroidManifest.xml');
  assert.match(native, /ca-app-pub-3940256099942544/iu);
  assert.match(JSON.stringify(json('android/app/google-services.json')), /REPLACE_WITH_FIREBASE|PLACEHOLDER|YOUR_/iu);
});

test('app shell retains translation, legal, and driving-safety disclaimers', () => {
  assert.match(course.disclaimer_ar, /تعليمي/u);
  assert.match(index, /Le spiegazioni e le traduzioni sono materiali didattici non ufficiali/u);
  assert.match(index, /افهم القاعدة أولًا، ثم قد بأمان/u);
});

test('offline cache includes local lessons, questions, dictionary, and v50 stylesheets', () => {
  const startup = read('src/startup.mjs');
  const serviceWorker = read('public/sw.js');
  assert.match(startup, /questions\.json/u);
  assert.match(startup, /lessons\.json/u);
  assert.match(startup, /lesson-support\.json/u);
  assert.match(serviceWorker, /CACHE_OFFLINE_CONTENT/u);
  assert.match(serviceWorker, /lessons\.json/u);
  assert.match(serviceWorker, /lesson-support\.json/u);
  assert.match(serviceWorker, /refactor-v38\.css/u);
  assert.match(serviceWorker, /v40-audio\.css/u);
  assert.match(serviceWorker, /v50-contrast\.css/u);
  assert.match(serviceWorker, /v52-dark-overhaul\.css/u);
  assert.match(serviceWorker, /italian_arabic_dictionary_lookup\.json/u);
  assert.match(read('scripts/build-pwa.cjs'), /italian_arabic_dictionary_lookup\.json/u);
  assert.match(serviceWorker, /patente-ar-v58-learning-path/u);
  assert.match(index, /data-app-version="58"/u);
});

test('v58 home contains the vertical 50-lesson learning path and no legacy dashboard sections', () => {
  const home = app.slice(app.indexOf('function homePage(){'), app.indexOf('function lessonDetailPage('));
  assert.match(home, /lesson-path-shell/u);
  assert.match(home, /<ol class="lesson-path">/u);
  assert.match(home, /data-open-lesson=/u);
  assert.match(home, /quick-error-review-button/u);
  assert.doesNotMatch(home, /course-progress|dashboard-tool|study-stats|session-row|daily-goal-card|course-catalog|data-search/u);
  assert.doesNotMatch(app, /function dailyGoalMarkup\(|function quickStudyGuideMarkup\(|function officialSyllabusMarkup\(|function studyInsightsMarkup\(|function recentExamReadinessMarkup\(/u);
  assert.match(read('src/v57-learning-path.css'), /\.lesson-path\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/u);
});

test('Glossary controls fit the single-column mobile layout', () => {
  const css = read('src/theme-dark.css');
  assert.match(css, /\.glossary-controls \{ grid-template-columns: minmax\(0, 1fr\); \}/u);
  assert.match(css, /\.glossary-controls > label \{ min-width: 0; \}/u);
});

test('Android build script remains debug-only and uses v58 metadata', () => {
  const build = read('scripts/build-android.sh');
  const gradleCommand = build.match(/^\.\/gradlew .*$/mu)?.[0] || '';
  assert.match(gradleCommand, /\bclean\b/u);
  assert.match(gradleCommand, /:app:assembleDebug/u);
  assert.match(gradleCommand, /:app:testDebugUnitTest/u);
  assert.doesNotMatch(gradleCommand, /assembleRelease|bundleRelease|publish|upload/iu);
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /versionCode\s+58/u);
  assert.match(gradle, /versionName\s+"58\.0\.0"/u);
  assert.match(gradle, /abiFilters\s+'arm64-v8a',\s*'armeabi-v7a'/u);
  assert.match(read('android/variables.gradle'), /minSdkVersion\s*=\s*24/u);
  assert.equal(json('package.json').version, '58.0.0');
  assert.equal(json('package-lock.json').packages[''].version, '58.0.0');
  assert.equal(json('public/release.json').version, 58);
});
