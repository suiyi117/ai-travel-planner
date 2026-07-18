(function (root) {
  const copy = value => JSON.parse(JSON.stringify(value));

  function normalizeLimit(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 50;
    return Math.max(1, Math.min(200, Math.trunc(number)));
  }

  function createHistory(initial, limit = 50) {
    return {
      past: [],
      present: copy(initial),
      future: [],
      limit: normalizeLimit(limit)
    };
  }

  function push(history, value) {
    return {
      ...history,
      past: [...history.past, copy(history.present)].slice(-history.limit),
      present: copy(value),
      future: []
    };
  }

  function restoreWithNextRevision(snapshot, present) {
    const restored = copy(snapshot);
    const revision = Number(present?.revision);
    restored.revision = Number.isSafeInteger(revision) && revision >= 0 ? revision + 1 : 1;
    return restored;
  }

  function undo(history) {
    if (history.past.length === 0) return history;
    return {
      ...history,
      past: history.past.slice(0, -1),
      present: restoreWithNextRevision(history.past.at(-1), history.present),
      future: [copy(history.present), ...history.future].slice(0, history.limit)
    };
  }

  function redo(history) {
    if (history.future.length === 0) return history;
    return {
      ...history,
      past: [...history.past, copy(history.present)].slice(-history.limit),
      present: restoreWithNextRevision(history.future[0], history.present),
      future: history.future.slice(1)
    };
  }

  root.AeroTravelHistory = Object.freeze({ createHistory, push, undo, redo });
})(typeof window !== 'undefined' ? window : globalThis);
