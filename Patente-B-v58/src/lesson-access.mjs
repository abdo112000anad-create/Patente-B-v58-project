export const FREE_LESSON_COUNT = 5;

export function createLessonAccess(orderedKeys, freeLessonCount = FREE_LESSON_COUNT) {
  if (!Array.isArray(orderedKeys)) throw new TypeError('orderedKeys must be an array');
  if (!Number.isInteger(freeLessonCount) || freeLessonCount < 0 || freeLessonCount > orderedKeys.length) {
    throw new RangeError('freeLessonCount must be a valid lesson count');
  }

  const ranks = new Map();
  orderedKeys.forEach((key, index) => {
    if (typeof key !== 'string' || !key) throw new TypeError('lesson keys must be non-empty strings');
    if (ranks.has(key)) throw new Error(`duplicate lesson key: ${key}`);
    ranks.set(key, index);
  });
  const sessionUnlocks = new Set();
  const rankOf = key => ranks.has(key) ? ranks.get(key) : -1;
  const isFree = key => {
    const rank = rankOf(key);
    return rank >= 0 && rank < freeLessonCount;
  };
  const hasAccess = key => isFree(key) || sessionUnlocks.has(key);

  return Object.freeze({
    isFree,
    hasAccess,
    grantRewardedUnlock(key, result, isNativePlatform) {
      const rank = rankOf(key);
      if (isNativePlatform !== true || result?.rewarded !== true || rank < freeLessonCount) return false;
      sessionUnlocks.add(key);
      return true;
    },
    getSessionUnlockCount() {
      return sessionUnlocks.size;
    }
  });
}
