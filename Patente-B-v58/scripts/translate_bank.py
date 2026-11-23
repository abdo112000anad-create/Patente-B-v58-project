#!/usr/bin/env python3
"""Translate all official B-quiz statements to Arabic; preserve source truth values."""
import concurrent.futures, json, os, re, threading, time
from pathlib import Path
from openai import OpenAI

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'data/questions.it.json'
OUT=ROOT/'data/questions.json'
CACHE=ROOT/'data/.translation-cache.json'
MODEL=os.environ.get('PATENTE_TRANSLATION_MODEL','gpt-5-mini')
BATCH_SIZE=60
WORKERS=5

source=json.loads(SRC.read_text(encoding='utf-8'))
questions=source['questions']
translations={}
if CACHE.exists():
    try: translations=json.loads(CACHE.read_text(encoding='utf-8'))
    except Exception: translations={}
if OUT.exists():
    try:
        old=json.loads(OUT.read_text(encoding='utf-8'))
        translations.update({str(q['id']):q['ar'] for q in old.get('questions',[]) if q.get('ar')})
    except Exception: pass

pending=[q for q in questions if str(q['id']) not in translations]
batches=[pending[i:i+BATCH_SIZE] for i in range(0,len(pending),BATCH_SIZE)]
lock=threading.Lock()
client=OpenAI()
schema={"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"id":{"type":"integer"},"ar":{"type":"string"}},"required":["id","ar"],"additionalProperties":False}}},"required":["items"],"additionalProperties":False}
system=("أنت مترجم متخصص في اللغة العربية الفصحى ومصطلحات تعليم القيادة الإيطالية. ترجم كل عبارة إيطالية إلى عربية فصحى واضحة ومباشرة. لا تلخص ولا تشرح ولا تصحح النص الإيطالي. حافظ بدقة على النفي والاستثناء والاحتمال والوجوب والكمية والشرط والزمن والفاعل والقيود، فكلها قد تقلب جواب الصح والخطأ. لا تستنتج الإجابة ولا تُضف معلومة قانونية. أعد كل رقم كما هو وكل عبارة مترجمة مرة واحدة فقط. مصطلحات موحدة: precedenza = أولوية المرور، dare precedenza = إفساح أولوية المرور، sorpasso = تجاوز، fermata = توقف قصير، sosta = وقوف/ركن، carreggiata = الجزء المخصص لسير المركبات (حارة السير/مسار الطريق وفق السياق)، incrocio = تقاطع، centro abitato = منطقة مأهولة، strada extraurbana = طريق خارج المناطق المأهولة، segnale = إشارة مرورية. إذا كانت العبارة تحيل إلى رسم، احتفظ بإحالة النص ولا تخترع وصفًا للرسم. استخدم العربية وحدها في ar، مع الأرقام أو الرموز التقنية عند الحاجة.")

def translate(batch_index, batch):
    payload='\n'.join(json.dumps({'id':q['id'],'it':q['it']},ensure_ascii=False) for q in batch)
    last=None
    for attempt in range(4):
        try:
            resp=client.chat.completions.create(
                model=MODEL,
                messages=[{'role':'system','content':system},{'role':'user','content':'ترجم العناصر التالية ترجمة أمينة، وأعد JSON مطابقًا للمخطط فقط:\n'+payload}],
                response_format={'type':'json_schema','json_schema':{'name':'quiz_translations','strict':True,'schema':schema}},
                max_completion_tokens=14000,
                extra_body={'reasoning':{'effort':'minimal'}},
            )
            data=json.loads(resp.choices[0].message.content)
            got={str(x['id']):x['ar'].strip() for x in data['items']}
            expected={str(q['id']) for q in batch}
            if set(got)!=expected or any(not v or not re.search(r'[\u0600-\u06FF]',v) for v in got.values()):
                raise ValueError(f"Batch {batch_index}: translation IDs or Arabic-text validation failed")
            return batch_index,got
        except Exception as e:
            last=e
            if getattr(e,'fatal',False): raise
            if attempt<3: time.sleep(2**attempt)
    raise RuntimeError(f"Batch {batch_index} failed: {last}")

def save_final():
    absent=[q['id'] for q in questions if str(q['id']) not in translations]
    if absent: return False
    merged={**{k:v for k,v in source.items() if k!='questions'},'translationLanguage':'ar','translationMethod':'AI-generated Arabic translation; not an official ministry translation; review by qualified Italian road-law editor is recommended','translationReviewedByHuman':False,'questions':[]}
    for q in questions:
        merged['questions'].append({**q,'ar':translations[str(q['id'])]})
    OUT.write_text(json.dumps(merged,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    return True

print(f"Question total: {len(questions)}; already translated: {len(questions)-len(pending)}; pending batches: {len(batches)}; model: {MODEL}",flush=True)
completed=0
with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
    futures=[pool.submit(translate,i,b) for i,b in enumerate(batches)]
    for future in concurrent.futures.as_completed(futures):
        i,result=future.result()
        with lock:
            translations.update(result)
            CACHE.write_text(json.dumps(translations,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
            completed+=1
            if save_final():
                print(f"Translated batches {completed}/{len(batches)}; records {len(translations)}/{len(questions)}; final data saved.",flush=True)
            else:
                print(f"Translated batches {completed}/{len(batches)}; records {len(translations)}/{len(questions)}",flush=True)
if not save_final(): raise SystemExit('Translation output incomplete')
print(f"COMPLETE: {len(translations)} translations saved to {OUT}",flush=True)
