const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const OFFICIAL_HOSTS = new Set(['aci.gov.it','www.aci.it','aci.it','www.normattiva.it','normattiva.it','www.mit.gov.it','mit.gov.it','www.gazzettaufficiale.it','gazzettaufficiale.it']);
function sourceLink(url, article, pair) {
  try {
    const target = new URL(String(url));
    if (target.protocol !== 'https:' || !OFFICIAL_HOSTS.has(target.hostname.toLowerCase())) return '';
    return `<a class="reference-source-link" href="${esc(target.href)}" target="_blank" rel="noopener noreferrer">${pair(article ? `Fonte ufficiale · ${article}` : 'Fonte ufficiale','المصدر الرسمي'+(article?` · ${article}`:''))}</a>`;
  } catch { return ''; }
}
function header(titleIt,titleAr,descriptionIt,descriptionAr,count,pair){
  return `<header class="page-heading reference-heading"><div>${pair('STRUMENTI DI RIPASSO','أدوات المراجعة','eyebrow-pair')}<h1>${pair(titleIt,titleAr)}</h1><p>${pair(descriptionIt,descriptionAr)}</p><span class="reference-count">${pair(`${count} voci verificate per il ripasso`,`${Number(count).toLocaleString('ar')} عنصرًا للمراجعة`)}</span></div></header>`;
}
function searchBox(pair){
  return `<label class="reference-search"><span>${pair('Cerca in italiano o arabo','ابحث بالإيطالية أو العربية')}</span><input id="referenceSearch" type="search" autocomplete="off" placeholder="Italiano · العربية" aria-label="Search reference entries in Italian or Arabic · ابحث في عناصر المرجع بالإيطالية أو العربية"></label><p id="referenceSearchStatus" class="reference-search-status" role="status" aria-live="polite"></p>`;
}
function trapCard(item,pair){
  const source=item.legal_reference||{};
  return `<article class="reference-card trap-reference-entry" data-reference-entry data-reference-search="${esc(`${item.term_it} ${item.meaning_ar} ${item.why_it} ${item.why_ar} ${item.example_it} ${item.example_ar}`)}"><h2 lang="it" dir="ltr">${esc(item.term_it)}</h2><p class="reference-translation" lang="ar" dir="rtl">${esc(item.meaning_ar)}</p><section><h3>${pair('Perché può cambiare il senso','كيف قد تغيّر الكلمة معنى العبارة')}</h3><div>${pair(item.why_it,item.why_ar)}</div></section><section><h3>${pair('Esempio corretto','مثال صحيح')}</h3><div>${pair(item.example_it,item.example_ar)}</div></section>${sourceLink(source.url,source.article,pair)}</article>`;
}
function numberCard(item,pair){
  return `<article class="reference-card number-reference-entry" data-reference-entry data-reference-search="${esc(`${item.value} ${item.category_it} ${item.category_ar} ${item.rule_it} ${item.rule_ar}`)}"><h2 lang="it" dir="ltr">${esc(item.value)}</h2><p class="reference-category">${pair(item.category_it,item.category_ar)}</p><div class="reference-rule">${pair(item.rule_it,item.rule_ar)}</div>${sourceLink(item.url,item.article,pair)}</article>`;
}
function comparisonCard(item,pair){
  return `<article class="reference-card comparison-reference-entry" data-reference-entry data-reference-search="${esc(`${item.term_a_it} ${item.term_a_ar} ${item.term_b_it} ${item.term_b_ar} ${item.difference_it} ${item.difference_ar}`)}"><h2>${pair(`${item.term_a_it} · ${item.term_b_it}`,`${item.term_a_ar} · ${item.term_b_ar}`)}</h2><div class="reference-rule">${pair(item.difference_it,item.difference_ar)}</div><section><h3>${pair('Esempio','مثال')}</h3><div>${pair(item.example_it,item.example_ar)}</div></section>${sourceLink(item.url,item.article,pair)}</article>`;
}
export function renderReferencePage(kind,data,{pair}={}){
  if(typeof pair!=='function') throw new TypeError('pair() renderer is required');
  const config={
    traps:{key:'traps',titleIt:'Parole che cambiano il quesito',titleAr:'كلمات قد تغيّر إجابة السؤال',descIt:'20 parole e qualificatori da leggere con attenzione; non rendono automaticamente falsa una frase.',descAr:'20 كلمة وقيدًا تستحق الانتباه؛ وجود كلمة مطلقة لا يجعل العبارة خاطئة تلقائيًا.',render:trapCard},
    numbers:{key:'numbers',titleIt:'Numeri da ricordare',titleAr:'أرقام مهمّة للمذاكرة',descIt:'Valori e condizioni verificati nelle fonti ufficiali indicate, con i relativi ambiti e le eccezioni.',descAr:'قيم وشروط مرتبطة بنطاق تطبيقها واستثناءاتها، مع الإحالة إلى المصادر الرسمية المفتوحة.',render:numberCard},
    comparisons:{key:'comparisons',titleIt:'Concetti da non confondere',titleAr:'مفاهيم لا تخلط بينها',descIt:'15 coppie di termini con la distinzione pratica e un esempio bilingue.',descAr:'15 زوجًا من المصطلحات مع الفرق العملي ومثال باللغتين.',render:comparisonCard}
  };
  const page=config[kind];
  if(!page) throw new RangeError(`Unknown reference page: ${kind}`);
  const entries=Array.isArray(data?.[page.key])?data[page.key]:[];
  const cards=entries.map(item=>page.render(item,pair)).join('');
  return `<section class="reference-page" data-reference-page="${esc(kind)}">${header(page.titleIt,page.titleAr,page.descIt,page.descAr,entries.length,pair)}${searchBox(pair)}<div class="reference-card-list" id="referenceList">${cards||`<div class="empty-state">${pair('Verified reference entries will appear here.','ستظهر هنا عناصر المرجع بعد التحقق منها.')}</div>`}</div><aside class="notice-banner reference-disclaimer">${pair('Educational summaries only; consult the linked current law and official driving-school guidance before relying on a rule.','هذه خلاصات تعليمية؛ راجع النص القانوني النافذ وإرشادات مدرسة القيادة عبر المصادر المرتبطة قبل الاعتماد على أي قاعدة.')}</aside></section>`;
}
