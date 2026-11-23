const VALID_MODES = new Set([
  'exam', 'visual', 'smart', 'custom', 'topic', 'lesson-review', 'due',
  'mistakes', 'favorites', 'practice', 'single'
]);
const MAX_QUESTIONS = {
  exam: 30, visual: 20, smart: 30, custom: 50, topic: 15, due: 30,
  'lesson-review': 5, mistakes: 15, favorites: 15, practice: 10, single: 1
};
const VALID_RETURN_VIEWS = new Set([
  'home', 'review', 'bank', 'mistakes', 'favorites',
  'lesson', 'search', 'topics'
]);

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function finiteInteger(value, min, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

function lookup(map, key) {
  if (map instanceof Map) return map.get(key);
  if (map && typeof map.get === 'function') return map.get(key);
  return undefined;
}

export function restoreActiveQuiz(saved, context = {}) {
  if (!plainObject(saved) || !VALID_MODES.has(saved.mode)) return null;
  const maxQuestions = MAX_QUESTIONS[saved.mode];
  if (!Array.isArray(saved.questionIds) || saved.questionIds.length < 1 || saved.questionIds.length > maxQuestions) return null;
  if (saved.mode === 'exam' && saved.questionIds.length !== 30) return null;
  if (saved.mode === 'single' && saved.questionIds.length !== 1) return null;
  if (!Array.isArray(saved.answers) || saved.answers.length !== saved.questionIds.length) return null;
  if (!saved.answers.every(answer => answer === null || typeof answer === 'boolean')) return null;

  const specialQuestions = Array.isArray(saved.specialQuestions) ? saved.specialQuestions : [];
  const questions = [];
  for (let index = 0; index < saved.questionIds.length; index += 1) {
    const rawId = saved.questionIds[index];
    let question;
    if (rawId === null) {
      const legacyCheckpoint = specialQuestions[index];
      const checkpointId = typeof legacyCheckpoint === 'string'
        ? legacyCheckpoint
        : plainObject(legacyCheckpoint) && typeof legacyCheckpoint.id === 'string'
          ? legacyCheckpoint.id : '';
      question = checkpointId ? lookup(context.sourceChecks, checkpointId) : undefined;
      if (!question?.lesson_check) return null;
    } else {
      const id = finiteInteger(rawId, 1, Number.MAX_SAFE_INTEGER);
      if (id === null) return null;
      question = lookup(context.questions, id);
      if (!question || Number(question.id) !== id || question.lesson_check) return null;
    }
    questions.push(question);
  }

  const index = finiteInteger(saved.index, 0, questions.length - 1);
  if (index === null) return null;
  const timerMinutes = saved.mode === 'exam' && [20, 30, 40].includes(Number(saved.timerMinutes))
    ? Number(saved.timerMinutes) : 20;
  const remaining = finiteInteger(saved.remaining, 0, timerMinutes * 60);
  if (remaining === null) return null;
  const flagged = Array.isArray(saved.flagged)
    && saved.flagged.length === questions.length
    && saved.flagged.every(value => typeof value === 'boolean')
    ? saved.flagged.slice()
    : Array(questions.length).fill(false);
  const lessonKey = typeof saved.lessonKey === 'string' && context.lessonKeys?.has?.(saved.lessonKey)
    ? saved.lessonKey : '';
  const lessonTitle = typeof saved.lessonTitle === 'string' ? saved.lessonTitle.slice(0, 180) : '';
  const returnView = VALID_RETURN_VIEWS.has(saved.returnView) ? saved.returnView : 'bank';
  const savedAt = finiteInteger(saved.savedAt, 0, Number.MAX_SAFE_INTEGER);

  return {
    mode: saved.mode,
    questions,
    answers: saved.answers.slice(),
    index,
    remaining,
    timerMinutes,
    studyAdjusted: saved.studyAdjusted === true || timerMinutes !== 20 || saved.autoRead === true,
    autoRead: saved.autoRead === true,
    lessonKey,
    lessonTitle,
    returnView,
    flagged,
    reviewing: saved.reviewing === true,
    savedAt
  };
}
