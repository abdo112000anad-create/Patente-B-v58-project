const tokenPattern = /\s+|[\p{L}\p{M}\p{N}]+(?:[’'][\p{L}\p{M}\p{N}]+)*|[^\s]/gu;

function tokenize(value = '') {
  return String(value).match(tokenPattern) || [];
}

function comparisonKey(token) {
  if (/^\s+$/u.test(token)) return ' ';
  if (/^[\p{L}\p{M}\p{N}]+(?:[’'][\p{L}\p{M}\p{N}]+)*$/u.test(token)) {
    return token.toLocaleLowerCase('it-IT');
  }
  return token;
}

/**
 * Word-level LCS diff for two source statements. Removed/added labels describe
 * text changes only; they do not claim that either word or statement is true.
 */
export function diffQuestionText(original = '', variant = '') {
  const left = tokenize(original);
  const right = tokenize(variant);
  const rows = Array.from({length: left.length + 1}, () => new Uint32Array(right.length + 1));

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      rows[i][j] = comparisonKey(left[i]) === comparisonKey(right[j])
        ? rows[i + 1][j + 1] + 1
        : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }

  const changes = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && comparisonKey(left[i]) === comparisonKey(right[j])) {
      changes.push({text: left[i], type: 'equal'});
      i += 1;
      j += 1;
    } else if (i < left.length && (j >= right.length || rows[i + 1][j] >= rows[i][j + 1])) {
      changes.push({text: left[i], type: 'removed'});
      i += 1;
    } else {
      changes.push({text: right[j], type: 'added'});
      j += 1;
    }
  }
  return changes;
}

export function renderDiffSide(changes, side = 'original', escape = value => String(value)) {
  const excluded = side === 'original' ? 'added' : 'removed';
  return (Array.isArray(changes) ? changes : [])
    .filter(change => change.type !== excluded)
    .map(change => {
      const text = escape(change.text);
      return change.type === 'equal' ? text : `<span class="diff-token diff-${change.type}">${text}</span>`;
    })
    .join('');
}
