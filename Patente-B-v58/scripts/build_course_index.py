#!/usr/bin/env python3
"""Attach the official 25-topic taxonomy and per-lesson bank/image links."""
from __future__ import annotations
import json
import unicodedata
from collections import Counter
from math import log, sqrt
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
LESSONS=ROOT/'data/lessons.json'
QUESTIONS=ROOT/'data/questions.json'
LABELS=ROOT/'data/topic-labels.json'

# Exact Italian subject names copied from the ministry question bank.
TOPIC_AR={
"Comportamenti per prevenire incidenti stradali; comportamento in caso di incidente stradale; peculiarità della guida di":"الوقاية من حوادث الطريق والتصرف عند وقوعها وخصائص القيادة في الحالات المختلفة",
"Definizioni stradali e di traffico; definizioni e classificazione dei veicoli; doveri del conducente nell'uso della strada":"مصطلحات الطريق والمرور وتعريف المركبات وتصنيفها وواجبات السائق",
"Dispositivi di equipaggiamento: funzione ed uso; cinture di sicurezza e sistemi di ritenuta per bambini; casco protettivo;":"تجهيزات المركبة ووظائفها واستخدامها؛ أحزمة الأمان ومقاعد الأطفال والخوذة الواقية",
"Distanza di sicurezza":"مسافة الأمان",
"Elementi costitutivi del veicolo importanti per la sicurezza; manutenzione ed uso; stabilità e tenuta di strada del veicolo;":"أجزاء المركبة المؤثرة في السلامة وصيانتها واستخدامها وثباتها وتماسكها على الطريق",
"Esempi di precedenza (ordine di precedenza agli incroci)":"أمثلة على الأسبقية وترتيب المرور عند التقاطعات",
"Fermata, sosta, arresto e partenza":"التوقف المؤقت والركن والتوقف والانطلاق",
"Guida in relazione alle qualità e condizioni fisiche e psichiche; alcool, droga e farmaci ; primo soccorso":"القيادة وفق الحالة البدنية والنفسية؛ الكحول والمخدرات والأدوية والإسعافات الأولية",
"Ingombro della carreggiata; segnalazione di veicolo fermo; norme sulla circolazione in autostrada e strade extraurbane":"إشغال الطريق والتحذير من المركبة المتعطلة وقواعد الطريق السريع والطرق خارج المدن",
"Limitazione dei consumi; rispetto dell'ambiente; inquinamento: atmosferico, acustico, da cattivo smaltimento dei rifiuti":"ترشيد الاستهلاك واحترام البيئة والتلوث الهوائي والضوضائي والتخلص غير السليم من النفايات",
"Limiti di velocità; pericolo e intralcio alla circolazione; comportamenti ai passaggi a livello":"حدود السرعة ومخاطر الطريق وإعاقة السير والتصرف عند معابر السكك الحديدية",
"Norme sul sorpasso":"قواعد التجاوز",
"Norme sulla circol. dei veicoli; pos. dei veicoli sulla carreggiata; cambio di direz. di corsia (svolta); comp. in presenza di":"قواعد سير المركبات وموضعها على الطريق وتغيير المسار والانعطاف والتصرف قرب مستخدمي الطريق",
"Pannelli integrativi dei segnali":"اللوحات التكميلية لإشارات المرور",
"Patenti di guida; documenti di circolazione del veicolo; obbligo verso funzionari ed agenti; sistema sanzionatorio; patente a":"رخص القيادة ووثائق المركبة والتعامل مع الموظفين وأعوان المرور ونظام العقوبات والرخصة",
"Responsabilità civile, penale, amministrativa; assicurazione R.C.A.; altre forme assicurative legate al veicolo":"المسؤولية المدنية والجنائية والإدارية وتأمين المسؤولية الإلزامي R.C.A. والتأمينات الأخرى",
"Segnalazioni semaforiche; segnalazioni degli agenti del traffico":"إشارات المرور الضوئية وإشارات رجال المرور",
"Segnaletica orizzontale; segni sugli ostacoli":"العلامات الأرضية على الطريق والعلامات على العوائق",
"Segnali complementari; segnali temporanei e di cantiere":"الإشارات التكميلية والمؤقتة وإشارات مواقع الأشغال",
"Segnali di divieto":"إشارات المنع",
"Segnali di indicazione":"الإشارات الإرشادية والمعلوماتية",
"Segnali di obbligo":"إشارات الإلزام",
"Segnali di pericolo":"إشارات التحذير من الخطر",
"Segnali di precedenza":"إشارات الأسبقية",
"Uso delle luci; uso dei dispositivi acustici; spie e simboli":"استخدام الأضواء وأجهزة التنبيه الصوتية ولمبات التحذير والرموز",
}

VISUAL_ASSETS={
  'road-basics':'/lessons/lesson-road-basics.webp',
  'vehicle-safety':'/lessons/lesson-vehicle-safety.webp',
  'documents-liability':'/lessons/lesson-documents.webp',
  'driver-health-environment':'/lessons/lesson-driver-safety.webp',
}

# Each lesson maps only to actual ministry topics. Visual question IDs point to
# the exact official figure; no AI image is labelled as an official sign.
LESSON_MAP={
'road-basics':[
 (['Definizioni stradali e di traffico; definizioni e classificazione dei veicoli; doveri del conducente nell\'uso della strada'],18330),
 (['Definizioni stradali e di traffico; definizioni e classificazione dei veicoli; doveri del conducente nell\'uso della strada'],18609),
 (['Definizioni stradali e di traffico; definizioni e classificazione dei veicoli; doveri del conducente nell\'uso della strada'],'/lessons/lesson-driver-safety.webp'),
 (['Definizioni stradali e di traffico; definizioni e classificazione dei veicoli; doveri del conducente nell\'uso della strada'],'/lessons/lesson-road-basics.webp'),
],
'signs':[
 (['Segnali di pericolo','Segnali di divieto','Segnali di obbligo','Segnali di precedenza','Segnali di indicazione','Pannelli integrativi dei segnali'],18950),
 (['Segnali di pericolo','Segnali di divieto','Segnali di obbligo'],18924),
 (['Segnali di precedenza'],20536),
 (['Segnali di indicazione','Pannelli integrativi dei segnali'],21323),
],
'signals-markings':[
 (['Segnaletica orizzontale; segni sugli ostacoli'],20736),
 (['Segnalazioni semaforiche; segnalazioni degli agenti del traffico'],20970),
 (['Segnalazioni semaforiche; segnalazioni degli agenti del traffico'],21176),
 (['Segnali complementari; segnali temporanei e di cantiere'],21901),
],
'priority-intersections':[
 (['Esempi di precedenza (ordine di precedenza agli incroci)'],23042),
 (['Esempi di precedenza (ordine di precedenza agli incroci)','Segnali di precedenza'],20617),
 (['Segnali di precedenza'],20574),
 (['Esempi di precedenza (ordine di precedenza agli incroci)'],23053),
],
'movement-overtaking':[
 (['Norme sulla circol. dei veicoli; pos. dei veicoli sulla carreggiata; cambio di direz. di corsia (svolta); comp. in presenza di'],22789),
 (['Norme sulla circol. dei veicoli; pos. dei veicoli sulla carreggiata; cambio di direz. di corsia (svolta); comp. in presenza di'],22662),
 (['Norme sul sorpasso'],21906),
 (['Distanza di sicurezza'],21547),
],
'speed-stopping-highways':[
 (['Limiti di velocità; pericolo e intralcio alla circolazione; comportamenti ai passaggi a livello'],19606),
 (['Limiti di velocità; pericolo e intralcio alla circolazione; comportamenti ai passaggi a livello'],21975),
 (['Fermata, sosta, arresto e partenza'],23683),
 (['Ingombro della carreggiata; segnalazione di veicolo fermo; norme sulla circolazione in autostrada e strade extraurbane'],22114),
 (['Ingombro della carreggiata; segnalazione di veicolo fermo; norme sulla circolazione in autostrada e strade extraurbane'],22159),
],
'vehicle-safety':[
 (['Elementi costitutivi del veicolo importanti per la sicurezza; manutenzione ed uso; stabilità e tenuta di strada del veicolo;'],'local'),
 (['Dispositivi di equipaggiamento: funzione ed uso; cinture di sicurezza e sistemi di ritenuta per bambini; casco protettivo;'],'local'),
 (['Uso delle luci; uso dei dispositivi acustici; spie e simboli'],24203),
 (['Uso delle luci; uso dei dispositivi acustici; spie e simboli'],24216),
],
'documents-liability':[
 (['Patenti di guida; documenti di circolazione del veicolo; obbligo verso funzionari ed agenti; sistema sanzionatorio; patente a'],'local'),
 (['Patenti di guida; documenti di circolazione del veicolo; obbligo verso funzionari ed agenti; sistema sanzionatorio; patente a'],'local'),
 (['Responsabilità civile, penale, amministrativa; assicurazione R.C.A.; altre forme assicurative legate al veicolo'],'local'),
 (['Responsabilità civile, penale, amministrativa; assicurazione R.C.A.; altre forme assicurative legate al veicolo'],'local'),
],
'driver-health-environment':[
 (['Guida in relazione alle qualità e condizioni fisiche e psichiche; alcool, droga e farmaci ; primo soccorso'],'local'),
 (['Comportamenti per prevenire incidenti stradali; comportamento in caso di incidente stradale; peculiarità della guida di'],'local'),
 (['Comportamenti per prevenire incidenti stradali; comportamento in caso di incidente stradale; peculiarità della guida di','Guida in relazione alle qualità e condizioni fisiche e psichiche; alcool, droga e farmaci ; primo soccorso'],'local'),
 (['Limitazione dei consumi; rispetto dell\'ambiente; inquinamento: atmosferico, acustico, da cattivo smaltimento dei rifiuti'],'local'),
],
}


def _char_grams(text):
 text=' '+unicodedata.normalize('NFC',str(text).lower())+' '
 counts=Counter()
 for n in (3,4,5):
  for i in range(len(text)-n+1): counts[text[i:i+n]]+=1
 return counts

def attach_review_question_ids(module, all_questions):
 """Rank official statements by lesson wording within the linked official topics."""
 module_topics={t for lesson in module['lessons'] for t in lesson['bank_topics']}
 candidates=[q for q in all_questions if q['topic'] in module_topics]
 lesson_texts=[' '.join(str(lesson.get(k,'')) for k in ('heading_it','body_it','example_it','pitfall_it')) for lesson in module['lessons']]
 docs=[q['it'] for q in candidates]+lesson_texts
 vectors=[_char_grams(text) for text in docs]
 df=Counter(g for vector in vectors for g in vector)
 idf={g:log(1+len(vectors)/(count+1)) for g,count in df.items()}
 weighted=[{g:count*idf[g] for g,count in vector.items()} for vector in vectors]
 norms=[sqrt(sum(value*value for value in vector.values())) for vector in weighted]
 for lesson_index,lesson in enumerate(module['lessons']):
  lesson_vector=weighted[len(candidates)+lesson_index]
  lesson_norm=norms[len(candidates)+lesson_index]
  allowed=set(lesson['bank_topics'])
  ranked=[]
  for q_index,q in enumerate(candidates):
   if q['topic'] not in allowed: continue
   qv=weighted[q_index];denom=lesson_norm*norms[q_index]
   score=sum(value*qv.get(gram,0) for gram,value in lesson_vector.items())/denom if denom else 0
   ranked.append((score,int(q['id'])))
  ranked.sort(key=lambda row:(-row[0],row[1]))
  lesson['review_question_ids']=[qid for _,qid in ranked[:60]]
  lesson['review_match_score']=round(ranked[0][0],3) if ranked else 0


def main():
 data=json.loads(LESSONS.read_text(encoding='utf8'))
 qs=json.loads(QUESTIONS.read_text(encoding='utf8'))['questions']
 by_id={int(q['id']):q for q in qs}
 actual_topics={q['topic'] for q in qs}
 if set(TOPIC_AR)!=actual_topics:
  missing=actual_topics-set(TOPIC_AR); extra=set(TOPIC_AR)-actual_topics
  raise SystemExit(f'topic translation mismatch missing={missing!r} extra={extra!r}')
 LABELS.write_text(json.dumps({t:{'it':t,'ar':TOPIC_AR[t]} for t in sorted(TOPIC_AR)},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 for module in data['modules']:
  mid=module['module_id']; entries=LESSON_MAP[mid]
  if len(entries)!=len(module['lessons']): raise SystemExit(f'{mid}: lesson count mismatch')
  for lesson,(topics,visual) in zip(module['lessons'],entries):
   if any(topic not in actual_topics for topic in topics): raise SystemExit(f'{mid}: unknown topic for {lesson["heading_ar"]}')
   if isinstance(visual,int):
    q=by_id.get(visual)
    if not q or not q.get('image') or not (ROOT/'public'/q['image'].lstrip('/')).is_file():
     raise SystemExit(f'missing official figure {visual} for {mid}')
    lesson['visual_question_id']=visual
    lesson.pop('visual_src',None)
   elif isinstance(visual,str) and visual.startswith('/lessons/'):
    lesson['visual_src']=visual
    lesson.pop('visual_question_id',None)
   elif visual=='local':
    lesson['visual_src']=VISUAL_ASSETS[mid]
    lesson.pop('visual_question_id',None)
   lesson['bank_topics']=topics
  attach_review_question_ids(module,qs)
  if mid=='road-basics':
   lesson=module['lessons'][3]
   lesson['source_check']={
    'id':'mit-law-177-2024-effective-date',
    'lesson_check':True,
    'topic_it':'Aggiornamento normativo · 2024',
    'topic_ar':'تحديث تشريعات · 2024',
    'it':'Secondo il Ministero, la legge n. 177 del 25 novembre 2024 è entrata in vigore il 14 dicembre 2024.',
    'ar':'وفقًا لوزارة البنية التحتية والنقل، دخل القانون رقم 177 المؤرخ 25 نوفمبر 2024 حيز النفاذ في 14 ديسمبر 2024.',
    'answer':'VERO',
    'explanation_it':'La data è indicata nella pagina ufficiale del Ministero e nella Gazzetta Ufficiale. Il PDF collegato dal Portale non dichiara una data o un numero di versione ufficiali; i metadati interni (17 settembre 2026) e il codice iniziale del nome file (210926) non dimostrano quali modifiche normative siano incluse.',
    'explanation_ar':'ترد التواريخ في صفحة الوزارة والجريدة الرسمية. لا يذكر ملف PDF المرتبط من البوابة تاريخًا أو رقم إصدار رسميًا؛ وبياناته الداخلية (17 سبتمبر 2026) ورمز بداية اسم الملف (210926) لا يثبتان التعديلات التشريعية التي يتضمنها.',
    'source_url':'https://www.mit.gov.it/comunicazione/news/sicurezza-stradale-e-vigore-il-decreto-con-modifiche-al-codice-della-strada',
    'source_label_it':'Pagina ufficiale del Ministero · Legge 177/2024',
    'source_label_ar':'الصفحة الرسمية للوزارة · القانون 177/2024'
   }
  module['course_visual_src']=VISUAL_ASSETS.get(mid)
 data['topic_label_file']='topic-labels.json'
 data['course_order']='module.order_hint, lesson array order'
 LESSONS.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print('Mapped',sum(len(v) for v in LESSON_MAP.values()),'lessons to',len(actual_topics),'official topics; unique official figures',sum(isinstance(v,int) for group in LESSON_MAP.values() for _,v in group))
 print('Ranked official questions individually for each lesson; MIT source check added for the 2024 update lesson.')
 print('Topics not directly assigned to lesson:',sorted(actual_topics-set(t for m in data['modules'] for l in m['lessons'] for t in l['bank_topics'])))
if __name__=='__main__': main()
