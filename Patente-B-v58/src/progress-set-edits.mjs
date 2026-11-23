const CONTEXTS = ['favorites', 'completedLessons', 'reviewedLessons'];

function membership(state) {
  return {
    favorites: new Set(state?.favorites || []),
    completedLessons: new Set(state?.completedLessons || []),
    reviewedLessons: new Set(state?.reviewedLessons || [])
  };
}

/** Track explicit membership changes without stamping the initial/loaded state. */
export function createSetEditTracker(state, { now = Date.now } = {}) {
  const baseline = membership(state);
  return {
    record(current) {
      current.syncSetEdits ||= { favorites: {}, completedLessons: {}, reviewedLessons: {} };
      for (const name of CONTEXTS) {
        const present = new Set(current[name] || []);
        const ids = new Set([...baseline[name], ...present]);
        const edits = current.syncSetEdits[name] ||= {};
        for (const id of ids) {
          if (baseline[name].has(id) === present.has(id)) continue;
          const key = String(id);
          const previous = Number(edits[key]?.at) || 0;
          let at = Math.trunc(Number(now()));
          if (!Number.isFinite(at) || at <= 0) at = Date.now();
          if (previous >= at) at = previous + 1;
          edits[key] = { value: present.has(id), at };
        }
        baseline[name] = present;
      }
      return current.syncSetEdits;
    },
    reset(current = state) {
      const fresh = membership(current);
      for (const name of CONTEXTS) baseline[name] = fresh[name];
    }
  };
}
