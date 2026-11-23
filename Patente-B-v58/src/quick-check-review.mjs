export const QUICK_CHECK_DAY_MS = 86_400_000;
export const QUICK_CHECK_FIRST_CORRECT_DAYS = 3;

export function quickCheckId(lessonId, index) {
  const id = String(lessonId || '').trim();
  const number = Number(index);
  if (!/^u\d+-l\d+$/.test(id) || !Number.isInteger(number) || number < 0) return '';
  return `${id}::q${number + 1}`;
}

export function scheduleQuickCheckAnswer({
  schedule = {}, wrongAnswers = [], lessonId, questionIndex, chosen, expected, now = Date.now()
} = {}) {
  const key = quickCheckId(lessonId, questionIndex);
  if (!key || !['VERO', 'FALSO'].includes(chosen) || !['VERO', 'FALSO'].includes(expected)) {
    throw new TypeError('quick_check_answer_invalid');
  }
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp) || timestamp < 0) throw new TypeError('quick_check_time_invalid');
  const previous = schedule && typeof schedule === 'object' && !Array.isArray(schedule) ? schedule[key] || {} : {};
  const attempts = Math.max(0, Math.floor(Number(previous.attempts) || 0));
  const correct = chosen === expected;
  const intervalDays = correct ? QUICK_CHECK_FIRST_CORRECT_DAYS : 1;
  const nextSchedule = {
    ...(schedule && typeof schedule === 'object' && !Array.isArray(schedule) ? schedule : {}),
    [key]: {
      lessonId: String(lessonId),
      questionIndex: Number(questionIndex),
      attempts: attempts + 1,
      lastAnswer: chosen,
      lastCorrect: correct,
      firstAttemptCorrect: attempts === 0 ? correct : previous.firstAttemptCorrect === true,
      lastAnsweredAt: timestamp,
      intervalDays,
      dueAt: timestamp + intervalDays * QUICK_CHECK_DAY_MS
    }
  };
  const oldWrong = Array.isArray(wrongAnswers) ? wrongAnswers.filter(value => typeof value === 'string') : [];
  const uniqueWrong = [...new Set(oldWrong)];
  const nextWrong = correct
    ? uniqueWrong.filter(value => value !== key)
    : [...new Set([...uniqueWrong, key])];
  return {key, correct, dueAt: nextSchedule[key].dueAt, schedule: nextSchedule, wrongAnswers: nextWrong};
}

export function isQuickCheckDue(record, now = Date.now()) {
  return !record || !Number.isFinite(Number(record.dueAt)) || Number(record.dueAt) <= Number(now);
}
