/** Budget calculations are pure: no DOM, network, or React state. */
import { DEFAULT_CURRENCY, formatMoney, isCurrency, maxAmountMinor, minorToInput, parseAmount, convertMinor } from './currency.js';
import { isValidDate, isValidMonth } from './dates.js';
import { isValidRate, rateKey } from './rates.js';
export { MIN_DATE, MAX_DATE, localToday, isValidDate, isValidMonth, shiftMonth, formatMonth, formatDate, dateForMonth } from './dates.js';

export const CATEGORIES = {
  expense: [
    { id: 'food', label: 'Food & groceries', color: '#d99068', icon: 'food' },
    { id: 'transport', label: 'Transport', color: '#83aa91', icon: 'transport' },
    { id: 'housing', label: 'Housing', color: '#76949a', icon: 'housing' },
    { id: 'bills', label: 'Bills & utilities', color: '#d1b35f', icon: 'bills' },
    { id: 'data', label: 'Data & airtime', color: '#89a5c3', icon: 'data' },
    { id: 'health', label: 'Health', color: '#cd918d', icon: 'health' },
    { id: 'shopping', label: 'Shopping', color: '#ad98c1', icon: 'shopping' },
    { id: 'family', label: 'Family & support', color: '#d1aa87', icon: 'family' },
    { id: 'entertainment', label: 'Entertainment', color: '#a4a86d', icon: 'entertainment' },
    { id: 'education', label: 'Education', color: '#b69b82', icon: 'education' },
    { id: 'other-expense', label: 'Other', color: '#a5aba4', icon: 'other' },
  ],
  income: [
    { id: 'salary', label: 'Salary', color: '#7aa98d', icon: 'salary' },
    { id: 'business', label: 'Business', color: '#86a8a3', icon: 'business' },
    { id: 'freelance', label: 'Freelance', color: '#b39a82', icon: 'freelance' },
    { id: 'gift', label: 'Gift', color: '#c79593', icon: 'gift' },
    { id: 'other-income', label: 'Other income', color: '#a5aba4', icon: 'other' },
  ],
};

// Backwards-compatible limit and helpers for the original naira-only implementation.
export const MAX_AMOUNT_KOBO = 99_999_999_999;
export function parseAmountToKobo(raw) {
  const result = parseAmount(raw, 'NGN');
  return result.ok ? { ok: true, kobo: result.minor } : result;
}
export function formatNaira(kobo) { return formatMoney(kobo, 'NGN'); }
export function koboToInput(kobo) { return minorToInput(kobo, 'NGN'); }
export function getCategory(type, id) { return CATEGORIES[type]?.find((category) => category.id === id) ?? null; }
export function transactionCurrency(transaction) { return transaction.currency ?? 'NGN'; }
export function transactionAmount(transaction) { return transaction.amountMinor ?? transaction.amountKobo; }
export function monthSettings(months, month) {
  return months[month] ?? { currency: DEFAULT_CURRENCY, targetMinor: null };
}

/** Validate a transaction using the currency-specific precision. */
export function validateDraft(draft) {
  const errors = {};
  const currency = draft.currency ?? 'NGN';
  if (!['income', 'expense'].includes(draft.type)) errors.type = 'Choose income or expense.';
  if (!isCurrency(currency)) errors.currency = 'Choose a supported currency.';
  const amountResult = parseAmount(draft.amount, currency);
  if (!amountResult.ok) errors.amount = amountResult.error;
  if (!getCategory(draft.type, draft.category)) errors.category = 'Choose a category for this type.';
  if (!isValidDate(draft.date)) errors.date = 'Enter a valid date from 1900 through 2100.';
  const description = typeof draft.description === 'string' ? draft.description.trim() : '';
  if (description.length > 80) errors.description = 'Keep the description to 80 characters or less.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const value = { type: draft.type, category: draft.category, date: draft.date, description };
  // Existing integrations that omit currency still receive the original payload.
  if (draft.currency === undefined) value.amountKobo = amountResult.minor;
  else { value.amountMinor = amountResult.minor; value.currency = currency; }
  return { ok: true, value };
}

export function isValidStoredTransaction(transaction) {
  if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) return false;
  const currency = transactionCurrency(transaction);
  const amount = transactionAmount(transaction);
  if (!(typeof transaction.id === 'string' && transaction.id.length > 0 && transaction.id.length <= 200 &&
    ['income', 'expense'].includes(transaction.type) && isCurrency(currency) &&
    Number.isSafeInteger(amount) && amount > 0 && amount <= maxAmountMinor(currency) &&
    getCategory(transaction.type, transaction.category) && isValidDate(transaction.date) &&
    typeof transaction.description === 'string' && transaction.description.length <= 80 &&
    typeof transaction.createdAt === 'string' && transaction.createdAt.length <= 100 &&
    (transaction.sample === undefined || typeof transaction.sample === 'boolean'))) return false;
  if (transaction.rates === undefined) return true; // Version 1 entries have no FX data.
  return Boolean(transaction.rates && typeof transaction.rates === 'object' && !Array.isArray(transaction.rates) &&
    Object.entries(transaction.rates).every(([to, rate]) => isValidRate(rate, currency, to, transaction.date)));
}

export function sortTransactions(transactions) {
  return [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

/** Rates always describe original -> requested currency. A manual rate applies only to its own pair. */
export function transactionConversion(transaction, to) {
  const from = transactionCurrency(transaction);
  const amount = transactionAmount(transaction);
  if (from === to) return { amount, rate: null, reason: null };
  const rate = transaction.rates?.[to];
  if (!isValidRate(rate, from, to, transaction.date)) return { amount: null, rate: null, reason: 'missing-rate' };
  const converted = convertMinor(amount, from, to, rate.rate);
  if (converted === null) return { amount: null, rate, reason: 'too-large' };
  return { amount: converted, rate, reason: null };
}

/** Month-only totals. Missing/unsafe conversions are explicitly excluded and counted. */
export function calculateMonthlySummary(transactions, month, currency = 'NGN') {
  const entries = sortTransactions(transactions.filter((transaction) => transaction.date.slice(0, 7) === month));
  let income = 0; let expense = 0; let incomeCount = 0; let expenseCount = 0;
  const missing = [];
  const categoryTotals = new Map();
  for (const transaction of entries) {
    if (transaction.type === 'income') incomeCount += 1;
    else expenseCount += 1;
    const conversion = transactionConversion(transaction, currency);
    const current = transaction.type === 'income' ? income : expense;
    if (conversion.amount === null || !Number.isSafeInteger(current + conversion.amount)) {
      missing.push({ transaction, currency, reason: conversion.reason || 'total-too-large' });
      continue;
    }
    if (transaction.type === 'income') income += conversion.amount;
    else {
      expense += conversion.amount;
      categoryTotals.set(transaction.category, (categoryTotals.get(transaction.category) ?? 0) + conversion.amount);
    }
  }
  const breakdown = (expense ? [...categoryTotals.entries()] : [])
    .map(([id, amountMinor]) => ({ ...getCategory('expense', id), amountMinor, amountKobo: amountMinor, percentage: expense ? amountMinor / expense * 100 : 0 }))
    .sort((a, b) => b.amountMinor - a.amountMinor || a.label.localeCompare(b.label));
  const missingIncome = missing.filter((item) => item.transaction.type === 'income').length;
  const missingExpense = missing.length - missingIncome;
  return { entries, currency, income, expense, net: income - expense, incomeCount, expenseCount, breakdown,
    missing, missingIncome, missingExpense, complete: missing.length === 0 };
}

export function calculateTargetStatus(spentKobo, targetKobo) {
  if (!Number.isSafeInteger(targetKobo) || targetKobo <= 0 || targetKobo > MAX_AMOUNT_KOBO) return null;
  if (!Number.isSafeInteger(spentKobo) || spentKobo < 0) return null;
  const difference = targetKobo - spentKobo;
  return { targetKobo, spentKobo, remainingKobo: Math.max(difference, 0), overKobo: Math.max(-difference, 0),
    percentage: spentKobo / targetKobo * 100, progressPercentage: Math.min(spentKobo / targetKobo * 100, 100) };
}

/** Alerts are based on known expenses in the month's budget currency. */
export function spendingAlert(spent, target) {
  const status = calculateTargetStatus(spent, target);
  if (!status) return null;
  if (spent >= target) return 'limit';
  if (BigInt(spent) * 4n >= BigInt(target) * 3n) return 'warning';
  return null;
}

/** Group missing exact-date requirements by pair/date for fetch de-duplication. */
export function requiredRateRequests(entries, currencies) {
  const requests = new Map();
  for (const entry of entries) {
    const from = transactionCurrency(entry);
    for (const to of new Set(currencies)) {
      if (!isCurrency(to) || from === to || entry.rates?.[to]) continue;
      const key = rateKey(entry.date, from, to);
      requests.set(key, { key, date: entry.date, from, to });
    }
  }
  return [...requests.values()];
}

export function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function makeSampleTransactions(month) {
  const items = [
    ['income', 'salary', 360_000_00, 'Salary', '01'], ['income', 'freelance', 65_000_00, 'Design project', '08'],
    ['expense', 'housing', 120_000_00, 'Rent & home', '03'], ['expense', 'food', 38_450_00, 'Groceries for the week', '07'],
    ['expense', 'transport', 18_500_00, 'Getting around', '11'], ['expense', 'bills', 15_000_00, 'Electricity', '13'],
    ['expense', 'food', 12_800_00, 'Lunch out', '16'], ['expense', 'data', 8_000_00, 'Data top-up', '19'],
  ];
  return items.map(([type, category, amountMinor, description, day], index) => ({
    id: makeId(), type, category, amountMinor, currency: 'NGN', rates: {}, description, date: `${month}-${day}`,
    createdAt: new Date(Date.now() + index).toISOString(), sample: true,
  }));
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function csvConversion(entry, currency) {
  const result = transactionConversion(entry, currency);
  if (result.amount === null) return ['', currency, '', '', result.reason === 'too-large' ? 'Amount too large' : 'Missing rate', ''];
  if (!result.rate) return [minorToInput(result.amount, currency), currency, '1', entry.date, 'No conversion', 'Original amount'];
  return [minorToInput(result.amount, currency), currency, result.rate.rate, result.rate.date,
    result.rate.kind === 'earlier' ? 'Earlier published rate (accepted)' : result.rate.kind === 'manual' ? 'Manual' : 'Automatic', result.rate.source];
}

/** CSV is a human-readable monthly report, not a full backup. */
export function transactionsToCsv(transactions, { viewCurrency = 'NGN', months = {} } = {}) {
  const rows = [
    ['Date', 'Type', 'Category', 'Description', 'Original amount', 'Original currency',
      'View amount', 'View currency', 'View rate', 'View rate date', 'View provenance', 'View source',
      'Budget amount', 'Budget currency', 'Budget rate', 'Budget rate date', 'Budget provenance', 'Budget source', 'Sample'],
    ...sortTransactions(transactions).map((entry) => [entry.date, entry.type === 'income' ? 'Income' : 'Expense',
      getCategory(entry.type, entry.category)?.label ?? entry.category, entry.description,
      minorToInput(transactionAmount(entry), transactionCurrency(entry)), transactionCurrency(entry),
      ...csvConversion(entry, viewCurrency), ...csvConversion(entry, monthSettings(months, entry.date.slice(0, 7)).currency), entry.sample ? 'Yes' : 'No']),
  ];
  return `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
