const ARABIC_MARKS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const LATIN_DIGITS = '0123456789';
const SEARCH_STOP_WORDS = new Set([
  'a', 'ad', 'al', 'and', 'of', 'the', 'what', 'explain', 'rule', 'general', 'اشرح', 'alla', 'alle', 'anche', 'che', 'come', 'con', 'da', 'dalla', 'della',
  'del', 'di', 'e', 'gli', 'i', 'il', 'in', 'la', 'le', 'lo', 'ma', 'mi', 'nel', 'nella',
  'o', 'per', 'qual', 'quale', 'questo', 'regola', 'spiega', 'spiegami', 'su', 'un', 'una',
  'في', 'من', 'على', 'عن', 'إلى', 'الى', 'ما', 'كيف', 'هل', 'هو', 'هي', 'و', 'أو', 'او', 'قاعدة'
]);

export function normalizeSearchText(value = '') {
  return String(value ?? '')
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(ARABIC_MARKS, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩۰-۹]/g, digit => {
      const code = digit.charCodeAt(0);
      return code >= 0x06f0 ? LATIN_DIGITS[code - 0x06f0] : LATIN_DIGITS[code - 0x0660];
    })
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(token => /\p{Script=Arabic}/u.test(token) && token.startsWith('ال') && token.length > 4 ? token.slice(2) : token)
    .join(' ');
}

export function matchesSearchText(value, query) {
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  const haystack = normalizeSearchText(value);
  if (haystack.includes(needle)) return true;
  const allTerms = needle.split(' ').filter(term => term.length > 1);
  const meaningful = allTerms.filter(term => !SEARCH_STOP_WORDS.has(term));
  const terms = meaningful.length ? meaningful : allTerms;
  if (!terms.length) return false;
  const haystackTokens = new Set(haystack.split(' '));
  const matched = terms.filter(term => haystackTokens.has(term)).length;
  const required = terms.length === 1 ? 1 : Math.max(2, Math.ceil(terms.length * 0.75));
  return matched >= required;
}

export function findRelevantQuestions(questions, query, limit = 4) {
  const needle = normalizeSearchText(query);
  if (!needle || !Array.isArray(questions)) return [];
  const tokens = needle.split(' ').filter(token => token.length > 1 && !SEARCH_STOP_WORDS.has(token));
  const searchableTokens = tokens.length ? tokens : needle.split(' ').filter(token => token.length > 1);
  if (!searchableTokens.length) return [];

  return questions.map(question => {
    const fields = [String(question.id ?? ''), question.it ?? '', question.ar ?? '', question.topic ?? '']
      .map(normalizeSearchText);
    const matched = searchableTokens.filter(token => fields.some(field => field.includes(token)));
    if (!matched.length) return null;
    const phrase = fields.some(field => field.includes(needle));
    const idExact = normalizeSearchText(question.id) === needle;
    return {question, score: matched.length * 5 + (phrase ? 12 : 0) + (idExact ? 100 : 0)};
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || Number(a.question.id) - Number(b.question.id))
    .slice(0, Math.max(1, Math.min(10, Number(limit) || 4)))
    .map(item => item.question);
}
