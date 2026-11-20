import test from 'node:test';
import assert from 'node:assert/strict';
import { BUDGET_STORAGE_KEY, emptyBudget, writeBudgetIfUnchanged } from '../src/lib/storage.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)) };
}

test('guarded writes reject a stale snapshot and preserve the current budget', () => {
  const storage = memoryStorage();
  const first = writeBudgetIfUnchanged(storage, emptyBudget(), null);
  assert.equal(first.ok, true);
  const different = { ...emptyBudget(), viewCurrency: 'USD' };
  const next = writeBudgetIfUnchanged(storage, different, first.raw);
  assert.equal(next.ok, true);
  const stale = writeBudgetIfUnchanged(storage, { ...emptyBudget(), viewCurrency: 'EUR' }, first.raw);
  assert.equal(stale.ok, false);
  assert.equal(stale.conflict, true);
  assert.equal(storage.getItem(BUDGET_STORAGE_KEY), next.raw);
});

test('failed, invalid and inaccessible writes leave existing bytes untouched', () => {
  const storage = memoryStorage();
  const initial = writeBudgetIfUnchanged(storage, emptyBudget(), null);
  const original = storage.getItem(BUDGET_STORAGE_KEY);
  const invalid = writeBudgetIfUnchanged(storage, { version: 999 }, initial.raw);
  assert.equal(invalid.ok, false);
  assert.equal(storage.getItem(BUDGET_STORAGE_KEY), original);
  const failure = { getItem: storage.getItem, setItem: () => { throw new Error('quota'); } };
  assert.equal(writeBudgetIfUnchanged(failure, { ...emptyBudget(), viewCurrency: 'EUR' }, initial.raw).ok, false);
  assert.equal(storage.getItem(BUDGET_STORAGE_KEY), original);
  assert.equal(writeBudgetIfUnchanged({ getItem() { throw new Error('blocked'); } }, emptyBudget(), null).ok, false);
});

test('identical guarded writes do not rewrite storage', () => {
  const storage = memoryStorage();
  const initial = writeBudgetIfUnchanged(storage, emptyBudget(), null);
  const guarded = { getItem: storage.getItem, setItem() { throw new Error('unnecessary write'); } };
  assert.equal(writeBudgetIfUnchanged(guarded, emptyBudget(), initial.raw).ok, true);
});
