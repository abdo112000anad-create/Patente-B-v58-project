import { createProgressBackup, restoreProgressBackup } from './progress-backup.mjs';

const FORMAT = 'patente-b-cloud-progress';
const VERSION = 1;
const MAX_BYTES = 900_000;
const MAX_COUNT = 1_000_000_000;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const plain = o => !!o && typeof o === 'object' && !Array.isArray(o) &&
  (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);

function ensureCloudEnvelope(value) {
  let envelope = value;
  if (typeof value === 'string') {
    if (new TextEncoder().encode(value).byteLength > MAX_BYTES) throw new Error('cloud_progress_too_large');
    try { envelope = JSON.parse(value); } catch { throw new Error('cloud_progress_invalid'); }
  } else {
    let encoded;
    try { encoded = JSON.stringify(value); } catch { throw new Error('cloud_progress_invalid'); }
    if (!encoded || new TextEncoder().encode(encoded).byteLength > MAX_BYTES) throw new Error('cloud_progress_too_large');
  }
  if (!plain(envelope) || envelope.format !== FORMAT || envelope.version !== VERSION || !plain(envelope.progress)) throw new Error('cloud_progress_format');
  return envelope;
}

function normalizedEdits(raw, context) {
  const out = { favorites: Object.create(null), completedLessons: Object.create(null), reviewedLessons: Object.create(null) };
  if (raw === undefined) return out;
  if (!plain(raw) || Object.keys(raw).some(k => !['favorites','completedLessons','reviewedLessons'].includes(k))) throw new Error('cloud_progress_format');
  const groups = { favorites: context.questionIds instanceof Set ? context.questionIds : new Set(), completedLessons: context.lessonKeys instanceof Set ? context.lessonKeys : new Set(), reviewedLessons: context.lessonKeys instanceof Set ? context.lessonKeys : new Set() };
  const maxAt = Date.now() + 86_400_000;
  for (const name of Object.keys(out)) {
    const group = raw[name];
    if (group === undefined) continue;
    if (!plain(group) || Object.keys(group).length > groups[name].size) throw new Error('cloud_progress_format');
    for (const [key, item] of Object.entries(group)) {
      const id = name === 'favorites' ? Number(key) : key;
      if ((name === 'favorites' && (!Number.isSafeInteger(id) || !groups[name].has(id))) ||
          (name !== 'favorites' && !groups[name].has(key))) continue;
      if (!plain(item) || typeof item.value !== 'boolean' || !Number.isFinite(item.at) || !Number.isInteger(item.at) || item.at <= 0 || item.at > maxAt) continue;
      out[name][key] = { value: item.value, at: item.at };
    }
  }
  return out;
}

export function createCloudProgress(state, exportedAt = new Date().toISOString()) {
  const backup = JSON.parse(createProgressBackup(state, exportedAt));
  const progress = backup.progress;
  delete progress.fontSize;
  delete progress.themeMode;
  const envelope = { format: FORMAT, version: VERSION, exportedAt, progress };
  if (state.syncSetEdits !== undefined) envelope.setEdits = state.syncSetEdits;
  return JSON.stringify(envelope);
}

export function validateCloudProgress(payload, context) {
  const envelope = ensureCloudEnvelope(payload);
  const allowedTop = new Set(['format', 'version', 'exportedAt', 'progress', 'setEdits']);
  if (Object.keys(envelope).some(k => !allowedTop.has(k))) throw new Error('cloud_progress_format');
  const allowedProgress = new Set(['favorites','wrong','solved','correctCount','practiceCount','topicCorrect','topicTotal','completedLessons','reviewedLessons','sourceChecks','lastLessonKey','lastStudy','streak','questionStats','sessions','dailyGoal']);
  if (Object.keys(envelope.progress).some(k => !allowedProgress.has(k))) throw new Error('cloud_progress_format');
  const normalized = restoreProgressBackup({ format: 'patente-b-progress-backup', version: 1, exportedAt: envelope.exportedAt, progress: envelope.progress }, context);
  normalized.activeQuiz = null;
  delete normalized.fontSize;
  normalized.syncSetEdits = normalizedEdits(envelope.setEdits, context);
  return normalized;
}

function union(a, b) { return new Set([...a, ...b]); }
function maxCount(a, b) { return Math.min(MAX_COUNT, Math.max(0, Math.trunc(Number(a) || 0), Math.trunc(Number(b) || 0))); }
function mergeMap(a, b) {
  const out = Object.create(null);
  for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) out[key] = maxCount(a?.[key], b?.[key]);
  return out;
}
function statsMerge(a, b) {
  const out = Object.create(null);
  for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = a?.[key], y = b?.[key];
    if (!x) { out[key] = { ...y }; continue; }
    if (!y) { out[key] = { ...x }; continue; }
    const latest = y.lastAnsweredAt > x.lastAnsweredAt ? y : x;
    const tied = x.lastAnsweredAt === y.lastAnsweredAt;
    out[key] = { correct: latest.correct, wrong: latest.wrong,
      streak: tied ? Math.max(x.streak, y.streak) : latest.streak,
      repetitions: tied ? Math.min(x.repetitions, y.repetitions) : latest.repetitions,
      lapses: tied ? Math.max(x.lapses, y.lapses) : latest.lapses,
      easeFactor: tied ? Math.min(x.easeFactor, y.easeFactor) : latest.easeFactor,
      intervalDays: tied ? Math.min(x.intervalDays, y.intervalDays) : latest.intervalDays,
      retryDelayMinutes: tied ? Math.max(x.retryDelayMinutes, y.retryDelayMinutes) : latest.retryDelayMinutes,
      lastAnsweredAt: Math.max(x.lastAnsweredAt,y.lastAnsweredAt),
      nextReviewAt: tied ? Math.min(x.nextReviewAt, y.nextReviewAt) : latest.nextReviewAt };
  }
  return out;
}
function mergeSessions(a, b) {
  const byKey = new Map();
  for (const item of [...(a || []), ...(b || [])]) {
    const key = `${item.at}|${item.mode}|${item.total}|${item.lessonKey}|${item.answered}|${item.right}|${item.wrong}`;
    byKey.set(key, item);
  }
  return [...byKey.values()].sort((x,y) => y.at-x.at).slice(0,20);
}

function mergeDailyGoal(a, b) {
  if (!a?.date) return b || {date: '', questions: 0, lessons: 0};
  if (!b?.date || a.date > b.date) return a;
  if (b.date > a.date) return b;
  return {date: a.date, questions: Math.max(a.questions, b.questions), lessons: Math.max(a.lessons, b.lessons)};
}
function mergeMembership(name, localSet, remoteSet, localEdits, remoteEdits) {
  const merged = union(localSet, remoteSet);
  const edits = Object.create(null);
  for (const key of new Set([...Object.keys(localEdits?.[name] || {}), ...Object.keys(remoteEdits?.[name] || {})])) {
    const a = localEdits?.[name]?.[key], b = remoteEdits?.[name]?.[key];
    const selected = !a ? b : !b ? a : b.at > a.at ? b : a.at > b.at ? a : { value: a.value && b.value, at: a.at };
    edits[key] = { ...selected };
    const id = name === 'favorites' ? Number(key) : key;
    if (selected.value) merged.add(id); else merged.delete(id);
  }
  return { set: merged, edits };
}

/** Merge local and cloud progress. Counters remain conservative max snapshots, never sums. */
export function mergeCloudProgress(localState, remotePayload, context) {
  const remote = validateCloudProgress(remotePayload, context);
  const local = validateCloudProgress(JSON.parse(createCloudProgress(localState)), context);
  const questionStats = statsMerge(local.questionStats, remote.questionStats);
  const wrong = union(local.wrong, remote.wrong);
  for (const [id, stat] of Object.entries(questionStats)) {
    const l = local.questionStats[id], r = remote.questionStats[id];
    if (!l || !r || l.lastAnsweredAt !== r.lastAnsweredAt) {
      const newest = !l || (r && r.lastAnsweredAt > l.lastAnsweredAt) ? r : l;
      if (!newest) continue;
      const newestWrong = r && (!l || r.lastAnsweredAt > l.lastAnsweredAt) ? remote.wrong : local.wrong;
      if (newestWrong.has(Number(id))) wrong.add(Number(id)); else wrong.delete(Number(id));
    } else if (l.lastAnsweredAt > 0) {
      if (local.wrong.has(Number(id)) || remote.wrong.has(Number(id))) wrong.add(Number(id));
      else wrong.delete(Number(id));
    }
  }
  const favorites = mergeMembership('favorites', local.favorites, remote.favorites, local.syncSetEdits, remote.syncSetEdits);
  const completed = mergeMembership('completedLessons', local.completedLessons, remote.completedLessons, local.syncSetEdits, remote.syncSetEdits);
  const reviewed = mergeMembership('reviewedLessons', local.reviewedLessons, remote.reviewedLessons, local.syncSetEdits, remote.syncSetEdits);
  return {
    ...local, favorites: favorites.set, wrong,
    solved: union(local.solved, remote.solved), completedLessons: completed.set, reviewedLessons: reviewed.set,
    correctCount: maxCount(local.correctCount, remote.correctCount), practiceCount: maxCount(local.practiceCount, remote.practiceCount),
    topicCorrect: mergeMap(local.topicCorrect, remote.topicCorrect), topicTotal: mergeMap(local.topicTotal, remote.topicTotal),
    sourceChecks: { ...remote.sourceChecks, ...local.sourceChecks },
    lastLessonKey: local.lastLessonKey || remote.lastLessonKey,
    lastStudy: local.lastStudy > remote.lastStudy ? local.lastStudy : remote.lastStudy,
    streak: maxCount(local.streak, remote.streak), questionStats,
    dailyGoal: mergeDailyGoal(local.dailyGoal, remote.dailyGoal),
    syncSetEdits: { favorites: favorites.edits, completedLessons: completed.edits, reviewedLessons: reviewed.edits },
    sessions: mergeSessions(local.sessions, remote.sessions), fontSize: localState.fontSize, activeQuiz: localState.activeQuiz ?? null
  };
}
