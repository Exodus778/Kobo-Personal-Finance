import { isValidMonth, isValidStoredTransaction, MAX_AMOUNT_KOBO } from './budget.js';

export const STORAGE_KEY = 'kobo.budget.transactions.v1';
export const TARGET_STORAGE_KEY = 'kobo.budget.targets.v1';

/** A read error blocks writing, so malformed saved data is not silently erased. */
export function readSavedTransactions(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { transactions: [], canWrite: true, error: null };
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.transactions) || !data.transactions.every((entry) => entry?.currency === undefined && entry?.amountMinor === undefined && isValidStoredTransaction(entry))) {
      throw new Error('Unsupported or invalid saved data');
    }
    const ids = new Set(data.transactions.map((transaction) => transaction.id));
    if (ids.size !== data.transactions.length) throw new Error('Duplicate transaction IDs');
    return { transactions: data.transactions, canWrite: true, error: null };
  } catch {
    return {
      transactions: [],
      canWrite: false,
      error: 'Saved transactions could not be read. They have not been overwritten; new entries in this session will not be saved.',
    };
  }
}

export function writeSavedTransactions(storage, transactions) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, transactions }));
    return { ok: true };
  } catch {
    return { ok: false, error: 'Unable to save transactions in this browser. Keep this tab open and export your entries to avoid losing them.' };
  }
}

/** Targets have their own key so an upgrade never rewrites existing transactions. */
export function readSavedTargets(storage) {
  try {
    const raw = storage.getItem(TARGET_STORAGE_KEY);
    if (raw === null) return { targets: {}, canWrite: true, error: null };
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !data.targets || typeof data.targets !== 'object' || Array.isArray(data.targets)) {
      throw new Error('Unsupported or invalid saved targets');
    }
    const valid = Object.entries(data.targets).every(([month, amount]) =>
      isValidMonth(month) && Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_AMOUNT_KOBO
    );
    if (!valid) throw new Error('Invalid target');
    return { targets: data.targets, canWrite: true, error: null };
  } catch {
    return {
      targets: {},
      canWrite: false,
      error: 'Saved targets could not be read. They have not been overwritten; targets entered in this session will not be saved.',
    };
  }
}

export function writeSavedTargets(storage, targets) {
  try {
    storage.setItem(TARGET_STORAGE_KEY, JSON.stringify({ version: 1, targets }));
    return { ok: true };
  } catch {
    return { ok: false, error: 'Unable to save spending targets in this browser. Targets entered in this session may be lost when you close the tab.' };
  }
}

// Version 2 is a single atomic localStorage document. The original v1 keys are
// never removed or modified during migration, so an upgrade remains recoverable.
import { DEFAULT_CURRENCY, isCurrency, maxAmountMinor } from './currency.js';
import { isValidRate, rateKey } from './rates.js';

export const BUDGET_STORAGE_KEY = 'kobo.budget.data.v2';
export const BACKUP_FORMAT = 'kobo-budget-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export function emptyBudget() {
  return { version: 2, transactions: [], months: {}, rateCache: {}, viewCurrency: DEFAULT_CURRENCY };
}

export function isValidBudget(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== 2 || !isCurrency(data.viewCurrency)) return false;
  if (!Array.isArray(data.transactions) || !data.transactions.every((entry) =>
    isValidStoredTransaction(entry) && isCurrency(entry.currency) && Number.isSafeInteger(entry.amountMinor) &&
    entry.rates && typeof entry.rates === 'object' && !Array.isArray(entry.rates) && entry.amountKobo === undefined)) return false;
  if (new Set(data.transactions.map((entry) => entry.id)).size !== data.transactions.length) return false;
  if (!data.months || typeof data.months !== 'object' || Array.isArray(data.months) ||
    !Object.entries(data.months).every(([month, setting]) => isValidMonth(month) && setting && typeof setting === 'object' && !Array.isArray(setting) &&
      isCurrency(setting.currency) && (setting.targetMinor === null || (Number.isSafeInteger(setting.targetMinor) && setting.targetMinor > 0 && setting.targetMinor <= maxAmountMinor(setting.currency))))) return false;
  if (!data.rateCache || typeof data.rateCache !== 'object' || Array.isArray(data.rateCache) ||
    !Object.entries(data.rateCache).every(([key, rate]) => rate && rate.kind === 'automatic' &&
      isValidRate(rate, rate.from, rate.to, rate.date) && key === rateKey(rate.date, rate.from, rate.to))) return false;
  return true;
}

export function readBudget(storage, snapshotRaw = undefined) {
  try {
    // Supplying the raw value lets the caller associate data and its version
    // with the exact same read, rather than reading twice across a change.
    const raw = snapshotRaw === undefined ? storage.getItem(BUDGET_STORAGE_KEY) : snapshotRaw;
    if (raw !== null) {
      const data = JSON.parse(raw);
      if (!isValidBudget(data)) throw new Error('Invalid v2 budget');
      return { data, canWrite: true, errors: [], migrated: false };
    }
    const transactionsResult = readSavedTransactions(storage);
    const targetsResult = readSavedTargets(storage);
    const transactions = transactionsResult.transactions.map(({ amountKobo, ...entry }) => ({ ...entry, amountMinor: amountKobo, currency: 'NGN', rates: {} }));
    const months = Object.fromEntries(Object.entries(targetsResult.targets).map(([month, targetMinor]) => [month, { currency: 'NGN', targetMinor }]));
    const data = { ...emptyBudget(), transactions, months };
    if (!isValidBudget(data)) throw new Error('Invalid legacy data');
    return { data, canWrite: transactionsResult.canWrite && targetsResult.canWrite,
      errors: [transactionsResult.error, targetsResult.error].filter(Boolean), migrated: transactions.length > 0 || Object.keys(months).length > 0 };
  } catch {
    return { data: emptyBudget(), canWrite: false, migrated: false,
      errors: ['Saved budget data could not be read. The original data has not been overwritten; changes in this session will not be saved. Restore a valid backup to replace it.'] };
  }
}

/** Uncoordinated compatibility helper; the app uses the guarded writer under a Web Lock instead. */
export function writeBudget(storage, data) {
  try {
    if (!isValidBudget(data)) throw new Error('Invalid budget');
    storage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch {
    return { ok: false, error: 'Unable to save the full budget in this browser. Keep this tab open and download a backup to protect your changes.' };
  }
}

/**
 * Refuse a known-stale write. Callers must also serialize cooperating tabs with
 * Web Locks: localStorage's getItem + setItem is not an atomic compare-and-swap.
 */
export function writeBudgetIfUnchanged(storage, data, expectedRaw) {
  try {
    const current = storage.getItem(BUDGET_STORAGE_KEY);
    if (current !== expectedRaw) return { ok: false, conflict: true,
      error: 'Saved data changed outside this tab. Changes here have not been saved. Download a backup of this session, then reload to see the saved version.' };
    if (!isValidBudget(data)) throw new Error('Invalid budget');
    const raw = JSON.stringify(data);
    if (current !== raw) storage.setItem(BUDGET_STORAGE_KEY, raw);
    return { ok: true, raw };
  } catch {
    return { ok: false, conflict: false, error: 'Unable to save the full budget in this browser. Keep this tab open and download a backup to protect your changes.' };
  }
}

export function createBackup(data, date = new Date()) {
  if (!isValidBudget(data)) throw new Error('Cannot back up invalid data');
  return JSON.stringify({ format: BACKUP_FORMAT, backupVersion: BACKUP_VERSION, exportedAt: date.toISOString(), data }, null, 2);
}

export function parseBackup(text) {
  try {
    const value = JSON.parse(text);
    if (value?.format !== BACKUP_FORMAT || value?.backupVersion !== BACKUP_VERSION || !isValidBudget(value?.data)) throw new Error('Invalid backup');
    return { ok: true, data: value.data, exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '' };
  } catch {
    return { ok: false, error: 'This is not a valid Kobo backup, or it contains unsupported or damaged data. Nothing was changed.' };
  }
}
