import {normalizeSearchText} from './search.mjs';
import {glossaryEntries, glossaryCategories} from './reference-data.mjs';

export {glossaryEntries, glossaryCategories};

export function searchGlossary(query = '', category = '') {
  const needle = normalizeSearchText(query);
  return glossaryEntries.filter(entry => {
    if (category && entry.category !== category) return false;
    if (!needle) return true;
    const text = normalizeSearchText(`${entry.it} ${entry.ar}`);
    return text.includes(needle) || needle.split(' ').some(term => term.length > 1 && text.includes(term));
  });
}
