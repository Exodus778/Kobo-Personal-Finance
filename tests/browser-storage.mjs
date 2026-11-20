import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const baseURL = process.env.KOBO_TEST_URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const key = 'kobo.budget.data.v2';
const editable = (page) => page.waitForFunction(() => { const button = document.querySelector('.header-add'); return Boolean(button && !button.disabled); });
const readonly = (page) => page.getByText('Read-only while another tab is editing.').waitFor();
async function month(page) { await page.locator('input[type=month]').fill('2025-03'); }
async function draft(page, description, amount = '1234') {
  await page.getByRole('button', { name: 'Add transaction', exact: true }).first().click();
  await page.locator('#transaction-amount').fill(amount);
  await page.locator('#transaction-date').fill('2025-03-20');
  await page.locator('#transaction-description').fill(description);
}
async function submitDraft(page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Add transaction', exact: true }).click();
}
async function saved(page) { return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)), key); }
async function backup(page) {
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  const data = JSON.parse(await fs.readFile(await (await event).path(), 'utf8'));
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  return data.data;
}

// Two tabs racing at startup cannot both acquire write access or each persist
// an independent initial document. Exactly one is writable.
{
  const context = await browser.newContext();
  const one = await context.newPage(); const two = await context.newPage();
  await Promise.all([one.goto(baseURL), two.goto(baseURL)]);
  await Promise.race([editable(one), editable(two)]);
  const writable = await one.locator('.header-add').isEnabled() ? one : two;
  const waiting = writable === one ? two : one;
  await readonly(waiting);
  assert.equal(await waiting.locator('.header-add').isDisabled(), true);
  await month(writable); await draft(writable, 'Startup race'); await submitDraft(writable);
  await month(waiting); await waiting.getByText('Startup race', { exact: true }).waitFor();
  assert.equal((await saved(waiting)).transactions.length, 1);
  await context.close();
}

// A second tab cannot mutate or restore; it sees committed changes and takes
// over automatically after the first tab closes, without losing either edit.
{
  const context = await browser.newContext({ acceptDownloads: true });
  const first = await context.newPage(); await first.goto(baseURL); await editable(first); await month(first);
  const second = await context.newPage(); await second.goto(baseURL); await readonly(second); await month(second);
  assert.equal(await second.locator('.header-add').isDisabled(), true);
  assert.equal(await second.getByRole('button', { name: 'Set target' }).isDisabled(), true);
  assert.equal(await second.locator('#view-currency').isDisabled(), true);
  await second.getByRole('button', { name: 'Backup', exact: true }).click();
  assert.equal(await second.locator('input[type=file]').isDisabled(), true);
  await second.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await draft(first, 'First tab'); await submitDraft(first);
  await second.getByText('First tab', { exact: true }).waitFor();
  await first.close(); await editable(second);
  await draft(second, 'Second tab', '300'); await submitDraft(second);
  assert.deepEqual((await saved(second)).transactions.map((t) => t.description).sort(), ['First tab', 'Second tab']);
  await context.close();
}

// A non-cooperating writer (an old build or another script) changes storage
// while a draft is open. The new app freezes writes, preserves the draft in its
// session backup, and does not overwrite the external document.
{
  const context = await browser.newContext({ acceptDownloads: true });
  const first = await context.newPage(); await first.goto(baseURL); await editable(first); await month(first);
  await draft(first, 'Original'); await submitDraft(first);
  const other = await context.newPage(); await other.goto(baseURL); await readonly(other);
  await draft(first, 'Draft during conflict', '50');
  await other.evaluate((storageKey) => {
    const external = JSON.parse(localStorage.getItem(storageKey));
    external.viewCurrency = 'EUR';
    localStorage.setItem(storageKey, JSON.stringify(external));
  }, key);
  await first.getByText(/Saved data changed outside this tab/).waitFor();
  await submitDraft(first);
  assert.equal(await first.locator('.header-add').isDisabled(), true);
  const external = await saved(first);
  assert.equal(external.viewCurrency, 'EUR');
  assert.deepEqual(external.transactions.map((t) => t.description), ['Original']);
  const session = await backup(first);
  assert.deepEqual(session.transactions.map((t) => t.description).sort(), ['Draft during conflict', 'Original']);
  assert.equal(session.viewCurrency, 'NGN');
  await context.close();
}

// Quota failures retain in-memory edits. Retrying after storage recovers writes
// that exact session and clears the warning; the original disk value is intact.
{
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage(); await page.goto(baseURL); await editable(page); await month(page);
  const before = await saved(page);
  await page.evaluate(() => { window.originalKoboSet = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await draft(page, 'Unsaved entry'); await submitDraft(page);
  await page.getByText(/Changes are only in this tab/).waitFor();
  assert.deepEqual(await saved(page), before);
  assert.equal((await backup(page)).transactions[0].description, 'Unsaved entry');
  await page.evaluate(() => { Storage.prototype.setItem = window.originalKoboSet; });
  await page.getByRole('button', { name: 'Retry saving this session' }).click();
  await page.getByRole('button', { name: 'Retry saving this session' }).waitFor({ state: 'hidden' });
  assert.equal((await saved(page)).transactions[0].description, 'Unsaved entry');
  await context.close();
}

// Unsupported contexts fail closed, but exporting visible data remains possible.
{
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }));
  const page = await context.newPage(); await page.goto(baseURL);
  await page.getByText('Editing is unavailable in this browser.').waitFor();
  assert.equal(await page.locator('.header-add').isDisabled(), true);
  assert.equal(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key), null);
  assert.equal((await backup(page)).transactions.length, 0);
  await context.close();
}

// Simulate a page entering and returning from the back/forward cache. Releasing
// its lock lets the waiting tab work; an open draft survives, and an intervening
// edit triggers a conflict rather than silently replacing either version.
{
  const context = await browser.newContext({ acceptDownloads: true });
  const first = await context.newPage(); await first.goto(baseURL); await editable(first); await month(first);
  const second = await context.newPage(); await second.goto(baseURL); await readonly(second); await month(second);
  await draft(first, 'Draft before navigation');
  await first.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await editable(second);
  await draft(second, 'Other tab while away', '25'); await submitDraft(second);
  await first.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await submitDraft(first);
  await second.close();
  await first.getByText(/Saved data changed outside this tab/).waitFor();
  assert.equal((await saved(first)).transactions[0].description, 'Other tab while away');
  assert.equal((await backup(first)).transactions[0].description, 'Draft before navigation');
  await context.close();
}

// An unexpected render exception shows a recovery screen that can export the
// untouched raw saved bytes rather than forcing the user to clear storage.
{
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => {
    localStorage.setItem('kobo.budget.data.v2', JSON.stringify({ version: 2, transactions: [], months: {}, rateCache: {}, viewCurrency: 'NGN' }));
    const Original = Intl.NumberFormat;
    Intl.NumberFormat = function (...args) {
      if (args[1]?.style === 'currency') throw new Error('Simulated render failure');
      return new Original(...args);
    };
    Intl.NumberFormat.prototype = Original.prototype;
  });
  const page = await context.newPage(); await page.goto(baseURL);
  await page.getByRole('heading', { name: 'Something went wrong.' }).waitFor();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download saved data' }).click();
  const recovery = JSON.parse(await fs.readFile(await (await event).path(), 'utf8'));
  assert.equal(recovery.format, 'kobo-raw-storage-recovery');
  assert.equal(JSON.parse(recovery.raw[key]).viewCurrency, 'NGN');
  assert.equal(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key), recovery.raw[key]);
  await context.close();
}

await browser.close();
console.log('Single-writer handoff, conflict recovery, quota retry, unsupported browser, page lifecycle and crash recovery: PASS');
