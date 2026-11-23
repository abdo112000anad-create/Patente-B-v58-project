#!/usr/bin/env python3
"""Extract exact embedded figures from the official PDF and map them by question row."""
import hashlib, json, re, shutil, subprocess, sys
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
PDF=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/patente-ab.pdf')
TEXT=ROOT/'data/questions.it.json'
OUTDIR=ROOT/'public/quiz-images'
BASE=Path('/tmp/patente-official-figures')
XML=Path(str(BASE)+'.xml')
bank=json.loads(TEXT.read_text(encoding='utf-8'))
questions={q['id']:q for q in bank['questions']}
OUTDIR.mkdir(parents=True,exist_ok=True)
info=subprocess.run(['pdfinfo',str(PDF)],check=True,capture_output=True,text=True).stdout
match=re.search(r'^Pages:\s+(\d+)\s*$',info,re.M)
if not match: raise SystemExit('Could not determine the PDF page count')
pages=int(match.group(1))
subprocess.run(['pdftohtml','-xml','-f','1','-l',str(pages),str(PDF),str(BASE)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
root=ET.parse(XML).getroot()
unique={}; linked=0; no_match=[]
for page in root.findall('page'):
    page_no=int(page.attrib['number'])
    qrows=[]; images=[]
    for el in page:
        tag=el.tag.split('}')[-1]
        if tag=='text':
            text=''.join(el.itertext()).strip()
            m=re.fullmatch(r'\d{5}',text)
            if m and int(text) in questions:
                qrows.append((int(el.attrib.get('top','0')),int(text)))
        elif tag=='image':
            left=int(el.attrib.get('left','0'))
            if left>600:
                images.append((int(el.attrib.get('top','0')),Path(el.attrib['src'])))
    for qtop,qid in qrows:
        if not images: continue
        top,src=min(images,key=lambda pair:abs(pair[0]-qtop))
        delta=abs(top-qtop)
        if delta>18 or not src.exists():
            continue
        digest=hashlib.sha256(src.read_bytes()).hexdigest()[:20]
        suffix=src.suffix.lower() or '.png'
        rel=f'/quiz-images/{digest}{suffix}'
        target=OUTDIR/f'{digest}{suffix}'
        if digest not in unique:
            shutil.copyfile(src,target);unique[digest]=rel
        questions[qid]['image']=rel
        linked+=1
# Create visible per-question provenance alongside image metadata.
for q in bank['questions']:
    if q['id'] in questions and 'image' not in questions[q['id']] and q.get('hasFigureRef'):
        no_match.append(q['id'])
TEXT.write_text(json.dumps(bank,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
report={'question_count':len(questions),'source_pdf':str(PDF),'source_pdf_pages':pages,'linked_question_rows':linked,'unique_figure_files':len(unique),'reference_questions_without_extracted_image':len(no_match),'unmapped_ids_sample':no_match[:30],'image_directory':str(OUTDIR)}
(ROOT/'data/figure-extraction-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
