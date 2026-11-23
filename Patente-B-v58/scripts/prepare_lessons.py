#!/usr/bin/env python3
"""Normalize researched lesson modules into the app's versioned lesson data."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW = Path('/home/ubuntu/.manus-jobs/8d01679318aa/output.txt')
raw_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_RAW
out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'data/lessons.json'
raw = json.loads(raw_path.read_text(encoding='utf-8'))
if raw.get('failures'):
    raise SystemExit(f"Research failures must be resolved: {raw['failures']}")
bank = json.loads((ROOT / 'data/questions.json').read_text(encoding='utf-8'))
questions = bank['questions']
all_topics = list(dict.fromkeys(q['topic'] for q in questions))
if len(all_topics) != 25:
    raise SystemExit(f'Expected 25 source topics; found {len(all_topics)}')

# This order is read from the ministerial B bank itself, not translated labels
# returned by a researcher. A category may appear in more than one lesson where
# an introductory explanation is followed by practical application.
covered_by_module = {
    'road-basics': [10],
    'signs': [0, 1, 2, 7, 8, 9],
    'signals-markings': [3, 5, 6],
    'priority-intersections': [4, 8],
    'movement-overtaking': [11, 16, 15],
    'speed-stopping-highways': [12, 14, 17],
    'vehicle-safety': [13, 18, 24],
    'documents-liability': [19, 22],
    'driver-health-environment': [20, 21, 23],
}
expected_ids = set(covered_by_module)
modules = raw['modules']
if {m['module_id'] for m in modules} != expected_ids:
    raise SystemExit('The researched module set does not match the approved course structure')

extra_sources = {
    'signals-markings': [{
        'title': 'ACI — المادة 43: إشارات رجال المرور',
        'url': 'https://aci.gov.it/codice-della-strada/art-43/',
        'legal_reference': 'المادة 43 من قانون الطرق',
        'supports_ar': 'النص المعروض يقرر وجوب الامتثال الفوري لأوامر شرطي المرور وأولويتها على بقية الإشارات.'
    }],
    'priority-intersections': [{
        'title': 'ACI — المادة 145: أولوية المرور',
        'url': 'https://aci.gov.it/codice-della-strada/art-145/',
        'legal_reference': 'المادة 145 من قانون الطرق',
        'supports_ar': 'النص الحالي لقاعدة الأولوية من اليمين، وإشارات الأولوية، وعدم دخول تقاطع لا يمكن إخلاؤه.'
    }],
    'movement-overtaking': [{
        'title': 'ACI — المادة 148: التجاوز، بما فيه تجاوز الدراجات',
        'url': 'https://aci.gov.it/codice-della-strada/art-148/',
        'legal_reference': 'المادة 148، الفقرة 9-bis',
        'supports_ar': 'النص يربط المسافة الجانبية المناسبة بإمكان ظروف الطريق، ويذكر 1.5 متر كحد أدنى حيث تسمح الظروف.'
    }],
    'speed-stopping-highways': [{
        'title': 'ACI — المادة 142: حدود السرعة',
        'url': 'https://aci.gov.it/codice-della-strada/art-142/',
        'legal_reference': 'المادة 142 من قانون الطرق',
        'supports_ar': 'الحدود العامة، أحكام المطر، وشروط رفع حد بعض الطرق؛ ويظل واجب الملاءمة في المادة 141 قائمًا.'
    }],
    'documents-liability': [{
        'title': 'ACI — المادة 193: التأمين الإلزامي للمركبات',
        'url': 'https://aci.gov.it/codice-della-strada/art-193/',
        'legal_reference': 'المادة 193، الفقرة 1، بالنص المعروض من ACI',
        'supports_ar': 'المادة تحظر تسيير المركبة بلا تغطية المسؤولية المدنية، وتتضمن واجب المالك في التحقق من استمرارها عند إتاحتها لغيره.'
    }],
    'driver-health-environment': [{
        'title': 'ACI — المادة 187: القيادة بعد تناول مواد مخدرة أو مؤثرة نفسياً',
        'url': 'https://aci.gov.it/codice-della-strada/art-187/',
        'legal_reference': 'المادة 187 من قانون الطرق، بالنص المعروض من ACI',
        'supports_ar': 'تُستخدم الصياغة المنشورة بحذر، من دون اختراع حد رقمي أو ادعاء طبي غير وارد في المصدر.'
    }],
}
illustrations = {
    'documents-liability': {
        'src': '/lessons/documents-insurance.svg',
        'alt_ar': 'ثلاثة رموز تعليمية عامة تمثل رخصة القيادة ووثيقة المركبة والتأمين، وليست صورًا لمستندات رسمية.',
        'caption_ar': 'رموز توضيحية عامة لفئات الوثائق؛ لا تمثل نموذجًا رسميًا أو قائمة بكل حالة قانونية.'
    },
    'driver-health-environment': {
        'src': '/lessons/incident-safety.svg',
        'alt_ar': 'مخطط مبسّط يذكّر بتأمين موضع الحادث وطلب المساعدة وتقديم المساعدة دون تعريض النفس للخطر.',
        'caption_ar': 'مخطط تذكيري تعليمي؛ اتبع توجيهات خدمات الطوارئ ولا تعرض نفسك أو غيرك لخطر إضافي.'
    },
}

for module in modules:
    module['topics_covered'] = [all_topics[i] for i in covered_by_module[module['module_id']]]
    module['illustration'] = illustrations.get(module['module_id'])
    module.setdefault('caveats_ar', [])
    if module['module_id'] == 'movement-overtaking':
        # Article 148 makes 1.5 m conditional on road conditions; it does not
        # limit the clause to outside built-up areas.
        for lesson in module['lessons']:
            for key in ('body_ar', 'example_ar', 'pitfall_ar'):
                lesson[key] = lesson.get(key, '').replace('، خصوصًا خارج المناطق المأهولة', '')
                lesson[key] = lesson.get(key, '').replace('خصوصًا خارج المناطق المأهولة، ', '')
    if module['module_id'] == 'documents-liability':
        for lesson in module['lessons']:
            for key in ('body_ar', 'example_ar', 'pitfall_ar'):
                lesson[key] = lesson.get(key, '').replace(
                    'القانون 177/2024، المادة 插 1، حيث عدّل المادة 193',
                    'الصياغة النافذة للمادة 193، وفق المصدر المباشر أدناه'
                )
                lesson[key] = lesson.get(key, '').replace('المادة 插 1', 'المادة 1')
        module['caveats_ar'].append('لا تُنسب فقرة التأمين إلى تعديل 2024 ما لم يثبت نص المادة المعدِّلة؛ راجع المادة 193 ومصدرها المباشر أدناه.')
    for lesson in module['lessons']:
        # The app already numbers the lessons; remove duplicate numbers in headings.
        heading = lesson.get('heading_ar', '')
        lesson['heading_ar'] = __import__('re').sub(r'^\s*\d+[.)]\s*', '', heading)
        for key in ('body_ar', 'example_ar', 'pitfall_ar'):
            value = lesson.get(key, '')
            value = value.replace('».', '.').replace('»', '')
            lesson[key] = value.strip()
    for source in extra_sources.get(module['module_id'], []):
        if not any(s.get('url') == source['url'] for s in module.get('sources', [])):
            module.setdefault('sources', []).append(source)

modules.sort(key=lambda m: m['order_hint'])
for i, module in enumerate(modules):
    module['previous_module_id'] = modules[i-1]['module_id'] if i else None
    module['next_module_id'] = modules[i+1]['module_id'] if i+1 < len(modules) else None

seen = set()
for module in modules:
    if not module.get('lessons') or not module.get('quiz') or not module.get('sources'):
        raise SystemExit(f"Incomplete module: {module['module_id']}")
    for item in module['quiz']:
        if not 0 <= item['correct_index'] < len(item['options_ar']):
            raise SystemExit(f"Invalid quiz answer index in {module['module_id']}")
    seen.update(module['topics_covered'])
if set(all_topics) - seen:
    raise SystemExit('Uncovered ministerial categories: ' + repr(sorted(set(all_topics)-seen)))

result = {
    'schema_version': 1,
    'title_ar': 'منهج Patente B للمتحدثين بالعربية',
    'legal_check_date': '2026-10-20',
    'disclaimer_ar': 'شرح تعليمي عربي غير رسمي. النصوص القانونية الإيطالية الأصلية هي المرجع الملزم، والترجمة العربية ليست ترجمة رسمية ولا تضمن خلوها التام من الخطأ. تحقق من المصادر المرتبطة عند الدراسة.',
    'bank_topics_count': len(all_topics),
    'module_count': len(modules),
    'modules': modules,
}
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Wrote {out_path}: {len(modules)} modules, {len(all_topics)} bank topics, {sum(len(m["quiz"]) for m in modules)} lesson questions')
