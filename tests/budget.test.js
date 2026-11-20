import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmountToKobo, isValidDate, isValidMonth, shiftMonth, dateForMonth,
  validateDraft, calculateMonthlySummary, calculateTargetStatus, makeSampleTransactions, transactionsToCsv,
  isValidStoredTransaction, MAX_AMOUNT_KOBO,
} from '../src/lib/budget.js';
import { readSavedTransactions, writeSavedTransactions, readSavedTargets, writeSavedTargets, STORAGE_KEY, TARGET_STORAGE_KEY } from '../src/lib/storage.js';

const tx = (overrides = {}) => ({
  id: 'a', type: 'expense', amountKobo: 1_200_00, category: 'food', date: '2026-11-12',
  description: '', createdAt: '2026-11-12T10:00:00.000Z', sample: false, ...overrides,
});

test('amounts parse to exact integer kobo, including leading zeroes', () => {
  assert.deepEqual(parseAmountToKobo('0.01'), { ok: true, kobo: 1 });
  assert.equal(parseAmountToKobo('0005.5').kobo, 550);
  assert.equal(parseAmountToKobo(' 5000.50 ').kobo, 500050);
  assert.equal(parseAmountToKobo('999999999.99').kobo, MAX_AMOUNT_KOBO);
  for (const value of ['', '0', '0.00', '-1', '.5', '1.001', '1,000', '1e3', '1000000000', 'Infinity']) {
    assert.equal(parseAmountToKobo(value).ok, false, value);
  }
});

test('calendar dates and month navigation are validated without local timezone shifts', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2025-02-29'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('1899-12-31'), false);
  assert.equal(isValidMonth('2026-11'), true);
  assert.equal(isValidMonth('2026-00'), false);
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('1900-01', -1), '1900-01');
  assert.equal(dateForMonth('2026-11', '2026-11-11'), '2026-11-11');
  assert.equal(dateForMonth('2026-10', '2026-11-11'), '2026-10-01');
});

test('draft requires a matching category, valid date and positive amount', () => {
  const valid = { type: 'expense', category: 'food', amount: '12.34', date: '2026-11-11', description: '  tea  ' };
  assert.deepEqual(validateDraft(valid), { ok: true, value: { type: 'expense', amountKobo: 1234, category: 'food', date: '2026-11-11', description: 'tea' } });
  assert.equal(validateDraft({ ...valid, type: 'income' }).errors.category !== undefined, true);
  assert.equal(validateDraft({ ...valid, date: '2026-02-30' }).errors.date !== undefined, true);
  assert.equal(validateDraft({ ...valid, amount: '0' }).errors.amount !== undefined, true);
});

test('selected-month totals and expense-only category shares are correct', () => {
  const entries = [
    tx({ id: '1', type: 'income', category: 'salary', amountKobo: 10_000_00 }),
    tx({ id: '2', amountKobo: 1_200_00 }),
    tx({ id: '3', category: 'transport', amountKobo: 800_00 }),
    tx({ id: '4', type: 'income', category: 'salary', date: '2026-10-31', amountKobo: 999_000_00 }),
  ];
  const result = calculateMonthlySummary(entries, '2026-11');
  assert.equal(result.income, 1_000_000);
  assert.equal(result.expense, 200_000);
  assert.equal(result.net, 800_000);
  assert.equal(result.entries.length, 3);
  assert.equal(result.breakdown[0].label, 'Food & groceries');
  assert.equal(result.breakdown[0].percentage, 60);
  assert.equal(result.breakdown[1].percentage, 40);
  assert.equal(calculateMonthlySummary(entries, '2026-12').net, 0);
});

test('negative net is allowed and does not carry forward', () => {
  const result = calculateMonthlySummary([tx()], '2026-11');
  assert.equal(result.net, -120000);
  assert.equal(calculateMonthlySummary([tx()], '2026-12').net, 0);
});

test('sample data belongs to the requested month and is explicitly marked', () => {
  const samples = makeSampleTransactions('2026-02');
  assert.ok(samples.length > 1);
  assert.ok(samples.every((item) => item.sample && item.date.startsWith('2026-02-') && isValidStoredTransaction(item)));
  assert.equal(new Set(samples.map((item) => item.id)).size, samples.length);
});

test('CSV escapes quotes and spreadsheet formulas', () => {
  const csv = transactionsToCsv([tx({ description: '=1+1, "hello"' })]);
  assert.match(csv, /"'=1\+1, ""hello"""/);
  assert.match(csv, /"1200\.00"/);
});

test('storage round-trips and does not silently erase corrupt saved data', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value) };
  assert.equal(readSavedTransactions(storage).canWrite, true);
  assert.equal(writeSavedTransactions(storage, [tx()]).ok, true);
  assert.equal(readSavedTransactions(storage).transactions.length, 1);
  data.set(STORAGE_KEY, 'not JSON');
  const result = readSavedTransactions(storage);
  assert.equal(result.canWrite, false);
  assert.equal(data.get(STORAGE_KEY), 'not JSON');
  assert.equal(writeSavedTransactions({ setItem() { throw new Error('no storage'); } }, []).ok, false);
});

test('target status compares expenses only and handles under, equal and over target', () => {
  assert.equal(calculateTargetStatus(0, undefined), null);
  assert.equal(calculateTargetStatus(0, 0), null);
  assert.equal(calculateTargetStatus(-1, 100), null);
  assert.deepEqual(calculateTargetStatus(500, 2_000), {
    targetKobo: 2_000, spentKobo: 500, remainingKobo: 1_500, overKobo: 0,
    percentage: 25, progressPercentage: 25,
  });
  const exact = calculateTargetStatus(2_000, 2_000);
  assert.equal(exact.remainingKobo, 0);
  assert.equal(exact.overKobo, 0);
  assert.equal(exact.percentage, 100);
  const over = calculateTargetStatus(3_000, 2_000);
  assert.equal(over.remainingKobo, 0);
  assert.equal(over.overKobo, 1_000);
  assert.equal(over.percentage, 150);
  assert.equal(over.progressPercentage, 100);
});

test('targets persist separately by month and corrupt targets never overwrite transactions', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value) };
  writeSavedTransactions(storage, [tx()]);
  const originalTransactions = data.get(STORAGE_KEY);
  assert.equal(readSavedTargets(storage).canWrite, true);
  assert.equal(writeSavedTargets(storage, { '2026-11': 5_000_00, '2026-12': 7_000_00 }).ok, true);
  const result = readSavedTargets(storage);
  assert.equal(result.targets['2026-11'], 500000);
  assert.equal(result.targets['2026-12'], 700000);
  assert.equal(result.targets['2027-01'], undefined);
  assert.equal(data.get(STORAGE_KEY), originalTransactions);
  data.set(TARGET_STORAGE_KEY, '{broken');
  assert.equal(readSavedTargets(storage).canWrite, false);
  assert.equal(data.get(TARGET_STORAGE_KEY), '{broken');
  assert.equal(data.get(STORAGE_KEY), originalTransactions);
  data.set(TARGET_STORAGE_KEY, JSON.stringify({ version: 1, targets: { '2026-13': 5 } }));
  assert.equal(readSavedTargets(storage).canWrite, false);
  assert.equal(writeSavedTargets({ setItem() { throw new Error('no storage'); } }, {}).ok, false);
});
