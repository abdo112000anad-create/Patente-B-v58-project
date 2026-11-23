const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pair = (it,ar) => `<span class="language-pair lesson-pair"><span class="pair-it" lang="it" dir="ltr">${esc(it)}</span><span class="pair-ar" lang="ar" dir="rtl">${esc(ar)}</span></span>`;

function pointCards(items=[],italianWordMarkup=esc){
  const cards=items.map(item=>`<article class="lesson-key-point-card key-point-card"><div class="lesson-key-point-title" role="heading" aria-level="3"><div class="kp-it" lang="it" dir="ltr">${italianWordMarkup(item.it)}</div><div class="kp-ar" lang="ar" dir="rtl">${esc(item.ar)}</div></div></article>`).join('');
  return `<section class="lesson-key-points" data-lesson-section="points"><h2>${pair('Punti importanti','النقاط الأساسية')}</h2><div class="lesson-key-point-list key-points-list key-points-grid">${cards}</div></section>`;
}

export function renderLessonSections(lesson,visualMarkup='',options={}){
  const italianWordMarkup=typeof options.italianWordMarkup==='function'?options.italianWordMarkup:esc;
  const trapMarkup=String(options.trapMarkup||'');
  const quickCheckMarkup=String(options.quickCheckMarkup||'');
  const summary=`<section class="lesson-content-block" data-lesson-section="summary"><h2>${pair('Sintesi della lezione','خلاصة الدرس')}</h2><div class="lesson-summary-card"><div class="lesson-it-text" lang="it" dir="ltr">${italianWordMarkup(lesson.summaryIt)}</div><div class="lesson-ar-full" lang="ar" dir="rtl">${esc(lesson.summaryAr)}</div></div></section>`;
  return `${summary}${pointCards(lesson.keyPoints||[],italianWordMarkup)}${trapMarkup}${visualMarkup}${quickCheckMarkup}`;
}
