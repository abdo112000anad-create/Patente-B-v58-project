const FORMAT = 'patente-b-progress-backup';
const VERSION = 1;
const MAX_FILE_BYTES = 2_000_000;
const MAX_COUNT = 1_000_000_000;
const VALID_MODES = new Set([
  'exam', 'visual', 'smart', 'custom', 'topic', 'lesson-review', 'due',
  'mistakes', 'favorites', 'practice', 'single'
]);

function safeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(MAX_COUNT, Math.trunc(number))) : 0;
}

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function countMap(value, allowedKeys) {
  const result = Object.create(null);
  if (!plainObject(value)) return result;
  for (const key of allowedKeys) {
    if (Object.hasOwn(value, key)) result[key] = safeCount(value[key]);
  }
  return result;
}

function idSet(value, allowedIds) {
  if (!Array.isArray(value) || allowedIds.size === 0) return new Set();
  const result = new Set();
  for (const rawId of value) {
    const id = Number(rawId);
    if (Number.isSafeInteger(id) && allowedIds.has(id)) result.add(id);
    if (result.size === allowedIds.size) break;
  }
  return result;
}

function lessonSet(value, allowedLessons) {
  if (!Array.isArray(value) || allowedLessons.size === 0) return new Set();
  const result = new Set();
  for (const key of value) {
    if (typeof key === 'string' && allowedLessons.has(key)) result.add(key);
    if (result.size === allowedLessons.size) break;
  }
  return result;
}

function dateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

function normalizeDailyGoal(value) {
  return plainObject(value) ? {date: dateKey(value.date), questions: safeCount(value.questions), lessons: safeCount(value.lessons)}
    : {date: '', questions: 0, lessons: 0};
}

function normalizeThemeMode(value) { return value === 'dark' ? 'dark' : 'system'; }

function validTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 99_999_999_999_999
    ? Math.trunc(number) : 0;
}

function normalizeQuestionStats(value, allowedIds) {
  const result = Object.create(null);
  if (!plainObject(value)) return result;
  for (const [key, item] of Object.entries(value).slice(0, allowedIds.size)) {
    const id = Number(key);
    if (!Number.isSafeInteger(id) || !allowedIds.has(id) || !plainObject(item)) continue;
    result[String(id)] = {
      correct: safeCount(item.correct),
      wrong: safeCount(item.wrong),
      streak: Math.min(6, safeCount(item.streak)),
      repetitions: Math.min(1000, safeCount(item.repetitions ?? item.streak)),
      lapses: safeCount(item.lapses ?? item.wrong),
      easeFactor: Number.isFinite(Number(item.easeFactor)) ? Math.max(1.3, Math.min(2.8, Number(item.easeFactor))) : 2.5,
      intervalDays: Number.isFinite(Number(item.intervalDays)) ? Math.max(0, Math.min(3650, Number(item.intervalDays))) : 0,
      retryDelayMinutes: Number.isFinite(Number(item.retryDelayMinutes)) ? Math.max(0, Math.min(90, Number(item.retryDelayMinutes))) : 0,
      lastAnsweredAt: validTimestamp(item.lastAnsweredAt),
      nextReviewAt: validTimestamp(item.nextReviewAt)
    };
  }
  return result;
}

function normalizeSessions(value, allowedLessons) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap(item => {
    if (!plainObject(item) || !VALID_MODES.has(item.mode)) return [];
    const total = safeCount(item.total);
    const answered = safeCount(item.answered ?? total);
    const right = safeCount(item.right);
    const wrong = safeCount(item.wrong);
    if (total < 1 || total > 50 || answered > total || right > answered || wrong > answered) return [];
    return [{
      at: validTimestamp(item.at), mode: item.mode, total, answered, right, wrong,
      passed: typeof item.passed === 'boolean' ? item.passed : null,
      lessonKey: typeof item.lessonKey === 'string' && allowedLessons.has(item.lessonKey) ? item.lessonKey : '',
      lessonTitle: typeof item.lessonTitle === 'string' ? item.lessonTitle.slice(0, 180) : ''
    }];
  });
}

function normalizeSourceChecks(value, allowedIds) {
  const result = Object.create(null);
  if (!plainObject(value)) return result;
  for (const [key, item] of Object.entries(value)) {
    if (allowedIds.has(key) && plainObject(item) && typeof item.correct === 'boolean') {
      result[key] = { correct: item.correct };
    }
  }
  return result;
}

export function createProgressBackup(state, exportedAt = new Date().toISOString()) {
  const progress = {
    favorites: [...(state.favorites || [])],
    wrong: [...(state.wrong || [])],
    solved: [...(state.solved || [])],
    correctCount: safeCount(state.correctCount),
    practiceCount: safeCount(state.practiceCount),
    topicCorrect: state.topicCorrect || {},
    topicTotal: state.topicTotal || {},
    completedLessons: [...(state.completedLessons || [])],
    reviewedLessons: [...(state.reviewedLessons || [])],
    sourceChecks: state.sourceChecks || {},
    lastLessonKey: state.lastLessonKey || '',
    lastStudy: state.lastStudy || '',
    streak: safeCount(state.streak),
    questionStats: state.questionStats || {},
    sessions: state.sessions || [],
    dailyGoal: normalizeDailyGoal(state.dailyGoal),
    themeMode: normalizeThemeMode(state.themeMode),
    fontSize: [16, 18, 20, 22].includes(Number(state.fontSize)) ? Number(state.fontSize) : 16
  };
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt, progress }, null, 2);
}

export function restoreProgressBackup(payload, context) {
  if (!plainObject(payload) || payload.format !== FORMAT || payload.version !== VERSION || !plainObject(payload.progress)) {
    throw new Error('backup_format');
  }
  const progress = payload.progress;
  const allowedIds = context.questionIds instanceof Set ? context.questionIds : new Set();
  const allowedLessons = context.lessonKeys instanceof Set ? context.lessonKeys : new Set();
  const allowedTopics = context.topics instanceof Set ? context.topics : new Set();
  const allowedSourceChecks = context.sourceCheckIds instanceof Set ? context.sourceCheckIds : new Set();
  const lastLessonKey = typeof progress.lastLessonKey === 'string' && allowedLessons.has(progress.lastLessonKey)
    ? progress.lastLessonKey : '';

  return {
    favorites: idSet(progress.favorites, allowedIds),
    wrong: idSet(progress.wrong, allowedIds),
    solved: idSet(progress.solved, allowedIds),
    correctCount: safeCount(progress.correctCount),
    practiceCount: safeCount(progress.practiceCount),
    topicCorrect: countMap(progress.topicCorrect, allowedTopics),
    topicTotal: countMap(progress.topicTotal, allowedTopics),
    completedLessons: lessonSet(progress.completedLessons, allowedLessons),
    reviewedLessons: lessonSet(progress.reviewedLessons, allowedLessons),
    sourceChecks: normalizeSourceChecks(progress.sourceChecks, allowedSourceChecks),
    lastLessonKey,
    lastStudy: dateKey(progress.lastStudy),
    streak: safeCount(progress.streak),
    questionStats: normalizeQuestionStats(progress.questionStats, allowedIds),
    sessions: normalizeSessions(progress.sessions, allowedLessons),
    dailyGoal: normalizeDailyGoal(progress.dailyGoal),
    themeMode: normalizeThemeMode(progress.themeMode),
    activeQuiz: null,
    fontSize: [16, 18, 20, 22].includes(Number(progress.fontSize)) ? Number(progress.fontSize) : 16
  };
}

export function initializeProgressBackup({ readState, replaceState, getContext, onImported }) {
  const openButton = document.querySelector('#progressBackupButton');
  const dialog = document.querySelector('#progressBackupDialog');
  const exportButton = document.querySelector('#exportProgress');
  const importButton = document.querySelector('#importProgress');
  const input = document.querySelector('#importProgressInput');
  const status = document.querySelector('#progressBackupStatus');
  if (!openButton || !dialog || !exportButton || !importButton || !input || !status) return;

  const report = (it, ar) => {
    status.textContent = `${it} · ${ar}`;
  };
  openButton.disabled = false;
  openButton.addEventListener('click', () => {
    try {
      const probe = `__patente_b_storage_${Date.now()}__`;
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      report('Browser storage is available.', 'تخزين المتصفح متاح.');
    } catch {
      report('Browser storage is unavailable; export a backup before closing this tab.', 'تخزين المتصفح غير متاح؛ صدّر نسخة احتياطية قبل إغلاق الصفحة.');
    }
    dialog.showModal();
  });
  exportButton.addEventListener('click', () => {
    try {
      const blob = new Blob([createProgressBackup(readState())], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `patente-b-progress-${new Date().toISOString().slice(0, 10)}.json`;
      link.style.display = 'none';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      report('Backup downloaded to your device.', 'تم تنزيل النسخة الاحتياطية إلى جهازك.');
    } catch {
      report('Could not export progress.', 'تعذّر تصدير التقدم.');
    }
  });
  importButton.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('backup_too_large');
      const payload = JSON.parse(await file.text());
      const restored = restoreProgressBackup(payload, getContext());
      const approved = window.confirm('Replace the saved study progress with this backup? Your unfinished session on this device will be kept.\n\nهل تريد استبدال تقدم الدراسة المحفوظ بهذه النسخة؟ ستبقى الجلسة غير المكتملة على هذا الجهاز.');
      if (!approved) return;
      const existing = readState();
      restored.activeQuiz = existing.activeQuiz;
      const saved = replaceState(restored);
      onImported?.();
      report(saved === false
        ? 'Imported for this session, but browser storage could not save it.'
        : 'Study progress restored successfully.',
      saved === false
        ? 'تمت الاستعادة لهذه الجلسة، لكن تعذّر حفظها في تخزين المتصفح.'
        : 'تمت استعادة التقدم بنجاح.');
    } catch (error) {
      report(error.message === 'backup_too_large'
        ? 'This backup file is too large.'
        : 'The backup is invalid or cannot be read.',
      error.message === 'backup_too_large'
        ? 'حجم ملف النسخة الاحتياطية أكبر من المسموح.'
        : 'ملف النسخة الاحتياطية غير صالح أو تعذّرت قراءته.');
    } finally {
      input.value = '';
    }
  });
}
