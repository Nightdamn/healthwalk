// Tiny per-key debounced save coordinator. Used by editors (course, tracker)
// so each field change can fire-and-forget a PATCH without exploding the
// network on every keystroke.
//
// Usage:
//   const saver = createAutoSaver(700);
//   saver.schedule('course-meta', () => patchCourseMeta(id, {title}));
//   saver.schedule('act-' + dbId, () => patchActivity(dbId, {label}));
//   const off = saver.onStateChange((s) => setStatus(s));   // 'saving'|'saved'|'error'
//   saver.flushAll();   // run any still-debounced saves now (e.g. on unmount)
//
// Each subsequent schedule(key, fn) replaces the pending fn for the same key,
// so rapid typing only fires one request once the user stops.

export function createAutoSaver(delayMs = 700) {
  const pending = new Map();      // key -> { timer, fn }
  const inFlight = new Set();     // keys with an active save promise
  const listeners = new Set();
  let lastError = null;

  const emit = () => {
    let state;
    if (lastError) state = 'error';
    else if (inFlight.size > 0 || pending.size > 0) state = 'saving';
    else state = 'saved';
    listeners.forEach(l => l(state));
  };

  const run = async (key, fn) => {
    inFlight.add(key);
    emit();
    try {
      const result = await fn();
      if (result && typeof result === 'object' && result.error) {
        lastError = result.error;
      } else {
        lastError = null;
      }
    } catch (err) {
      lastError = err?.message || String(err);
    } finally {
      inFlight.delete(key);
      emit();
    }
  };

  return {
    schedule(key, fn) {
      if (pending.has(key)) clearTimeout(pending.get(key).timer);
      const timer = setTimeout(() => {
        const cur = pending.get(key);
        if (!cur) return;
        pending.delete(key);
        run(key, cur.fn);
      }, delayMs);
      pending.set(key, { timer, fn });
      emit();
    },
    flushAll() {
      const items = Array.from(pending.entries());
      pending.clear();
      for (const [key, { timer, fn }] of items) {
        clearTimeout(timer);
        run(key, fn);
      }
    },
    cancel(key) {
      const cur = pending.get(key);
      if (cur) { clearTimeout(cur.timer); pending.delete(key); emit(); }
    },
    onStateChange(listener) {
      listeners.add(listener);
      // Fire current state immediately so the consumer doesn't render 'unknown'.
      let state;
      if (lastError) state = 'error';
      else if (inFlight.size > 0 || pending.size > 0) state = 'saving';
      else state = 'saved';
      listener(state);
      return () => listeners.delete(listener);
    },
    isClean() {
      return pending.size === 0 && inFlight.size === 0 && !lastError;
    },
    getError() { return lastError; },
    clearError() { lastError = null; emit(); },
  };
}
