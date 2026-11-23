import {normalizeSearchText} from './search.mjs';

let generatedDictionary = new Map();
let dictionaryLoadPromise = null;

function normalizeDictionaryWord(value = '') {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('it')
    .replace(/[’`]/g, "'")
    .replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, '');
}

export function setGeneratedDictionary(entries = []) {
  const next = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const word = String(entry?.word || '').trim();
    const key = normalizeDictionaryWord(word);
    if (key) next.set(key, {...entry, word});
  }
  generatedDictionary = next;
  return next.size;
}

export async function loadLocalWordDictionary(
  url = '/data/italian_arabic_dictionary_lookup.json', fetcher = globalThis.fetch
) {
  if (generatedDictionary.size) return generatedDictionary.size;
  if (dictionaryLoadPromise) return dictionaryLoadPromise;
  dictionaryLoadPromise = (async () => {
    try {
      if (typeof fetcher !== 'function') return 0;
      const response = await fetcher(url, {cache: 'force-cache'});
      if (!response?.ok) { dictionaryLoadPromise = null; return 0; }
      const payload = await response.json();
      if (payload?.schema_version !== 1 || !Array.isArray(payload.entries)) { dictionaryLoadPromise = null; return 0; }
      return setGeneratedDictionary(payload.entries);
    } catch {
      dictionaryLoadPromise = null;
      return 0;
    }
  })();
  return dictionaryLoadPromise;
}

function lexicalTerms(text = '') {
  return [...String(text).matchAll(/[\p{L}\p{M}]+(?:[’'`][\p{L}\p{M}]+)*/gu)].map(match => ({
    text: match[0], start: match.index, end: match.index + match[0].length
  }));
}

export function wordAtOffset(text = '', offset = 0) {
  const value = String(text);
  const position = Math.max(0, Math.min(value.length, Number(offset) || 0));
  const words = lexicalTerms(value);
  return words.find(word => position >= word.start && position <= word.end)?.text || '';
}

const ATTACHED_PRONOUN_SUFFIXES = Object.freeze(['le', 'lo', 'la', 'ne', 'ci', 'vi', 'li']);

function lookupExactOfflineWord(selected, entries = []) {
  const needle = normalizeDictionaryWord(selected);
  const searchNeedle = normalizeSearchText(selected);
  if (!needle || !searchNeedle) return null;
  const generated = generatedDictionary.get(needle);
  if (generated?.translation_ar) {
    return {
      word: String(selected), italian: generated.word, arabic: String(generated.translation_ar),
      note: generated.note || '', category: generated.category || '',
      source: generated.source || generated.provider || 'local machine dictionary',
      status: generated.status || 'machine_translation_unreviewed',
      confidence: generated.confidence ?? null, uiFallback: generated.ui_fallback_ar || '', hasLexicalTranslation: true,
    };
  }
  const entry = (Array.isArray(entries) ? entries : []).find(item => normalizeSearchText(item?.it || '') === searchNeedle);
  if (entry) return {word: String(selected), italian: entry.it, arabic: entry.ar, note: entry.note || '', category: entry.category || '', source: 'glossary', status: 'legacy_glossary_needs_review', confidence: null};
  return generated ? {
    word: String(selected), italian: generated.word, arabic: '', note: generated.note || '',
    category: '', source: generated.source || generated.provider || 'local machine dictionary',
    status: generated.status || 'needs_translation', confidence: generated.confidence ?? null,
    uiFallback: generated.ui_fallback_ar || '', hasLexicalTranslation: false,
  } : null;
}

export function lookupOfflineWord(word = '', entries = []) {
  const selected = String(word).trim().replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, '');
  const exact = lookupExactOfflineWord(selected, entries);
  if (exact) return exact;

  const needle = normalizeDictionaryWord(selected);
  for (const suffix of ATTACHED_PRONOUN_SUFFIXES) {
    if (!needle.endsWith(suffix) || needle.length <= suffix.length + 3) continue;
    const base = needle.slice(0, -suffix.length);
    const directBase = lookupExactOfflineWord(base, entries);
    if (directBase) return directBase;

    // Italian infinitives commonly drop their final "e" before an attached pronoun
    // (e.g. riconoscere + lo -> riconoscerlo). Accept only an existing lemma.
    if (base.endsWith('r')) {
      const infinitive = lookupExactOfflineWord(`${base}e`, entries);
      if (infinitive) return infinitive;
    }
  }
  return null;
}

export function translateTappedWord(word = '', entries = []) {
  const selected = String(word).trim().replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, '');
  const match = lookupOfflineWord(selected, entries);
  const status = match?.status || 'missing';
  const fallbackNote = status === 'machine_draft_needs_review'
    ? 'مسودة ترجمة آلية غير مراجعة؛ قد يختلف المعنى بحسب السياق.'
    : status === 'legacy_glossary_needs_review'
      ? 'مدخل من القاموس المحلي يحتاج إلى مراجعة.'
      : status === 'contextual_override_v49'
        ? 'مقابل سياقي أُضيف في v49؛ قد يتغير مع تركيب الجملة.'
        : status === 'reviewed_override'
        ? 'مدخل معجمي معتمد.'
        : 'لم يُسجَّل مقابل عربي مفرد لهذه الكلمة؛ لا تُنسب ترجمة الجملة إليها.';
  return {
    word: selected, italian: match?.italian || selected, arabic: match?.arabic || match?.uiFallback || '',
    note: match?.note || fallbackNote, source: match?.source || 'missing', status,
    confidence: match?.confidence ?? null, hasLexicalTranslation: !!match?.arabic, uiFallback: match?.uiFallback || '',
  };
}

function sentenceRanges(text = '') {
  const value = String(text).trim();
  if (!value) return [];
  const ranges = [];
  const closing = new Set(['»', '”', '’', '"', "'", ')', ']', '}']);
  let start = 0;
  for (let index = 0; index < value.length; index++) {
    if (!'.!?؟。'.includes(value[index])) continue;
    let end = index + 1;
    while (end < value.length && closing.has(value[end])) end++;
    if (end === value.length || /\s/u.test(value[end])) {
      const left = value.slice(start, end).search(/\S/u);
      const right = value.slice(start, end).replace(/\s+$/u, '').length;
      if (left >= 0 && right > left) ranges.push({start: start + left, end: start + right, text: value.slice(start + left, start + right)});
      while (end < value.length && /\s/u.test(value[end])) end++;
      start = end;
      index = end - 1;
    }
  }
  const tail = value.slice(start);
  const left = tail.search(/\S/u);
  if (left >= 0) ranges.push({start: start + left, end: value.length, text: tail.slice(left).trim()});
  return ranges;
}

export function splitSentences(text = '') {
  return sentenceRanges(text).map(item => item.text);
}

export function translateLessonSentence(italianText = '', arabicText = '', offset = 0) {
  const italian = String(italianText).trim();
  const arabic = String(arabicText).trim();
  const italianParts = sentenceRanges(italian);
  const arabicParts = splitSentences(arabic);
  const position = Math.max(0, Math.min(italian.length, Number(offset) || 0));
  const selectedIndex = Math.max(0, italianParts.findIndex(part => position <= part.end));

  if (italianParts.length > 1 && italianParts.length === arabicParts.length) {
    return {source: italianParts[selectedIndex]?.text || italian, translation: arabicParts[selectedIndex] || arabic,
      alignment: 'sentence', note: 'ترجمة الجملة المقابلة من نص الدرس المحلي.'};
  }
  return {source: italian, translation: arabic, alignment: 'paragraph',
    note: 'تعذرت مطابقة الجمل تلقائيًا بأمان؛ عُرضت ترجمة الفقرة كاملة من نص الدرس المحلي.'};
}
