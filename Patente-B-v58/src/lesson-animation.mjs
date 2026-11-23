const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function resolveSceneType(lesson = {}, moduleId = '') {
  const explicitScene = lesson.visual_script?.scene_id;
  if (['trailer','visibility','roundabout','intersection','traffic-light','traffic-signs','maneuver','vehicle-safety','stopping','documents','driver-safety','road-parts'].includes(explicitScene)) return explicitScene;
  const title = `${lesson.heading_ar || ''} ${lesson.heading_it || ''}`.toLowerCase();
  if (/مقطور|rimorch|rimorchio/.test(title)) return 'trailer';
  if (/أعمى|النقاط العمياء|مجال الرؤية|visibilità|angoli ciechi|campo visivo/.test(title)) return 'visibility';
  if (/دوّار|دوار|دوارات|rotatoria|rotonda|circonvallazione/.test(title)) return 'roundabout';
  if (/تقاطع|الأولوية|incroc|precedenza|stop/.test(title)) return 'intersection';
  if (/إشارة|إشارات|علامات|segnal|cartell/.test(title)) return /ضوئي|الضوء|luminos|semafor/.test(title) ? 'traffic-light' : 'traffic-signs';
  if (/تجاوز|تغيير المسار|انعطاف|corsia|sorpass|svolta|cambio di corsia/.test(title)) return 'maneuver';
  if (/المركبة|المركبات|veicolo|veicoli/.test(title)) return 'vehicle-safety';
  if (/سرع|توقف|مسافة|خطر|عائق|fermata|sosta|arresto|velocità|distanza|ostac/.test(title)) return 'stopping';
  if (/وثائق|رخص|تأمين|مسؤولية|عقوب|document|patente|assicur|responsabilità/.test(title)) return 'documents';
  if (/حزام|طفل|خوذ|أضواء|صيانة|سلامة المركبة|cintura|seggiolino|casco|luci|manutenzione/.test(title)) return 'vehicle-safety';
  if (/طريق وأجزاؤه|strada e le sue parti/.test(title)) return 'road-parts';
  if (/سائق|حالة|حادث|إسعاف|بيئ|انتباه|استجابة|راكب|انزلاق|سكة|cantiere|incidente|primo soccorso|attenzione|reazione|utenti|aderenza|scivolos|galleria|carico|passegger|controlli/.test(title)) return 'driver-safety';
  const byModule = {
    'road-basics': 'road-parts',
    'signs': 'traffic-signs',
    'signals-markings': 'traffic-light',
    'priority-intersections': 'intersection',
    'movement-overtaking': 'maneuver',
    'speed-stopping-highways': 'stopping',
    'vehicle-safety': 'vehicle-safety',
    'documents-liability': 'documents',
    'driver-health-environment': 'driver-safety',
    'exam-supplement-driver': 'visibility',
    'exam-supplement-vehicle': 'vehicle-safety'
  };
  return byModule[moduleId] || 'road-parts';
}

const car = (x = 110, y = 125, className = 'scene-car') => `<g class="${className}" transform="translate(${x} ${y})" aria-hidden="true"><rect x="0" y="7" width="86" height="32" rx="13" fill="#2edbc0" stroke="#092a32" stroke-width="3"/><path d="M18 8 29-5h28L68 8" fill="#55bff0" stroke="#092a32" stroke-width="3"/><circle cx="19" cy="40" r="7" fill="#092a32"/><circle cx="67" cy="40" r="7" fill="#092a32"/><path d="M22 12h40" stroke="#73d9e1" stroke-width="2"/></g>`;
const road = `<rect x="0" y="116" width="640" height="70" rx="8" fill="#275364"/><path d="M0 151h640" stroke="#73d9e1" stroke-width="3" stroke-dasharray="24 18"/><path d="M0 120h640M0 182h640" stroke="#73d9e1" stroke-width="2" opacity=".7"/>`;
const badge = (label, x, y, className = 'focus-concept') => `<g class="${className}" transform="translate(${x} ${y})"><rect width="112" height="44" rx="12" fill="#193543" stroke="#3d7180" stroke-width="2"/><circle cx="22" cy="22" r="9" fill="#2edbc0"/><path d="M18 22h8M22 18v8" stroke="#092a32" stroke-width="2"/><text x="40" y="27" font-size="12" font-family="system-ui,sans-serif" fill="#c8e5ea">${label}</text></g>`;

function sceneSvg(type) {
  const sceneDescription={
    'road-parts':'رسم توضيحي لأجزاء الطريق', 'traffic-signs':'رسم توضيحي لإشارات المرور',
    'traffic-light':'رسم توضيحي للإشارة الضوئية', 'intersection':'رسم توضيحي لتقاطع الطرق والأولوية',
    'roundabout':'رسم توضيحي لحركة المرور في الدوار', 'maneuver':'رسم توضيحي لتغيير المسار والتجاوز',
    'stopping':'رسم توضيحي للتوقف ومسافة الأمان', 'vehicle-safety':'رسم توضيحي لسلامة المركبة',
    'documents':'رسم توضيحي لوثائق المركبة', 'driver-safety':'رسم توضيحي لسلامة السائق',
    'visibility':'رسم توضيحي لمجال الرؤية', 'trailer':'رسم توضيحي للمركبة والمقطورة'
  }[type] || 'رسم توضيحي مبسط للطريق والمركبات';
  const shared = `<svg class="lesson-animation-svg" viewBox="0 0 640 210" role="img" aria-label="${escapeHtml(sceneDescription)}"><rect width="640" height="210" rx="18" fill="#102936"/><circle cx="555" cy="41" r="21" fill="#2edbc0" opacity=".75"/>${road}`;
  const pieces = {
    'road-parts': `${badge('corsia',36,33)}${badge('carreggiata',184,33)}${badge('marciapiede',492,33)}<path d="M68 83v25M240 83v25M548 83v25" stroke="#092a32" stroke-dasharray="3 4"/>${car(120,128,'scene-car scene-car-road')}`,
    'traffic-signs': `<g class="focus-concept" transform="translate(84 30)"><path d="M35 2 69 60H1Z" fill="#73d9e1" stroke="#c8473d" stroke-width="8"/><path d="M28 45h14" stroke="#092a32" stroke-width="5"/></g><g class="focus-example" transform="translate(270 30)"><circle cx="34" cy="34" r="31" fill="#73d9e1" stroke="#c8473d" stroke-width="8"/><path d="M12 34h44" stroke="#c8473d" stroke-width="8"/></g><g class="focus-warning" transform="translate(455 30)"><circle cx="34" cy="34" r="31" fill="#2c6d9d"/><path d="M34 13v25M34 48v2" stroke="#73d9e1" stroke-width="6" stroke-linecap="round"/></g>${car(270,128,'scene-car scene-car-road')}`,
    'traffic-light': `<g class="focus-concept" transform="translate(78 18)"><rect x="0" y="0" width="49" height="111" rx="12" fill="#092a32"/><circle cx="24" cy="22" r="13" fill="#d84a43"/><circle cx="24" cy="56" r="13" fill="#2edbc0"/><circle cx="24" cy="89" r="13" fill="#43d9a2"/><path d="M24 111v17" stroke="#092a32" stroke-width="7"/></g><path class="focus-example" d="M135 149h430" stroke="#43d9a2" stroke-width="8" stroke-dasharray="20 12"/><path class="focus-warning" d="M135 149h70" stroke="#d84a43" stroke-width="8"/>${car(300,128,'scene-car scene-car-road')}`,
    'intersection': `<rect x="274" y="0" width="92" height="210" fill="#275364"/><path d="M0 151h640" stroke="#275364" stroke-width="70"/><path d="M320 0v70M320 190v20M0 151h205M435 151h205" stroke="#73d9e1" stroke-width="3" stroke-dasharray="20 16"/><g class="focus-concept" transform="translate(60 37)"><path d="M30 0 60 52H0Z" fill="#73d9e1" stroke="#c8473d" stroke-width="7"/><path d="M30 55v28" stroke="#092a32" stroke-width="4"/></g><path class="focus-example" d="M320 35v83h118" fill="none" stroke="#2edbc0" stroke-width="6" stroke-dasharray="10 7"/><path class="focus-warning" d="M250 151h-90" stroke="#2edbc0" stroke-width="6" stroke-dasharray="10 7"/>${car(390,128,'scene-car scene-car-cross')}`,
    'roundabout': `<path d="M320 0v68M320 190v20M0 140h244M396 140h244" stroke="#275364" stroke-width="49"/><circle cx="320" cy="140" r="76" fill="#275364" stroke="#73d9e1" stroke-width="3" stroke-dasharray="13 10"/><circle cx="320" cy="140" r="39" fill="#247b70" stroke="#73d9e1" stroke-width="3"/><path class="focus-example" d="M320 61a79 79 0 0 1 79 79" fill="none" stroke="#2edbc0" stroke-width="6" stroke-dasharray="10 7"/><path class="focus-concept" d="M320 10v43m0 0-10-11m10 11 10-11M618 140h-42m0 0 11-10m-11 10 11 10" stroke="#193543" stroke-width="4" fill="none"/><g class="scene-car-roundabout focus-warning" style="transform-origin:320px 140px"><g transform="translate(370 134) rotate(90)"><rect x="-14" y="-7" width="28" height="14" rx="5" fill="#2edbc0" stroke="#092a32" stroke-width="2"/><circle cx="-8" cy="8" r="2.5" fill="#092a32"/><circle cx="8" cy="8" r="2.5" fill="#092a32"/></g></g>${badge('rotatoria',36,29)}`,
    'maneuver': `<path class="focus-concept" d="M88 152h170" stroke="#2edbc0" stroke-width="7" stroke-dasharray="17 13"/><path class="focus-example" d="M168 141c35-65 92-65 142-8" fill="none" stroke="#43d9a2" stroke-width="6" stroke-dasharray="11 7"/><path class="focus-warning" d="M390 141c34-44 77-45 119-15" fill="none" stroke="#d84a43" stroke-width="6" stroke-dasharray="11 7"/><path d="m301 126 13 7-13 7" fill="#43d9a2"/>${car(110,128,'scene-car scene-car-maneuver')}${car(420,128,'scene-car scene-car-road')}`,
    'stopping': `<g class="focus-concept" transform="translate(56 31)"><circle cx="42" cy="42" r="34" fill="#193543" stroke="#092a32" stroke-width="5"/><path d="M42 42 62 25" stroke="#c8473d" stroke-width="5"/><path d="M42 8v8M76 42h-8" stroke="#092a32" stroke-width="3"/></g><path class="focus-example" d="M355 118v69M390 118v69M425 118v69M460 118v69" stroke="#2edbc0" stroke-width="5"/><path class="focus-warning" d="M488 117v70" stroke="#d84a43" stroke-width="7"/>${car(225,128,'scene-car scene-car-brake')}`,
    'vehicle-safety': `<g class="focus-concept" transform="translate(70 27)"><rect x="0" y="0" width="94" height="72" rx="16" fill="#193543" stroke="#092a32" stroke-width="3"/><path d="M18 13 75 60M25 62 68 15" stroke="#55bff0" stroke-width="8"/><circle cx="47" cy="36" r="7" fill="#092a32"/></g><path class="focus-example" d="M180 166h350" stroke="#43d9a2" stroke-width="6"/><g class="focus-warning" transform="translate(500 34)"><path d="M25 0 51 47H0Z" fill="#73d9e1" stroke="#c8473d" stroke-width="6"/><path d="M25 14v15M25 37v2" stroke="#c8473d" stroke-width="4"/></g>${car(280,128,'scene-car scene-car-road')}`,
    'documents': `<g class="focus-concept" transform="translate(72 26)"><rect x="0" y="0" width="92" height="112" rx="8" fill="#193543" stroke="#092a32" stroke-width="3"/><path d="M17 23h55M17 40h55M17 58h40M17 76h49" stroke="#47bda7" stroke-width="5" stroke-linecap="round"/><circle cx="68" cy="89" r="10" fill="#2edbc0"/></g><path class="focus-example" d="M208 78h300" stroke="#43d9a2" stroke-width="5" stroke-dasharray="10 7"/>${car(290,128,'scene-car scene-car-road')}${badge('R.C.A.',456,34,'focus-warning')}`,
    'driver-safety': `<g class="focus-concept" transform="translate(70 24)"><circle cx="43" cy="36" r="28" fill="#2edbc0" stroke="#092a32" stroke-width="3"/><path d="M20 100c4-26 19-37 41-37s37 11 41 37" fill="#43d9a2" stroke="#092a32" stroke-width="3"/><circle cx="35" cy="36" r="3" fill="#092a32"/><circle cx="52" cy="36" r="3" fill="#092a32"/><path d="M37 49q7 6 14 0" fill="none" stroke="#092a32" stroke-width="3"/></g><g class="focus-example" transform="translate(485 28)"><path d="M37 0 72 65H2Z" fill="#73d9e1" stroke="#c8473d" stroke-width="6"/><path d="M37 20v20M37 50v2" stroke="#c8473d" stroke-width="5"/></g><path class="focus-warning" d="M182 158h282" stroke="#2edbc0" stroke-width="7" stroke-dasharray="16 9"/>${car(270,128,'scene-car scene-car-road')}`,
    'visibility': `<g class="focus-concept" transform="translate(58 31)"><path d="M0 35Q43-2 86 35 43 72 0 35Z" fill="#193543" stroke="#092a32" stroke-width="4"/><circle cx="43" cy="35" r="13" fill="#2c6d9d"/><circle cx="43" cy="35" r="5" fill="#092a32"/></g><path class="focus-example" d="M130 140 270 119 270 181Z" fill="#2edbc0" opacity=".52"/><path class="focus-warning" d="M413 126 552 102 552 188Z" fill="#d84a43" opacity=".3"/>${car(270,128,'scene-car scene-car-road')}`,
    'trailer': `${car(168,128,'scene-car scene-car-road')}<g class="scene-trailer focus-concept"><path d="M257 146h34" stroke="#092a32" stroke-width="5"/><rect x="292" y="131" width="105" height="34" rx="7" fill="#1e4552" stroke="#092a32" stroke-width="3"/><circle cx="315" cy="169" r="6" fill="#092a32"/><circle cx="374" cy="169" r="6" fill="#092a32"/></g>${badge('limiti',432,35,'focus-example')}${badge('frenata',432,82,'focus-warning')}`
  };
  return `${shared}${pieces[type] || pieces['road-parts']}<path d="M20 199h600" stroke="#2e5c6b" stroke-width="1"/></svg>`;
}

const excerpt = (text, max = 190) => {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  const boundary = value.slice(0, max).lastIndexOf(' ');
  return `${value.slice(0, boundary > max * .55 ? boundary : max).trim()}…`;
};

export function lessonAnimationMarkup(lesson, moduleId = '') {
  const type = resolveSceneType(lesson, moduleId);
  const labels = [
    {key:'concept', it:'Core idea', ar:'الفكرة الأساسية'},
    {key:'example', it:'Practical example', ar:'مثال تطبيقي'},
    {key:'warning', it:'Common mistake', ar:'خطأ شائع'}
  ];
  const fallback = [
    {text_it:lesson.core_it || lesson.body_it || lesson.heading_it, text_ar:lesson.core_ar || lesson.body_ar || lesson.heading_ar},
    {text_it:lesson.example_it, text_ar:lesson.example_ar},
    {text_it:lesson.common_mistakes?.[0]?.mistake_it || lesson.pitfall_it, text_ar:lesson.common_mistakes?.[0]?.mistake_ar || lesson.pitfall_ar}
  ];
  const stages = labels.map((label,index)=>({
    ...label,
    text_it:excerpt(lesson.visual_script?.stages?.[index]?.text_it || fallback[index].text_it),
    text_ar:excerpt(lesson.visual_script?.stages?.[index]?.text_ar || fallback[index].text_ar)
  }));
  const stageCards = stages.map((stage, index) => `<article class="lesson-animation-stage${index === 0 ? ' is-active' : ''}" data-explainer-stage="${index}" aria-current="${index === 0 ? 'step' : 'false'}"><strong><span lang="it">${escapeHtml(stage.it)}</span><small lang="ar" dir="rtl">${escapeHtml(stage.ar)}</small></strong><p class="lesson-animation-stage-it" lang="it" dir="ltr">${escapeHtml(stage.text_it)}</p><p class="lesson-animation-stage-ar" lang="ar" dir="rtl">${escapeHtml(stage.text_ar)}</p></article>`).join('');
  const stageButtons = stages.map((stage, index) => `<button type="button" class="lesson-animation-step${index === 0 ? ' is-active' : ''}" data-explainer-step="${index}" aria-pressed="${index === 0 ? 'true' : 'false'}"><span>${String(index + 1).padStart(2, '0')}</span><small>${escapeHtml(stage.ar)}</small></button>`).join('');
  const visualPath = lesson.visual_script?.visual_path || `inline-svg:${type}`;
  return `<section class="lesson-animation" data-scene="${type}" data-visual-path="${escapeHtml(visualPath)}" data-step="0" aria-labelledby="lessonAnimationTitle"><div class="lesson-animation-heading"><div><div class="eyebrow"><span lang="it">FASI DELLA LEZIONE</span> · <span lang="ar">مراحل الدرس</span></div><h2 id="lessonAnimationTitle"><span lang="it">La lezione in tre fasi</span><small lang="ar" dir="rtl">نصوص الدرس مرتبة في ثلاث مراحل</small></h2></div><span class="offline-badge" lang="ar">يعمل دون إنترنت</span></div><div class="lesson-animation-scene">${sceneSvg(type)}</div><div class="lesson-animation-stages" aria-live="polite">${stageCards}</div><div class="lesson-animation-controls"><div class="lesson-animation-steps" role="group" aria-label="Fasi della spiegazione · مراحل الشرح">${stageButtons}</div></div></section>`;
}
