'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));

test('v49 app dictionary contains auditable rows and excludes isolated letter artifacts', () => {
  const dictionary = json('data/italian_arabic_dictionary_lookup.json');
  const questions = json('data/questions.json');
  assert.equal(dictionary.schema_version, 1);
  assert.equal(dictionary.metadata.source_question_count, questions.questions.length);
  assert.equal(dictionary.metadata.app_release, 54);
  assert.equal(dictionary.metadata.unique_question_bank_terms, 5276);
  assert.equal(dictionary.metadata.total_entries, 5281);
  assert.equal(dictionary.entries.length, 5281);
  assert.equal(new Set(dictionary.entries.map(row => row.word)).size, dictionary.entries.length);
  for (const row of dictionary.entries) {
    assert.ok(row.word);
    assert.ok(row.source);
    assert.ok(row.provider);
    assert.ok(['reviewed_override', 'legacy_glossary_needs_review', 'machine_draft_needs_review', 'contextual_override_v49'].includes(row.status));
    assert.ok(row.confidence === null || Number.isFinite(row.confidence));
    assert.ok(row.review_required === 0 || row.review_required === 1);
  }
  assert.equal(dictionary.metadata.counts_by_status.contextual_override_v49, 9);
});

test('existing and Abdul-approved v42 corrections plus the v47 lemma are reviewed; model drafts need review', () => {
  const dictionary = json('data/italian_arabic_dictionary_lookup.json');
  const byWord = new Map(dictionary.entries.map(row => [row.word, row]));
  for (const [word, arabic] of [
    ['corsia', 'حارة سير'],
    ['carreggiata', 'الطريق المخصص للمركبات'],
    ['prudenza', 'حذر'],
  ]) {
    const row = byWord.get(word);
    assert.equal(row.translation_ar, arabic);
    assert.equal(row.status, 'reviewed_override');
    assert.equal(row.review_required, 0);
    assert.equal(row.provider, 'owner-approved-override');
    assert.equal(row.confidence, null);
  }
  const corrected = {
    diano: 'لاحقة بمعنى (يومي) - جزء من كلمة وليست كلمة مستقلة',
    diciannove: 'تسعة عشر (19)',
    gpl: 'غاز البترول المسال (GPL)',
    hashish: 'حشيش (مادة مخدرة)',
    i: 'أداة تعريف للجمع المذكر',
    imposti: 'مفروضة / مقررة',
    kg: 'كيلوغرام (كجم)',
    planoaltimetrico: 'مخطط الطريق (المسقط الأفقي والارتفاعي)',
    sedici: 'ستة عشر (16)',
  };
  for (const [word, arabic] of Object.entries(corrected)) {
    const row = byWord.get(word);
    assert.equal(row.translation_ar, arabic);
    assert.equal(row.status, 'reviewed_override');
    assert.equal(row.review_required, 0);
    assert.equal(row.provider, 'Abdul');
    assert.equal(row.source, 'owner-approved-correction-v42');
  }
  const requestedLemma = byWord.get('riconoscere');
  assert.equal(requestedLemma.translation_ar, 'يتعرف على');
  assert.equal(requestedLemma.source, 'user-requested-lemma-v47');
  assert.equal(requestedLemma.status, 'reviewed_override');
  assert.equal(requestedLemma.review_required, 0);
  const spellingLemma = byWord.get('spiegazione');
  assert.equal(spellingLemma.translation_ar, 'شرح / تفسير');
  assert.equal(spellingLemma.source, 'user-requested-lemma-v51');
  assert.equal(spellingLemma.status, 'reviewed_override');
  assert.equal(spellingLemma.review_required, 0);
  assert.match(byWord.get('diano').note, /ليست كلمة إيطالية مستقلة/u);
  for (const artifact of ['b', 'f', 'g', 'h', 'p', 'v', 'x']) assert.equal(byWord.has(artifact), false);
  for (const row of dictionary.entries.filter(row => row.status === 'machine_draft_needs_review')) {
    assert.equal(row.review_required, 1);
    assert.equal(row.confidence, null);
    assert.equal(row.provider, 'opus-mt-local');
  }
});

test('v49 contextual lookups cover earlier video terms and show their context note', async () => {
  const dictionary = json('data/italian_arabic_dictionary_lookup.json');
  const translation = await import(path.join(root, 'src/lesson-translation.mjs'));
  translation.setGeneratedDictionary(dictionary.entries);
  const expected = {
    seguite: 'مُتَّبَعة', tra: 'بين', degli: 'مِنَ الـ / لِـ', essere: 'أن يكون / يكون',
    prevalgono: 'تتقدّم على', senza: 'دون / بدون', questa: 'هذه', sottocategoria: 'فئة فرعية',
    segnaletica: 'الإشارات المرورية',
  };
  for (const [word, arabic] of Object.entries(expected)) {
    const result = translation.translateTappedWord(word, []);
    assert.equal(result.arabic, arabic, word);
    assert.equal(result.status, 'contextual_override_v49', word);
    assert.match(result.note, /سياق|سياقي|تركيب/u, word);
  }
});

test('compact lookup asset is in the offline PWA and its release hash matches', () => {
  const sw = read('public/sw.js');
  const build = read('scripts/build-pwa.cjs');
  const release = json('public/release.json');
  const sourcePath = path.join(root, 'data/italian_arabic_dictionary_lookup.json');
  const assetHash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
  assert.match(sw, /'\/data\/italian_arabic_dictionary_lookup\.json'/u);
  assert.match(sw, /validJsonPayload\('\/data\/italian_arabic_dictionary_lookup\.json'/u);
  assert.match(build, /'italian_arabic_dictionary_lookup\.json'/u);
  assert.equal(release.dictionarySha256, assetHash);
  const distPath = path.join(root, 'dist/data/italian_arabic_dictionary_lookup.json');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(distPath)).digest('hex'), assetHash);
});

test('local word-lookup loader serves a single isolated word and never presents model output as reviewed', async () => {
  const dictionary = json('data/italian_arabic_dictionary_lookup.json');
  const translation = await import(path.join(root, 'src/lesson-translation.mjs'));
  const loaded = await translation.loadLocalWordDictionary('/data/italian_arabic_dictionary_lookup.json', async url => ({
  ok: url === '/data/italian_arabic_dictionary_lookup.json',
  json: async () => dictionary,
}));
  assert.equal(loaded, 5281);
  assert.equal(translation.wordAtOffset('La corsia è libera.', 4), 'corsia');
  const approved = translation.translateTappedWord('corsia', []);
  assert.equal(approved.word, 'corsia');
  assert.equal(approved.arabic, 'حارة سير');
  assert.equal(approved.status, 'reviewed_override');
  const machineWord = dictionary.entries.find(row => row.status === 'machine_draft_needs_review');
  assert.ok(machineWord);
  const draft = translation.translateTappedWord(machineWord.word, []);
  assert.equal(draft.word, machineWord.word);
  assert.equal(draft.status, 'machine_draft_needs_review');
  assert.match(draft.note, /مسودة ترجمة آلية غير مراجعة/u);
  assert.equal(draft.confidence, null);
});
