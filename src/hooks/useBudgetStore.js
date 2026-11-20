import { useCallback, useEffect, useRef, useState } from 'react';
import { BUDGET_STORAGE_KEY, emptyBudget, readBudget, writeBudgetIfUnchanged } from '../lib/storage.js';

// All current Kobo tabs on an origin cooperate on one exclusive writer. This is
// intentionally held for the session rather than trying to merge whole budgets.
const WRITER_LOCK = 'kobo-budget-v2-writer';
const CONFLICT_MESSAGE = 'Saved data changed outside this tab. Changes here have not been saved. Download a backup of this session, then reload to see the saved version.';
const UNSAVED_MESSAGE = 'Changes are only in this tab and have not been saved. Keep this tab open and download a backup. You can retry after browser storage is available.';

function readLocalSnapshot() {
  try {
    const storage = window.localStorage;
    const raw = storage.getItem(BUDGET_STORAGE_KEY);
    return { ...readBudget(storage, raw), raw };
  } catch {
    return { data: emptyBudget(), canWrite: false, errors: ['Browser storage is unavailable. Changes in this session will not be saved.'], migrated: false, raw: null };
  }
}

/**
 * One writer per origin, with a read-only queued tab and a fail-closed fallback.
 * UI mutations are written synchronously, not in a later React effect. A
 * compare-before-write guard also catches changes by non-cooperating old tabs or
 * other scripts in many cases; only the Web Lock makes cooperating writes safe.
 */
export default function useBudgetStore() {
  const [initial] = useState(readLocalSnapshot);
  const [data, setDataState] = useState(initial.data);
  const [readable, setReadable] = useState(initial.canWrite);
  const [readErrors, setReadErrors] = useState(initial.errors);
  const [writeError, setWriteError] = useState('');
  const [mode, setModeState] = useState('waiting');
  const [dirty, setDirtyState] = useState(false);

  const dataRef = useRef(initial.data);
  const expectedRaw = useRef(initial.raw);
  const readableRef = useRef(initial.canWrite);
  const modeRef = useRef('waiting');
  const dirtyRef = useRef(false);
  const held = useRef(false);
  const hasOwnedLock = useRef(false);

  const setMode = useCallback((value) => { modeRef.current = value; setModeState(value); }, []);
  const setDirty = useCallback((value) => { dirtyRef.current = value; setDirtyState(value); }, []);
  const conflict = useCallback(() => {
    setMode('conflict'); setDirty(true); setWriteError(CONFLICT_MESSAGE);
  }, [setDirty, setMode]);
  const isWritable = useCallback(() => held.current && modeRef.current === 'writer' && readableRef.current, []);

  const persist = useCallback((next) => {
    if (!isWritable()) return { ok: false, error: UNSAVED_MESSAGE };
    let result;
    try { result = writeBudgetIfUnchanged(window.localStorage, next, expectedRaw.current); }
    catch { result = { ok: false, error: UNSAVED_MESSAGE }; }
    if (result.ok) {
      expectedRaw.current = result.raw;
      setDirty(false); setWriteError('');
    } else if (result.conflict) {
      conflict();
    } else {
      setDirty(true); setWriteError(UNSAVED_MESSAGE);
    }
    return result;
  }, [conflict, isWritable, setDirty]);

  const update = useCallback((value) => {
    const previous = dataRef.current;
    const next = typeof value === 'function' ? value(previous) : value;
    if (next === previous) return { ok: true };
    dataRef.current = next;
    setDataState(next);
    if (isWritable()) return persist(next);
    // An already-open form may complete after a conflict or a page is resumed.
    // Preserve it in memory so the user can download it instead of discarding it.
    setDirty(true);
    if (modeRef.current !== 'conflict') setWriteError(UNSAVED_MESSAGE);
    return { ok: false, error: UNSAVED_MESSAGE };
  }, [isWritable, persist, setDirty]);

  const restore = useCallback((next) => {
    if (!held.current || modeRef.current !== 'writer') {
      return { ok: false, error: 'Restore is unavailable in this tab. Close the editable tab or resolve the storage notice first.' };
    }
    let result;
    try { result = writeBudgetIfUnchanged(window.localStorage, next, expectedRaw.current); }
    catch { result = { ok: false }; }
    if (!result.ok) {
      if (result.conflict) {
        conflict();
        return { ok: false, error: CONFLICT_MESSAGE };
      }
      return { ok: false, error: 'Restore could not be saved to browser storage. Your current budget has not been replaced.' };
    }
    expectedRaw.current = result.raw;
    dataRef.current = next; setDataState(next);
    readableRef.current = true; setReadable(true); setReadErrors([]);
    setDirty(false); setWriteError('');
    return { ok: true };
  }, [conflict, setDirty]);

  useEffect(() => {
    let active = true;
    let attempt = 0;
    let controller = null;
    let release = null;

    function applySnapshot(snapshot) {
      dataRef.current = snapshot.data; setDataState(snapshot.data);
      expectedRaw.current = snapshot.raw;
      readableRef.current = snapshot.canWrite; setReadable(snapshot.canWrite);
      setReadErrors(snapshot.errors);
    }

    function stopRequest() {
      attempt += 1;
      held.current = false;
      controller?.abort(); controller = null;
      if (release) { const unlock = release; release = null; unlock(); }
    }

    function startRequest() {
      if (!active || modeRef.current === 'conflict') return;
      if (!window.isSecureContext || !navigator.locks?.request) { setMode('unavailable'); return; }
      setMode('waiting');
      const thisAttempt = ++attempt;
      controller = new AbortController();
      try {
        const pending = navigator.locks.request(WRITER_LOCK, { mode: 'exclusive', signal: controller.signal }, async () => {
          if (!active || thisAttempt !== attempt) return;
          held.current = true;
          const latest = readLocalSnapshot();
          if (!hasOwnedLock.current) {
            // No edits are possible while the initial request waits. Read again
            // under the lock so a previous writer's last changes are included.
            applySnapshot(latest);
            hasOwnedLock.current = true;
          } else if (latest.raw !== expectedRaw.current) {
            // A page returning from the back/forward cache may still contain an
            // open form or unsaved data. Never silently replace that session.
            conflict();
          }
          if (modeRef.current !== 'conflict') {
            setMode('writer');
            // Persist migrated or initially empty data, or retry a session edit
            // that was made while access was being reacquired.
            if (readableRef.current && (latest.raw === null || dirtyRef.current)) persist(dataRef.current);
          }
          await new Promise((resolve) => {
            if (!active || thisAttempt !== attempt) { resolve(); return; }
            release = resolve;
          });
        });
        Promise.resolve(pending).catch((error) => {
          if (!active || thisAttempt !== attempt || error?.name === 'AbortError') return;
          held.current = false; setMode('unavailable');
        });
      } catch {
        if (active && thisAttempt === attempt) { held.current = false; setMode('unavailable'); }
      }
    }

    function onStorage(event) {
      if (event.key !== BUDGET_STORAGE_KEY && event.key !== null) return;
      try { if (event.storageArea !== window.localStorage) return; } catch { return; }
      if (held.current && modeRef.current === 'writer') {
        try { if (window.localStorage.getItem(BUDGET_STORAGE_KEY) !== expectedRaw.current) conflict(); }
        catch { setDirty(true); setWriteError(UNSAVED_MESSAGE); }
      } else if (!hasOwnedLock.current && !dirtyRef.current && modeRef.current !== 'conflict') {
        // A waiting tab has no edits to lose and can display the writer's data.
        applySnapshot(readLocalSnapshot());
      }
    }
    function onPageHide() {
      stopRequest();
      if (modeRef.current !== 'conflict' && modeRef.current !== 'unavailable') setMode('waiting');
    }
    function onPageShow(event) { if (event.persisted) startRequest(); }

    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    startRequest();
    return () => {
      active = false; stopRequest();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [conflict, persist, setDirty, setMode]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return {
    data, update, restore, retry: () => persist(dataRef.current), isWritable,
    mode, readable, readErrors, writeError, dirty,
    canEdit: mode === 'writer' && readable,
    canRestore: mode === 'writer',
  };
}
