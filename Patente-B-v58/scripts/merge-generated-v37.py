#!/usr/bin/env python3
"""Merge researched v36 payloads into the v29 course schema for app build v37."""
from __future__ import annotations
import json, re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
RAW = DATA / 'generated-v36'

def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))

def write_json(path: Path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def normalize_source(source: dict) -> dict:
    url = str(source.get('url') or '').strip()
    if not url.startswith('https://'):
        raise ValueError(f'Non-HTTPS legal source: {url!r}')
    title = str(source.get('title_it') or source.get('title_ar') or 'Fonte normativa ufficiale').strip()
    article = str(source.get('article') or '').strip()
    return {
        'url': url,
        'title': title,
        'title_it': str(source.get('title_it') or title),
        'title_ar': str(source.get('title_ar') or 'مصدر قانوني رسمي'),
        'legal_reference': article,
        'legal_reference_it': article,
    }

def lesson_word_count(text: str) -> int:
    return len(re.findall(r"[\p{L}\p{M}]+(?:[’'][\p{L}\p{M}]+)*", text)) if False else len(re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[’'][A-Za-zÀ-ÖØ-öø-ÿ]+)*", text))

def normalize_core(value) -> str:
    if isinstance(value, list):
        parts = value
    else:
        text = str(value or '').strip()
        parts = re.split(r'(?<=[.!?؟])\s+', text) if text else []
        if len(parts) == 1:
            parts = text.splitlines()
    lines = [str(part).strip() for part in parts if str(part).strip()]
    if len(lines) > 2:
        lines = [lines[0], ' '.join(lines[1:])]
    elif len(lines) == 1:
        words = lines[0].split()
        midpoint = max(1, len(words) // 2)
        lines = [' '.join(words[:midpoint]), ' '.join(words[midpoint:])]
    return '\n'.join(lines)

course = read_json(DATA / 'lessons.json')
module_payloads = {p.stem: read_json(p) for p in sorted((RAW / 'modules').glob('*.json'))}
if len(module_payloads) != 11:
    raise ValueError(f'Expected 11 generated modules, got {len(module_payloads)}')

scripted_video_lessons = {('road-basics', i) for i in range(4)} | {('signs', 0)}
counts = []
all_sources: dict[str, dict] = {}
for module in course['modules']:
    mid = module['module_id']
    payload = module_payloads.get(mid)
    if payload is None or payload.get('module_id') != mid:
        raise ValueError(f'Missing or mismatched module payload: {mid}')
    old_lessons = module['lessons']
    new_lessons = payload.get('lessons', [])
    if len(old_lessons) != len(new_lessons):
        raise ValueError(f'{mid}: expected {len(old_lessons)} lessons, got {len(new_lessons)}')
    module_sources: dict[str, dict] = {}
    for index, (old, new) in enumerate(zip(old_lessons, new_lessons)):
        if int(new.get('lesson_order', index + 1)) != index + 1:
            raise ValueError(f'{mid}:{index+1}: lesson order mismatch')
        n = lesson_word_count(str(new.get('body_it', '')))
        if not 80 <= n <= 120:
            raise ValueError(f'{mid}:{index+1}: Italian body has {n} words')
        if not (4 <= len(new.get('key_points', [])) <= 6):
            raise ValueError(f'{mid}:{index+1}: expected 4-6 key points')
        if not (0 <= len(new.get('trap_words', [])) <= 2):
            raise ValueError(f'{mid}:{index+1}: expected 0-2 trap words')
        if not (0 <= len(new.get('numbers', [])) <= 2):
            raise ValueError(f'{mid}:{index+1}: expected 0-2 numeric facts')
        if not (2 <= len(new.get('common_mistakes', [])) <= 3):
            raise ValueError(f'{mid}:{index+1}: expected 2-3 common mistakes')
        if len(new.get('quick_check', [])) != 3:
            raise ValueError(f'{mid}:{index+1}: expected 3 Vero/Falso checks')
        if any(check.get('answer') not in {'VERO', 'FALSO'} for check in new.get('quick_check', [])):
            raise ValueError(f'{mid}:{index+1}: invalid quick-check answer')
        for field in ('heading_it','heading_ar','body_it','body_ar','core_it','core_ar','example_it','example_ar','pitfall_it','pitfall_ar'):
            if not str(new.get(field, '')).strip():
                raise ValueError(f'{mid}:{index+1}: empty required field {field}')
        core_it = normalize_core(new['core_it'])
        core_ar = normalize_core(new['core_ar'])
        if len(core_it.splitlines()) != 2 or len(core_ar.splitlines()) != 2:
            raise ValueError(f'{mid}:{index+1}: Core Idea must contain exactly two lines in each language')
        legal_sources = [normalize_source(x) for x in new.get('legal_sources', [])]
        if not legal_sources:
            raise ValueError(f'{mid}:{index+1}: no legal source')
        for source in legal_sources:
            module_sources[source['url']] = source
            all_sources[source['url']] = source
        # Keep all non-content lesson metadata (IDs, official bank topics, review IDs,
        # illustrations, access/video links and original order) untouched.
        old.update({
            'heading_it': new['heading_it'], 'heading_ar': new['heading_ar'],
            'body_it': new['body_it'], 'body_ar': new['body_ar'],
            'core_it': core_it, 'core_ar': core_ar,
            'key_points': new['key_points'], 'trap_words': new['trap_words'],
            'numbers': new['numbers'], 'common_mistakes': new['common_mistakes'],
            'quick_check': new['quick_check'],
            'example_it': new['example_it'], 'example_ar': new['example_ar'],
            'pitfall_it': new['pitfall_it'], 'pitfall_ar': new['pitfall_ar'],
            'sources': legal_sources,
        })
        old['video_script_available'] = (mid, index) in scripted_video_lessons
        counts.append(n)
    # Use the newly checked article references for the unit as well as each lesson.
    module['sources'] = list(module_sources.values())

# Restore the statutory general and precipitation limits directly in the lesson
# text and number cards, with the currently checked ACI Article 142 source.
speed_module = next(module for module in course['modules'] if module['module_id'] == 'speed-stopping-highways')
speed = speed_module['lessons'][0]
speed['body_it'] = ('L’articolo 141 impone di adeguare la velocità a veicolo, carico, strada, traffico, visibilità e altre circostanze. '
    'Il conducente deve mantenere il controllo e potersi fermare entro il proprio campo visivo davanti a ostacoli prevedibili. '
    'L’articolo 142 indica massimi ordinari: 50 km/h nei centri abitati, 90 sulle strade extraurbane secondarie e locali, '
    '110 sulle extraurbane principali e 130 in autostrada. Nei centri abitati il limite può salire a 70 solo dove caratteristiche e segnali lo consentono. '
    'Con precipitazioni atmosferiche di qualsiasi natura, i massimi sono 110 km/h in autostrada e 90 sulle extraurbane principali. '
    'Limiti diversi possono essere segnalati; rispettare il massimo non sostituisce l’obbligo dell’articolo 141.')
speed['body_ar'] = ('المادة 141 تلزم السائق يضبط السرعة حسب المركبة والحمولة والطريق والمرور والرؤية وباقي الظروف. '
    'لازم يفضل مسيطر على المركبة ويقدر يوقف داخل مجال رؤيته قدام عائق متوقع. المادة 142 بتحدد الحدود العامة القصوى: '
    '50 كم/س داخل المناطق المأهولة، و90 على الطرق الثانوية والمحلية خارج المدن، و110 على الطرق الرئيسية خارج المدن، و130 على الطرق السريعة. '
    'داخل المناطق المأهولة ممكن يرتفع الحد إلى 70 فقط لما خصائص الطريق والإشارات تسمح. مع هطول جوي من أي نوع، الحد الأعلى 110 كم/س على الطرق السريعة و90 على الطرق الرئيسية خارج المدن. '
    'ممكن تتحدد حدود مختلفة بالإشارات؛ والالتزام بالحد الأقصى ما يلغيّش واجب تعديل السرعة حسب المادة 141.')
speed['numbers'] = [
    {'value':'50 · 90 · 110 · 130 km/h','context_it':'Massimi ordinari dell’art. 142: centri abitati; strade extraurbane secondarie e locali; extraurbane principali; autostrade. In città il limite può arrivare a 70 km/h solo sui tratti idonei e segnalati.','context_ar':'الحدود العامة في المادة 142 بالترتيب: المناطق المأهولة؛ الطرق الثانوية والمحلية خارج المدن؛ الطرق الرئيسية خارج المدن؛ الطرق السريعة. داخل المدن قد يصل الحد إلى 70 كم/س فقط في المقاطع المناسبة والمعلّمة.'},
    {'value':'110 km/h · 90 km/h','context_it':'Con precipitazioni atmosferiche di qualsiasi natura: 110 km/h in autostrada e 90 km/h sulle strade extraurbane principali.','context_ar':'عند الهطول الجوي من أي نوع: 110 كم/س على الطرق السريعة و90 كم/س على الطرق الرئيسية خارج المدن.'}
]
art142 = normalize_source({'url':'https://aci.gov.it/codice-della-strada/art-142/','title_it':'Art. 142 · Limiti di velocità','title_ar':'المادة 142 · حدود السرعة','article':'Art. 142'})
if all(source.get('url') != art142['url'] for source in speed.get('sources', [])):
    speed.setdefault('sources', []).append(art142)
if all(source.get('url') != art142['url'] for source in speed_module.get('sources', [])):
    speed_module.setdefault('sources', []).append(art142)
all_sources[art142['url']] = art142
counts = [lesson_word_count(lesson['body_it']) for module in course['modules'] for lesson in module['lessons']]
if not 80 <= lesson_word_count(speed['body_it']) <= 120:
    raise ValueError(f'Speed lesson Italian body has {lesson_word_count(speed["body_it"])} words')

course['legal_check_date'] = '2026-11-15'
write_json(DATA / 'lessons.json', course)

# Preserve the original reference-page interface while mapping the researched sources.
traps = read_json(RAW / 'references' / 'traps.json')['entries']
numbers_raw = read_json(RAW / 'references' / 'numbers.json')['entries']
comparisons = read_json(RAW / 'references' / 'comparisons.json')['entries']
glossary = read_json(RAW / 'references' / 'glossary.json')

category_ar = {
    'Autobus/filobus oltre 8 t, autostrada':'حافلات أو ترولي باص فوق 8 أطنان: طريق سريع',
    'Autobus/filobus oltre 8 t, fuori abitato':'حافلات أو ترولي باص فوق 8 أطنان: خارج المناطق المأهولة',
    'Autocarri oltre 5 t adibiti a persone, autostrada':'شاحنات فوق 5 أطنان مخصصة لنقل أشخاص: طريق سريع',
    'Autocarri oltre 5 t adibiti a persone, fuori abitato':'شاحنات فوق 5 أطنان مخصصة لنقل أشخاص: خارج المناطق المأهولة',
    'Ciclomotori':'الدراجات النارية الخفيفة',
    'Coda in autostrada: accesso corsia emergenza per uscire':'ازدحام على الطريق السريع: استخدام حارة الطوارئ للخروج',
    'Complessi auto-rimorchio, autostrada':'مجموعات السيارة والمقطورة: طريق سريع',
    'Complessi auto-rimorchio, fuori abitato':'مجموعات السيارة والمقطورة: خارج المناطق المأهولة',
    'Distanza da spazzaneve/spargitrici in funzione':'المسافة عن كاسحات الثلوج أو ناشرات المواد أثناء التشغيل',
    'Distanza tra veicoli con divieto di sorpasso per categorie':'المسافة بين المركبات مع منع تجاوز فئات معينة',
    'Eccezione autostradale segnalata':'استثناء معلن على الطريق السريع',
    'Eccezione urbana segnalata':'استثناء معلن داخل المناطق المأهولة',
    'Fascia generale di ebbrezza':'النطاق العام لنسبة الكحول',
    'Fascia penale intermedia':'النطاق الجنائي المتوسط',
    'Fascia penale superiore':'النطاق الجنائي الأعلى',
    'Fascia speciale: categorie art.186-bis':'نطاق خاص: الفئات المذكورة في المادة 186 مكرر',
    'Limite generale: autostrade':'الحد العام: الطرق السريعة',
    'Limite generale: centri abitati':'الحد العام: المناطق المأهولة',
    'Limite generale: extraurbane principali':'الحد العام: الطرق الرئيسية خارج المناطق المأهولة',
    'Limite generale: extraurbane secondarie e locali':'الحد العام: الطرق الثانوية والمحلية خارج المناطق المأهولة',
    'Macchine agricole/operatrici non su pneumatici':'آلات زراعية أو عاملة غير مزودة بإطارات مطاطية',
    'Macchine agricole/operatrici su pneumatici':'آلات زراعية أو عاملة مزودة بإطارات مطاطية',
    'Merci oltre 12 t, autostrada':'نقل بضائع فوق 12 طنًا: طريق سريع',
    'Merci oltre 12 t, fuori abitato':'نقل بضائع فوق 12 طنًا: خارج المناطق المأهولة',
    'Merci oltre 3,5 t fino a 12 t, autostrada':'نقل بضائع فوق 3.5 إلى 12 طنًا: طريق سريع',
    'Merci oltre 3,5 t fino a 12 t, fuori abitato':'نقل بضائع فوق 3.5 إلى 12 طنًا: خارج المناطق المأهولة',
    'Merci pericolose classe 1, fuori abitato':'بضائع خطرة من الفئة 1: خارج المناطق المأهولة',
    'Merci pericolose classe 1, in abitato':'بضائع خطرة من الفئة 1: داخل المناطق المأهولة',
    'Mezzi d’opera a pieno carico, fuori abitato':'مركبات عمل بحمولة كاملة: خارج المناطق المأهولة',
    'Mezzi d’opera a pieno carico, in abitato':'مركبات عمل بحمولة كاملة: داخل المناطق المأهولة',
    'Precipitazioni: autostrade':'الأمطار: الطرق السريعة',
    'Precipitazioni: extraurbane principali':'الأمطار: الطرق الرئيسية خارج المناطق المأهولة',
    'Quadricicli, fuori abitato':'مركبات رباعية العجلات: خارج المناطق المأهولة',
    'Revoca: conducenti art.186-bis, comma 1(d)':'سحب الرخصة: السائقون المشمولون بالمادة 186 مكرر، الفقرة 1(d)',
    'Sorpasso velocipedi: distanza laterale':'تجاوز الدراجات الهوائية: المسافة الجانبية',
    'Sosta di emergenza autostradale':'التوقف الاضطراري على الطريق السريع',
    'Sosta in pertinenze autostradali':'الوقوف في مرافق الطريق السريع',
    'Tasso zero: conducenti under 21':'نسبة كحول صفرية: السائقون دون 21 عامًا',
    'Tasso zero: primi tre anni patente B':'نسبة كحول صفرية: أول ثلاث سنوات من رخصة B',
    'Tasso zero: trasporto professionale e categorie veicolo enumerate':'نسبة كحول صفرية: النقل المهني وفئات المركبات المذكورة',
}
number_items = []
for item in numbers_raw:
    category = item['category']
    if category not in category_ar:
        raise ValueError(f'Missing Arabic category: {category}')
    number_items.append({
        'value': item['value'], 'category_it': category, 'category_ar': category_ar[category],
        'rule_it': item['rule_it'], 'rule_ar': item['rule_ar'],
        'article': item['article'], 'url': item['source_url'],
    })

reference_tools = {
    'schema_version': 1,
    'traps': traps,
    'numbers': number_items,
    'comparisons': comparisons,
}
write_json(DATA / 'reference-tools.json', reference_tools)
write_json(DATA / 'glossary-v37.json', glossary)

# Small editorial cleanup of five generic seed notes, preserving the independently sourced terms.
for entry in glossary.get('entries', []):
    term = entry.get('italian', '').casefold()
    if entry.get('note_it', '').startswith('Termine pratico di signs;'):
        if term == 'segnale stradale':
            entry['note_it'] = 'Segnale che avverte, prescrive una condotta o fornisce indicazioni, secondo la categoria.'
            entry['note_ar'] = 'إشارة تحذّر أو تفرض سلوكًا أو تقدم معلومات، حسب فئتها.'
        elif term == 'segnale verticale':
            entry['note_it'] = 'Segnale installato verticalmente; forma, colore e significato dipendono dalla disciplina applicabile.'
            entry['note_ar'] = 'إشارة تُركّب رأسيًا؛ ويعتمد شكلها ولونها ومعناها على القواعد المنظمة.'
        elif term == 'segnale orizzontale':
            entry['note_it'] = 'Segno tracciato sulla superficie stradale per regolare, guidare o informare gli utenti.'
            entry['note_ar'] = 'علامة مرسومة على سطح الطريق لتنظيم المستخدمين أو توجيههم أو إعلامهم.'
        elif term == 'segnale di pericolo':
            entry['note_it'] = 'Avverte del pericolo e della sua natura, richiamando prudenza.'
            entry['note_ar'] = 'تحذّر من الخطر وطبيعته وتدعو إلى الحذر.'
        elif term == 'segnale di prescrizione':
            entry['note_it'] = 'Comprende segnali di precedenza, divieto e obbligo; non è una singola forma grafica.'
            entry['note_ar'] = 'تشمل إشارات الأولوية والمنع والإلزام، وليست شكلًا واحدًا.'

# Replace generic seed terms with current, high-value statutory vocabulary.
curated_terms = [
    ('driving', 'partenza', {'italian':'autostrada','arabic':'الطريق السريع (فئة قانونية إيطالية)','category':'driving','note_it':'Strada di tipo A con caratteristiche definite dall’art. 2; non è un sinonimo giuridico generico di qualsiasi strada veloce.','note_ar':'طريق من الفئة A بخصائص محددة في المادة 2؛ ولا يُعد كل طريق سريع autostrada.','article':'Art. 2','source_url':'https://aci.gov.it/codice-della-strada/art-2/'}),
    ('driving', 'traffico intenso', {'italian':'veicolo proveniente da destra','arabic':'المركبة القادمة من اليمين','category':'driving','note_it':'All’intersezione, di regola ha precedenza chi proviene da destra, salvo diversa segnalazione.','note_ar':'عند التقاطع، تكون الأولوية عادةً للمركبة القادمة من اليمين، ما لم تدل الإشارات على غير ذلك.','article':'Art. 145','source_url':'https://aci.gov.it/codice-della-strada/art-145/'}),
    ('procedures', 'delegato', {'italian':'revoca della patente','arabic':'إلغاء رخصة القيادة','category':'procedures','note_it':'Provvedimento disposto nei casi previsti; cause ed effetti dipendono dalla norma applicabile e sono distinti dalla sospensione.','note_ar':'قرار يُتخذ في الحالات التي يحددها القانون؛ تختلف أسبابه وآثاره بحسب النص، وهو غير تعليق الرخصة مؤقتًا.','article':'Art. 130','source_url':'https://aci.gov.it/codice-della-strada/art-130/'}),
    ('procedures', 'ricevuta di pagamento', {'italian':'Documento Unico','arabic':'الوثيقة الموحدة للسير والملكية','category':'procedures','note_it':'Il DU riunisce i dati della carta di circolazione e quelli giuridico-patrimoniali del veicolo; i documenti precedenti restano validi fino al rilascio del DU.','note_ar':'تجمع الوثيقة الموحدة بيانات بطاقة السير وبيانات المركبة القانونية والملكية؛ وتظل الوثائق السابقة صالحة إلى أن تُصدر الوثيقة الموحدة.','article':'D.lgs. 98/2017 · Art. 93','source_url':'https://aci.gov.it/pratica-auto/documenti-del-veicolo-il-du-documento-unico-e-di-proprieta-del-veicolo/'}),
    ('signs', 'segnale turistico', {'italian':'segnalazione dell’agente','arabic':'إشارة رجل المرور المنظّم للسير','category':'signs','note_it':'Va rispettata senza indugio; se contrasta con segnali o regole generali, la prescrizione dell’agente prevale.','note_ar':'يجب اتباعها فورًا؛ وعند التعارض مع إشارات الطريق أو القواعد العامة، تكون لتوجيه رجل المرور الأولوية.','article':'Art. 43','source_url':'https://aci.gov.it/codice-della-strada/art-43/'}),
]
entries = glossary.get('entries', [])
for category, old_term, replacement in curated_terms:
    matches = [i for i, entry in enumerate(entries) if entry.get('category') == category and entry.get('italian', '').casefold() == old_term.casefold()]
    if len(matches) != 1:
        raise ValueError(f'Expected one {category} glossary seed term {old_term!r}, got {len(matches)}')
    entries[matches[0]] = replacement
for entry in entries:
    term = entry.get('italian', '').casefold()
    if term == 'precedenza':
        entry['search_terms_ar'] = ['الأسبقية المرورية']
    elif term == 'distanza di sicurezza':
        entry['arabic'] = 'مسافة الأمان'
counts_by_category = Counter(entry.get('category', '') for entry in entries)
if len(entries) != 200 or counts_by_category != Counter({'driving':40,'procedures':40,'safety':40,'signs':40,'vehicle':40}):
    raise ValueError(f'Glossary distribution must remain 200 entries and 40 per category; got {counts_by_category}')

# The raw file and its generated research trail remain intact; the bundled app uses v37.
write_json(DATA / 'glossary-v37.json', glossary)

# Save a concise machine-readable merge manifest for test/report generation.
manifest = {
    'app_version': 37,
    'module_count': len(course['modules']),
    'lesson_count': sum(len(m['lessons']) for m in course['modules']),
    'body_word_min': min(counts), 'body_word_max': max(counts),
    'glossary_count': len(glossary.get('entries', [])),
    'trap_count': len(traps), 'number_count': len(number_items), 'comparison_count': len(comparisons),
    'source_url_count': len(all_sources),
    'lesson_source_urls': sorted(all_sources),
}
write_json(DATA / 'generated-v37-manifest.json', manifest)
print(json.dumps(manifest, ensure_ascii=False, indent=2))
