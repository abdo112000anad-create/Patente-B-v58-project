const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const MIN_EASE = 1.3;
const MAX_EASE = 2.8;

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

/** Schedule a binary self-test using an SM-2-inspired interval and ease factor.
 * Correct answers map to grade 4; missed answers get a bounded retry delay that
 * adapts to lapse history and ease. No network or external service is used.
 */
export function scheduleQuestionReview(previous = {}, correct, now = Date.now()) {
  const safeNow = Number.isFinite(Number(now)) && Number(now) >= 0 ? Number(now) : Date.now();
  const priorRepetitions = boundedNumber(previous.repetitions ?? previous.streak, 0, 0, 1000);
  const priorLapses = boundedNumber(previous.lapses ?? previous.wrong, 0, 0, 1_000_000);
  const priorRetryDelay = boundedNumber(previous.retryDelayMinutes, 0, 0, 90);
  const easeBefore = boundedNumber(previous.easeFactor, 2.5, MIN_EASE, MAX_EASE);
  const priorInterval = boundedNumber(previous.intervalDays, priorRepetitions === 1 ? 1 : priorRepetitions >= 2 ? 6 : 0, 0, 3650);
  const wasCorrect = correct === true;
  const grade = wasCorrect ? 4 : 1;
  const easeFactor = Math.max(MIN_EASE, Math.min(MAX_EASE,
    easeBefore + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))));
  const repetitions = wasCorrect ? Math.min(1000, priorRepetitions + 1) : 0;
  const lapses = wasCorrect ? Math.max(0, priorLapses - 1) : Math.min(1_000_000, priorLapses + 1);
  let intervalDays;
  let nextReviewAt;
  let retryDelayMinutes;

  if (!wasCorrect) {
    intervalDays = 0;
    const baseDelay = priorRetryDelay || 5;
    const adaptiveFactor = 1.25 + Math.min(4, lapses) * 0.15 + (MAX_EASE - easeFactor) * 0.2;
    retryDelayMinutes = Math.round(Math.max(5, Math.min(90, baseDelay * adaptiveFactor)));
    nextReviewAt = safeNow + retryDelayMinutes * MINUTE_MS;
  } else {
    intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(1, Math.round(Math.max(1, priorInterval) * easeFactor));
    nextReviewAt = safeNow + intervalDays * DAY_MS;
    retryDelayMinutes = 0;
  }

  return {
    correct: boundedNumber(previous.correct, 0, 0, 1_000_000_000) + (wasCorrect ? 1 : 0),
    wrong: boundedNumber(previous.wrong, 0, 0, 1_000_000_000) + (wasCorrect ? 0 : 1),
    streak: wasCorrect ? Math.min(6, Math.max(0, Number(previous.streak) || 0) + 1) : 0,
    repetitions,
    lapses,
    easeFactor: Math.round(easeFactor * 1000) / 1000,
    intervalDays,
    retryDelayMinutes,
    lastAnsweredAt: safeNow,
    nextReviewAt
  };
}

export function isQuestionDue(stat, now = Date.now()) {
  return !stat || !Number.isFinite(Number(stat.nextReviewAt)) || Number(stat.nextReviewAt) <= Number(now);
}

export function dueQuestionPool(questions = [], stats = {}, now = Date.now()) {
  return (Array.isArray(questions) ? questions : []).filter(question =>
    question && isQuestionDue(stats?.[String(question.id)], now));
}

export const SPACED_REPETITION_CONSTANTS = Object.freeze({ DAY_MS, MINUTE_MS, MIN_EASE, MAX_EASE });
