import {glossaryEntries} from './glossary.mjs';

const boundary = String.raw`[\p{L}\p{M}\p{N}]`;

function escapeRegExp(value){
  return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

function termPattern(term){
  const words=String(term).trim().split(/\s+/).map(word=>[...word].map(char=>char==="'"||char==='’'?"['’]":escapeRegExp(char)).join(''));
  return new RegExp(`(?<!${boundary})${words.join('\\s+')}(?!${boundary})`,'giu');
}

export function findGlossaryMatches(text,entries=glossaryEntries){
  if(typeof text!=='string'||!text||!Array.isArray(entries))return [];
  const candidates=[];
  for(const entry of entries){
    if(typeof entry?.it!=='string'||!entry.it.trim())continue;
    for(const match of text.matchAll(termPattern(entry.it))){
      candidates.push({start:match.index,end:match.index+match[0].length,entry});
    }
  }
  candidates.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start)||a.entry.it.localeCompare(b.entry.it));
  const selected=[];
  for(const candidate of candidates){
    const previous=selected.at(-1);
    if(previous&&candidate.start<previous.end)continue;
    selected.push(candidate);
  }
  return selected;
}
