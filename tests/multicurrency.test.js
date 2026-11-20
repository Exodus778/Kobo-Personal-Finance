import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENCIES, parseAmount, minorToInput, formatMoney, parseRate, convertMinor, rateFromBankAmount } from '../src/lib/currency.js';
import { calculateMonthlySummary, spendingAlert, requiredRateRequests, transactionConversion, transactionsToCsv } from '../src/lib/budget.js';
import { fetchExactRate, findEarlierRate, isValidRate, rateKey } from '../src/lib/rates.js';
import { BUDGET_STORAGE_KEY, STORAGE_KEY, TARGET_STORAGE_KEY, emptyBudget, isValidBudget, readBudget, writeBudget, createBackup, parseBackup } from '../src/lib/storage.js';

const rate = (from, to, date, value, kind = 'automatic', source = 'Test source') => ({ from, to, date, rate: value, kind, source });
const entry = (overrides = {}) => ({ id: '1', type: 'expense', currency: 'USD', amountMinor: 10000, category: 'food', date: '2025-03-20', description: '', createdAt: '2025-03-20T12:00:00Z', sample: false, rates: {}, ...overrides });
function memoryStorage() { const data = new Map(); return { data, getItem: (key) => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value) }; }
const response = (body, ok = true) => ({ ok, async json() { return body; } });

test('all eleven currencies expose codes, names and currency-specific precision', () => {
  assert.deepEqual(CURRENCIES.map((c) => c.code), ['NGN','USD','EUR','GBP','JPY','CNY','CAD','AUD','CHF','INR','ZAR']);
  assert.ok(CURRENCIES.every((c) => c.name));
  assert.deepEqual(parseAmount('250', 'JPY'), { ok: true, minor: 250 });
  assert.equal(parseAmount('250.00', 'JPY').ok, false);
  assert.deepEqual(parseAmount('250.5', 'USD'), { ok: true, minor: 25050 });
  assert.equal(parseAmount('1.001', 'NGN').ok, false);
  assert.equal(parseAmount('1000000000', 'JPY').ok, false);
  assert.equal(minorToInput(1, 'JPY'), '1');
  assert.equal(minorToInput(101, 'USD'), '1.01');
  assert.match(formatMoney(100, 'JPY'), /100/);
  assert.ok(formatMoney(-1, 'USD').includes('-'));
  assert.ok(formatMoney(Number.MAX_SAFE_INTEGER, 'USD').endsWith('.91'));
});

test('rates use decimal strings and half-up integer conversion across different precisions', () => {
  assert.equal(parseRate('0001.2500').rate, '1.25');
  assert.equal(parseRate('1e3').ok, false);
  assert.equal(parseRate(1e-7).rate, '0.0000001');
  assert.equal(parseRate('0').ok, false);
  assert.equal(convertMinor(123, 'USD', 'JPY', '150'), 185); // $1.23 -> ¥184.5 -> ¥185
  assert.equal(convertMinor(185, 'JPY', 'USD', '0.01'), 185);
  assert.equal(convertMinor(1, 'USD', 'JPY', '0.01'), 0);
  assert.equal(convertMinor(99999999999, 'USD', 'NGN', '1000000000'), null);
});

test('effective bank rate reproduces the amount actually charged', () => {
  const effective = rateFromBankAmount(10000, 'USD', 15005000, 'NGN');
  assert.equal(effective, '1500.5');
  assert.equal(convertMinor(10000, 'USD', 'NGN', effective), 15005000);
  const yen = rateFromBankAmount(300, 'JPY', 200, 'USD');
  assert.equal(convertMinor(300, 'JPY', 'USD', yen), 200);
  assert.equal(rateFromBankAmount(0, 'USD', 100, 'NGN'), null);
});

test('each transaction uses its own date-specific rate and month is independent', () => {
  const entries = [
    entry({ id: 'a', rates: { NGN: rate('USD','NGN','2025-03-20','1500') } }),
    entry({ id: 'b', date: '2025-03-21', rates: { NGN: rate('USD','NGN','2025-03-21','1600') } }),
    entry({ id: 'c', date: '2025-04-01', rates: { NGN: rate('USD','NGN','2025-04-01','2000') } }),
  ];
  const result = calculateMonthlySummary(entries, '2025-03', 'NGN');
  assert.equal(result.expense, 31_000_000);
  assert.equal(result.entries.length, 2);
  assert.equal(result.complete, true);
  assert.equal(calculateMonthlySummary(entries, '2025-04', 'NGN').expense, 20_000_000);
  assert.equal(calculateMonthlySummary(entries, '2025-05', 'NGN').expense, 0);
});

test('manual rate affects only its pair; view and base are independently converted', () => {
  const item = entry({ rates: {
    NGN: rate('USD','NGN','2025-03-20','1500','manual','Bank amount'),
    EUR: rate('USD','EUR','2025-03-20','0.92'),
  } });
  assert.equal(calculateMonthlySummary([item], '2025-03', 'NGN').expense, 15_000_000);
  assert.equal(calculateMonthlySummary([item], '2025-03', 'EUR').expense, 9200);
  assert.equal(transactionConversion(item, 'NGN').rate.kind, 'manual');
  assert.equal(transactionConversion(item, 'EUR').rate.kind, 'automatic');
  assert.equal(transactionConversion(item, 'USD').amount, 10000);
});

test('missing and unsafe conversions mark partial totals, and invalid date rates are never used', () => {
  const entries = [entry({id:'good', rates: {NGN: rate('USD','NGN','2025-03-20','1500')}}), entry({id:'missing'}),
    entry({id:'bad-date', rates: {NGN: rate('USD','NGN','2025-03-19','1400')}}),
    entry({id:'huge', amountMinor: 99999999999, rates: {NGN: rate('USD','NGN','2025-03-20','1000000000')}})];
  const result = calculateMonthlySummary(entries, '2025-03', 'NGN');
  assert.equal(result.expense, 15000000);
  assert.equal(result.complete, false);
  assert.equal(result.missingExpense, 3);
  assert.equal(result.breakdown[0].percentage, 100);
  assert.equal(isValidRate(rate('USD','NGN','2025-03-19','1400','earlier'), 'USD', 'NGN', '2025-03-20'), true);
  assert.equal(isValidRate(rate('USD','NGN','2025-03-21','1400','earlier'), 'USD', 'NGN', '2025-03-20'), false);
});

test('spending alerts trigger at 75% and 100% exactly', () => {
  assert.equal(spendingAlert(749, 1000), null);
  assert.equal(spendingAlert(750, 1000), 'warning');
  assert.equal(spendingAlert(999, 1000), 'warning');
  assert.equal(spendingAlert(1000, 1000), 'limit');
  assert.equal(spendingAlert(1001, 1000), 'limit');
  assert.equal(spendingAlert(0, null), null);
});

test('needed FX requests deduplicate pair/date but never reuse unrelated pair', () => {
  const items = [entry({id:'a'}), entry({id:'b'}), entry({id:'c', date:'2025-03-21'})];
  const requests = requiredRateRequests(items, ['NGN', 'EUR', 'NGN']);
  assert.equal(requests.length, 4);
  assert.equal(new Set(requests.map((item) => item.key)).size, 4);
});

test('automatic lookup rejects wrong dates and tries the alternate provider', async () => {
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.includes('frankfurter')) return response({ date:'2025-03-19', base:'USD', quote:'NGN', rate:1 });
    return response({ date:'2025-03-20', usd:{ngn:1500.5} });
  };
  const found = await fetchExactRate('2025-03-20', 'USD', 'NGN', fake);
  assert.equal(found.rate, '1500.5');
  assert.match(found.source, /Fawaz/);
  assert.equal(found.date, '2025-03-20');
  assert.equal(calls.length, 2);
  assert.equal(await fetchExactRate('2025-03-20','USD','NGN',async () => response({}, false)), null);
});

test('earlier lookup returns the nearest earlier published rate, never same or later date', async () => {
  const candidates = [
    { date:'2025-03-20', base:'USD', quote:'NGN', rate:2000 },
    { date:'2025-03-18', base:'USD', quote:'NGN', rate:1500 },
    { date:'2025-03-19', base:'USD', quote:'NGN', rate:1600 },
    { date:'2025-03-21', base:'USD', quote:'NGN', rate:1700 },
    { date:'2025-03-19', base:'GBP', quote:'NGN', rate:1800 },
  ];
  const found = await findEarlierRate('2025-03-20','USD','NGN', async () => response(candidates));
  assert.equal(found.date, '2025-03-19');
  assert.equal(found.rate, '1600');
  assert.equal(found.kind, 'earlier');
});

test('legacy data migrates to NGN without overwriting legacy keys', () => {
  const storage = memoryStorage();
  const legacy = {id:'old', type:'expense', amountKobo:12345, category:'food', date:'2025-03-20', description:'old', createdAt:'2025-03-20', sample:false};
  storage.setItem(STORAGE_KEY, JSON.stringify({version:1, transactions:[legacy]}));
  storage.setItem(TARGET_STORAGE_KEY, JSON.stringify({version:1, targets:{'2025-03':50000}}));
  const previousTransactions = storage.getItem(STORAGE_KEY);
  const previousTargets = storage.getItem(TARGET_STORAGE_KEY);
  const loaded = readBudget(storage);
  assert.equal(loaded.canWrite, true);
  assert.equal(loaded.data.transactions[0].currency, 'NGN');
  assert.equal(loaded.data.transactions[0].amountMinor, 12345);
  assert.deepEqual(loaded.data.months['2025-03'], {currency:'NGN',targetMinor:50000});
  assert.equal(writeBudget(storage, loaded.data).ok, true);
  assert.equal(storage.getItem(STORAGE_KEY), previousTransactions);
  assert.equal(storage.getItem(TARGET_STORAGE_KEY), previousTargets);
  assert.deepEqual(readBudget(storage).data, loaded.data);
});

test('corrupt legacy or v2 storage is not silently overwritten', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, 'broken');
  assert.equal(readBudget(storage).canWrite, false);
  assert.equal(storage.getItem(STORAGE_KEY), 'broken');
  assert.equal(storage.getItem(BUDGET_STORAGE_KEY), null);
  storage.setItem(BUDGET_STORAGE_KEY, 'broken v2');
  assert.equal(readBudget(storage).canWrite, false);
  assert.equal(storage.getItem(BUDGET_STORAGE_KEY), 'broken v2');
});

test('full backup preserves months, original currencies, manual and cached rates, and validates corruption', () => {
  const manual = rate('USD','NGN','2025-03-20','1500','manual','Bank amount');
  const automatic = rate('USD','EUR','2025-03-20','0.92');
  const data = { ...emptyBudget(), transactions:[entry({rates:{NGN:manual, EUR:automatic}})],
    months:{'2025-03':{currency:'NGN',targetMinor:50000000}}, rateCache:{[rateKey('2025-03-20','USD','EUR')]:automatic}, viewCurrency:'EUR' };
  assert.equal(isValidBudget(data), true);
  const copy = parseBackup(createBackup(data));
  assert.equal(copy.ok, true);
  assert.deepEqual(copy.data, data);
  assert.equal(parseBackup('{invalid').ok, false);
  const invalid = JSON.parse(createBackup(data));
  invalid.data.transactions[0].rates.NGN.date = '2025-03-19';
  assert.equal(parseBackup(JSON.stringify(invalid)).ok, false);
  assert.equal(isValidBudget({...data, rateCache:{[rateKey('2025-03-20','USD','NGN')]: manual}}), false);
  assert.equal(isValidBudget({...data, transactions:[...data.transactions, data.transactions[0]]}), false);
});

test('CSV contains original, view and budget conversion details and flags missing rates', () => {
  const item = entry({description:'=attack',rates:{NGN:rate('USD','NGN','2025-03-20','1500','manual','Bank')}});
  const csv = transactionsToCsv([item], {viewCurrency:'EUR',months:{'2025-03':{currency:'NGN',targetMinor:null}}});
  assert.match(csv, /Original currency/);
  assert.match(csv, /View provenance/);
  assert.match(csv, /Missing rate/);
  assert.match(csv, /Manual/);
  assert.match(csv, /2025-03-20/);
  assert.match(csv, /"'=attack"/);
});
