import referenceTools from '../data/reference-tools.json' with {type:'json'};
import glossaryData from '../data/glossary-v37.json' with {type:'json'};

export const referenceData = referenceTools;

export const glossaryCategories = Object.freeze({
  signs: {it: 'Segnali e segnaletica', ar: 'الإشارات والعلامات'},
  driving: {it: 'Guida e manovre', ar: 'القيادة والمناورات'},
  vehicle: {it: 'Veicolo e dotazioni', ar: 'المركبة وتجهيزاتها'},
  procedures: {it: 'Patenti e procedure', ar: 'الرخص والإجراءات'},
  safety: {it: 'Sicurezza stradale', ar: 'السلامة على الطريق'}
});

export const glossaryEntries = (Array.isArray(glossaryData?.entries) ? glossaryData.entries : []).map(entry => ({
  it: String(entry.italian || ''),
  ar: String(entry.arabic || ''),
  category: String(entry.category || ''),
  note: String(entry.note_ar || ''),
  note_it: String(entry.note_it || ''),
  tts_locale: 'it-IT'
})).filter(entry => entry.it && entry.ar && glossaryCategories[entry.category]);
