function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

const EXPLICIT_VISUAL_WORDING = /\b(?:figura\b|raffigur\w*\b|immagine\b|disegn\w*\b|illustrat\w*\b)/iu;
const NON_VISUAL_FIGURA = /\bnella patente figura\b/iu;

export function hasQuestionVisualReference(question = {}) {
  const italian = String(question.it ?? '');
  return Boolean(question.hasFigureRef) || (EXPLICIT_VISUAL_WORDING.test(italian) && !NON_VISUAL_FIGURA.test(italian));
}

function unavailableNote(question) {
  const id = escapeHtml(question.id ?? '');
  const page = Number(question.page);
  const pageIt = Number.isFinite(page) ? ` (PDF p. ${page})` : '';
  const pageAr = Number.isFinite(page) ? ` (صفحة ${page.toLocaleString('ar')})` : '';
  return `<aside class="question-figure-unavailable" data-figure-fallback role="note"><span lang="it" dir="ltr">This question record is marked as having a related figure, but no local image is available${pageIt}. Check the original source before answering.</span><span lang="ar" dir="rtl">سجل هذا السؤال معلّم بوجود شكل مرتبط، لكن لا تتوفر له صورة محلية في التطبيق${pageAr}. راجع المصدر الأصلي قبل الإجابة.</span><small>Quiz #${id}</small></aside>`;
}

export function questionFigureMarkup(question = {}) {
  const image = String(question.image ?? '').trim();
  const id = escapeHtml(question.id ?? '');
  const fallback = unavailableNote(question);
  if (image) {
    return `<figure class="question-figure"><img class="question-figure-img" data-question-figure data-question-id="${id}" src="${escapeHtml(image)}" alt="Illustration for quiz question #${id}" loading="lazy" decoding="async"><figcaption><span lang="it" dir="ltr">Figure for quiz #${id}</span><span lang="ar" dir="rtl">رسم السؤال #${id}</span></figcaption>${fallback.replace('<aside ', '<aside hidden ')}</figure>`;
  }
  if (hasQuestionVisualReference(question)) return fallback;
  return '';
}
