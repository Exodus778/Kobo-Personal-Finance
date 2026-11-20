import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const baseURL = process.env.KOBO_TEST_URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await context.route('https://api.frankfurter.dev/**', async (route) => {
  const url = new URL(route.request().url());
  const parts = url.pathname.split('/');
  const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  if (url.pathname === '/v2/rates') {
    const from = url.searchParams.get('base'); const to = url.searchParams.get('quotes');
    return route.fulfill({ status: 200, headers, body: JSON.stringify([{ date:'2025-04-04', base:from, quote:to, rate:1450 }]) });
  }
  const from = parts[3]; const to = parts[4]; const date = url.searchParams.get('date');
  if (date === '2025-04-05') return route.fulfill({status:404, headers, body:'{}'});
  const values = { 'USD-NGN': date === '2025-03-21' ? 1550 : 1500, 'USD-EUR':0.92, 'NGN-EUR':0.0006, 'JPY-NGN':10, 'JPY-EUR':0.006 };
  return route.fulfill({status:200, headers, body:JSON.stringify({date,base:from,quote:to,rate:values[`${from}-${to}`] ?? 1})});
});
await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({status:404,body:'{}'}));
await context.route('https://*.currency-api.pages.dev/**', route => route.fulfill({status:404,body:'{}'}));
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
await page.goto(baseURL);
await page.locator('input[type=month]').fill('2025-03');
assert.equal(await page.locator('#view-currency option').count(),11);
assert.equal(await page.locator('#view-currency option[value="JPY"]').innerText(),'JPY — Japanese yen');
await page.getByRole('button',{name:'Set target'}).click();
await page.locator('#target-amount').fill('200000');
await page.getByRole('button',{name:'Save target'}).click();
await page.getByRole('button',{name:'Add transaction',exact:true}).first().click();
await page.locator('#transaction-currency').selectOption('USD');
await page.locator('#transaction-amount').fill('100');
await page.locator('#transaction-date').fill('2025-03-20');
await page.locator('#transaction-description').fill('Coffee');
await page.getByRole('dialog').getByRole('button',{name:'Add transaction'}).click();
await page.getByText('75% of your target used.').waitFor();
await page.getByText(/1 USD = 1,500 NGN · Automatic/).waitFor();
assert.match(await page.locator('#target').innerText(), /75% used/);
assert.match(await page.locator('.transaction-row').innerText(), /Original · US\$100\.00 USD/);
await page.locator('#view-currency').selectOption('EUR');
await page.getByText(/1 USD = 0.92 EUR · Automatic/).waitFor();
assert.match(await page.locator('.summary-grid').innerText(), /€92\.00/);
assert.match(await page.locator('#target').innerText(), /75% used/);
await page.getByRole('button',{name:'Edit budget rate for Coffee'}).click();
await page.getByLabel('Calculate from the amount charged by my bank').check();
await page.locator('#bank-amount').fill('180000');
await page.getByRole('button',{name:'Save manual rate'}).click();
await page.getByText(/1 USD = 1,800 NGN · Manual/).waitFor();
assert.match(await page.locator('#target').innerText(), /90% used/);
assert.match(await page.locator('.summary-grid').innerText(), /€92\.00/);
assert.match(await page.locator('.transaction-row').innerText(), /USD = 0.92 EUR · Automatic/);
assert.match(await page.locator('.transaction-row').innerText(), /bank-charged amount/);
await page.getByRole('button',{name:'Edit budget rate for Coffee'}).click();
await page.locator('#manual-rate').fill('2000');
await page.getByRole('button',{name:'Save manual rate'}).click();
await page.getByText('Target reached.').waitFor();
assert.match(await page.locator('#target').innerText(), /100% used/);

// CSV reports both view and budget conversions and the provenance actually used.
const csvEvent = page.waitForEvent('download');
await page.getByRole('button',{name:'Export CSV'}).click();
const csv = await fs.readFile(await (await csvEvent).path(),'utf8');
assert.match(csv, /View provenance/); assert.match(csv, /Manual: entered rate/); assert.match(csv,/"EUR"/); assert.match(csv,/"NGN"/);

// A valid full backup is separate from CSV and contains the manually entered rate.
await page.getByRole('button',{name:'Backup',exact:true}).click();
const backupEvent = page.waitForEvent('download');
await page.getByRole('button',{name:'Download backup'}).click();
const backupDownload = await backupEvent;
const backupText = await fs.readFile(await backupDownload.path(),'utf8');
const backup = JSON.parse(backupText);
assert.equal(backup.data.transactions[0].rates.NGN.kind,'manual');
assert.equal(backup.data.months['2025-03'].targetMinor, 20000000);
await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();

// An edited date must not silently retain or discard a manual rate.
await page.getByRole('button',{name:'Edit Coffee',exact:true}).click();
await page.locator('#transaction-date').fill('2025-03-21');
await page.getByRole('button',{name:'Save changes'}).click();
assert.equal(await page.getByText('Replace saved manual rates?').count(),1);
await page.getByRole('button',{name:'Keep editing'}).click();
await page.getByRole('button',{name:'Save changes'}).click();
await page.getByRole('button',{name:'Yes, change & replace rates'}).click();
await page.getByText(/1 USD = 1,550 NGN · Automatic/).waitFor();
assert.doesNotMatch(await page.locator('.transaction-row').innerText(), /Manual/);

// Changing the budget base requires a new target or explicit removal and confirmation.
await page.getByRole('button',{name:'Change',exact:true}).click();
await page.locator('#budget-currency').selectOption('EUR');
await page.getByRole('button',{name:'Change currency'}).click();
await page.locator('#replacement-error').waitFor();
await page.locator('#replacement-target').fill('200');
await page.getByRole('button',{name:'Change currency'}).click();
await page.getByText('Change this month’s budget currency?').waitFor();
await page.getByRole('button',{name:'Confirm currency change'}).click();
assert.match(await page.locator('.budget-currency').innerText(), /EUR/);
assert.match(await page.locator('#target').innerText(), /€200\.00/);
await page.locator('input[type=month]').fill('2025-04');
assert.match(await page.locator('.budget-currency').innerText(), /NGN/);
assert.match(await page.locator('#target').innerText(), /No target set/);

// Missing rates stay incomplete; an earlier rate needs an explicit accept action.
await page.getByRole('button',{name:'Set target'}).click(); await page.locator('#target-amount').fill('200000'); await page.getByRole('button',{name:'Save target'}).click();
await page.getByRole('button',{name:'Add transaction',exact:true}).first().click();
await page.locator('#transaction-currency').selectOption('USD'); await page.locator('#transaction-amount').fill('100'); await page.locator('#transaction-date').fill('2025-04-05'); await page.locator('#transaction-description').fill('Missing rate');
await page.getByRole('dialog').getByRole('button',{name:'Add transaction'}).click();
await page.getByText('Some conversions are incomplete.').waitFor();
assert.match(await page.locator('#target').innerText(), /Incomplete/);
await page.getByRole('button',{name:'Resolve budget rate for Missing rate'}).click();
await page.getByRole('button',{name:'Find an earlier rate'}).click();
await page.getByText('Earlier published rate', {exact:true}).waitFor();
assert.match(await page.getByRole('dialog').innerText(), /2025-04-04/);
assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('kobo.budget.data.v2')))).transactions.find(t => t.description === 'Missing rate').rates.NGN, undefined);
await page.getByRole('button',{name:'Use rate from 2025-04-04'}).click();
assert.match(await page.locator('.transaction-row').innerText(), /Earlier published rate · accepted · 2025-04-04/);
assert.match(await page.locator('#target').innerText(), /73% used/);

// Invalid restore does nothing; confirmed valid restore replaces every month.
await page.getByRole('button',{name:'Backup',exact:true}).click();
await page.locator('input[type=file]').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{bad')});
await page.getByText(/not a valid Kobo backup/).waitFor();
assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('kobo.budget.data.v2')))).transactions.length,2);
await page.locator('input[type=file]').setInputFiles({name:'kobo-backup.json',mimeType:'application/json',buffer:Buffer.from(backupText)});
await page.getByText('Replace all current budget data?').waitFor();
await page.getByRole('button',{name:'Yes, replace my budget'}).click();
assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('kobo.budget.data.v2')))).transactions.length,1);
await page.locator('input[type=month]').fill('2025-03');
assert.match(await page.locator('#target').innerText(), /100% used/);
await page.reload();
await page.locator('input[type=month]').fill('2025-03');
assert.match(await page.locator('.transaction-row').innerText(), /Manual/);
assert.match(await page.locator('#target').innerText(), /100% used/);

// JPY accepts whole units only and enforces precision.
await page.getByRole('button',{name:'Add transaction',exact:true}).first().click();
await page.locator('#transaction-currency').selectOption('JPY');
await page.locator('#transaction-amount').fill('10.5');
await page.getByRole('dialog').getByRole('button',{name:'Add transaction'}).click();
assert.match(await page.locator('#amount-error').innerText(), /whole units/);
await page.locator('#transaction-amount').fill('10');
await page.locator('#transaction-description').fill('Yen test');
await page.getByRole('dialog').getByRole('button',{name:'Add transaction'}).click();
await page.getByText(/Original · JP¥10 JPY/).waitFor();

const axe = await new AxeBuilder({page}).analyze();
console.log('Desktop axe:', axe.violations.map(v => `${v.id}: ${v.nodes.length}`).join(', ') || 'none');
assert.equal(axe.violations.length,0);
await page.setViewportSize({width:375,height:812});
const dimensions = await page.evaluate(() => ({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
assert.equal(dimensions.scroll, dimensions.width, 'no horizontal scrolling on mobile');
const axeMobile = await new AxeBuilder({page}).analyze();
console.log('Mobile axe:', axeMobile.violations.map(v => `${v.id}: ${v.nodes.length}`).join(', ') || 'none');
assert.equal(axeMobile.violations.length,0);
await page.getByRole('button',{name:'Backup',exact:true}).click();
const axeDialog = await new AxeBuilder({page}).analyze();
console.log('Backup dialog axe:', axeDialog.violations.map(v => `${v.id}: ${v.nodes.length}`).join(', ') || 'none');
assert.equal(axeDialog.violations.length,0);
assert.deepEqual(errors,[]);
await context.close();

// v1 records remain unchanged while the v2 document migrates to NGN.
const legacyContext = await browser.newContext();
await legacyContext.addInitScript(() => {
 const tx = {id:'legacy',type:'expense',amountKobo:12345,category:'food',date:'2025-03-20',description:'Legacy',createdAt:'2025-03-20T10:00:00Z',sample:false};
 localStorage.setItem('kobo.budget.transactions.v1', JSON.stringify({version:1,transactions:[tx]}));
 localStorage.setItem('kobo.budget.targets.v1', JSON.stringify({version:1,targets:{'2025-03':50000}}));
});
const legacyPage = await legacyContext.newPage(); await legacyPage.goto(baseURL); await legacyPage.locator('input[type=month]').fill('2025-03');
await legacyPage.getByText('Legacy', {exact:true}).waitFor();
const legacyData = await legacyPage.evaluate(() => ({v1:JSON.parse(localStorage.getItem('kobo.budget.transactions.v1')), v2:JSON.parse(localStorage.getItem('kobo.budget.data.v2'))}));
assert.equal(legacyData.v1.transactions[0].amountKobo,12345);
assert.equal(legacyData.v2.transactions[0].amountMinor,12345); assert.equal(legacyData.v2.transactions[0].currency,'NGN');
assert.deepEqual(legacyData.v2.months['2025-03'], {currency:'NGN',targetMinor:50000});
await legacyContext.close();

// Theme preference is independent of budget data, works in read-only tabs,
// and survives reload. The original dark appearance is the default.
const themeContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', colorScheme: 'light' });
for (const pattern of ['https://api.frankfurter.dev/**', 'https://cdn.jsdelivr.net/**', 'https://*.currency-api.pages.dev/**']) {
  await themeContext.route(pattern, (route) => route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
}
const themePage = await themeContext.newPage();
const themeErrors = []; themePage.on('pageerror', (error) => themeErrors.push(error.message));
await themePage.goto(baseURL);
await themePage.waitForFunction(() => { const add = document.querySelector('.header-add'); return Boolean(add && !add.disabled); });
const originalBudget = await themePage.evaluate(() => localStorage.getItem('kobo.budget.data.v2'));
const themeSwitch = () => themePage.getByRole('switch', { name: 'Light mode' });
assert.equal(await themePage.locator('html').getAttribute('data-theme'), 'dark');
assert.equal(await themeSwitch().getAttribute('aria-checked'), 'false');
await themeSwitch().focus(); await themePage.keyboard.press('Space');
assert.equal(await themePage.locator('html').getAttribute('data-theme'), 'light');
assert.equal(await themeSwitch().getAttribute('aria-checked'), 'true');
assert.equal(await themePage.evaluate(() => localStorage.getItem('kobo.theme')), 'light');
assert.equal(await themePage.evaluate(() => localStorage.getItem('kobo.budget.data.v2')), originalBudget);
assert.equal((await new AxeBuilder({ page: themePage }).analyze()).violations.length, 0, 'light desktop accessibility');
await themePage.reload();
await themePage.waitForFunction(() => { const add = document.querySelector('.header-add'); return Boolean(add && !add.disabled); });
assert.equal(await themePage.locator('html').getAttribute('data-theme'), 'light');
assert.equal(await themeSwitch().getAttribute('aria-checked'), 'true');

const themeOtherTab = await themeContext.newPage(); await themeOtherTab.goto(baseURL);
await themeOtherTab.getByText('Read-only while another tab is editing.').waitFor();
assert.equal(await themeOtherTab.locator('html').getAttribute('data-theme'), 'light');
await themeOtherTab.getByRole('switch', { name: 'Light mode' }).press('Enter');
await themePage.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
assert.equal(await themePage.evaluate(() => localStorage.getItem('kobo.budget.data.v2')), originalBudget);
assert.equal(await themePage.locator('.storage-alert').count(), 0);
await themeSwitch().click();
await themeOtherTab.waitForFunction(() => document.documentElement.dataset.theme === 'light');
await themeOtherTab.close();

// Light surfaces, native controls, alerts and dialogs remain usable at 320px.
await themePage.setViewportSize({ width: 320, height: 760 });
await themePage.evaluate(() => document.fonts.ready);
const themeDimensions = await themePage.evaluate(() => {
  const brand = document.querySelector('.brand-compact').getBoundingClientRect();
  const actions = document.querySelector('.mobile-bar-actions').getBoundingClientRect();
  return { width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, brandRight: brand.right, actionsLeft: actions.left };
});
assert.equal(themeDimensions.width, themeDimensions.scroll, 'light mobile has no horizontal scroll');
assert.ok(themeDimensions.brandRight <= themeDimensions.actionsLeft, 'mobile theme control does not overlap the logo');
assert.equal(await themeSwitch().getAttribute('aria-checked'), 'true');
assert.equal(await themePage.locator('input[type=month]').evaluate((element) => getComputedStyle(element).colorScheme), 'light');
assert.equal(await themePage.locator('#view-currency').evaluate((element) => getComputedStyle(element).colorScheme), 'light');
await themePage.locator('input[type=month]').fill('2025-03');
await themePage.getByRole('button', { name: 'Set target' }).click();
assert.equal((await new AxeBuilder({ page: themePage }).analyze()).violations.length, 0, 'light target dialog accessibility');
await themePage.locator('#target-amount').fill('250000'); await themePage.getByRole('button', { name: 'Save target' }).click();
await themePage.getByRole('button', { name: 'Try sample data' }).click();
await themePage.getByText('75% of your target used.').waitFor();
assert.equal((await new AxeBuilder({ page: themePage }).analyze()).violations.length, 0, 'light warning and sample accessibility');
await themePage.getByRole('button', { name: 'Edit target' }).click();
await themePage.locator('#target-amount').fill('200000'); await themePage.getByRole('button', { name: 'Save changes' }).click();
await themePage.getByText('Target reached.').waitFor();
assert.equal((await new AxeBuilder({ page: themePage }).analyze()).violations.length, 0, 'light target limit accessibility');

await themePage.getByRole('button', { name: 'Add transaction', exact: true }).first().click();
await themePage.getByRole('dialog').getByRole('button', { name: 'Add transaction' }).click();
assert.equal(await themePage.locator('#transaction-date').evaluate((element) => getComputedStyle(element).colorScheme), 'light');
assert.equal((await new AxeBuilder({ page: themePage }).analyze()).violations.length, 0, 'light transaction dialog and validation accessibility');
await themePage.locator('#transaction-currency').selectOption('USD');
await themePage.locator('#transaction-amount').fill('100');
await themePage.locator('#transaction-date').fill('2025-03-20');
await themePage.locator('#transaction-description').fill('Light FX');
await themePage.getByRole('dialog').getByRole('button', { name: 'Add transaction' }).click();
await themePage.getByText('Some conversions are incomplete.').waitFor();
assert.equal((await new AxeBuilder({ page: themePage }).analyze()).violations.length, 0, 'light incomplete conversion accessibility');
await themePage.getByRole('button', { name: 'Resolve view & budget rate for Light FX' }).click();
await themePage.getByRole('button', { name: 'Find exact-date rate' }).click();
await themePage.getByText(/No exact-date rate could be found/).waitFor();
assert.equal((await new AxeBuilder({ page: themePage }).analyze()).violations.length, 0, 'light rate dialog accessibility');
await themePage.locator('#manual-rate').fill('1500'); await themePage.getByRole('button', { name: 'Save manual rate' }).click();
await themePage.getByRole('button', { name: 'Change', exact: true }).click();
await themePage.locator('#budget-currency').selectOption('EUR');
await themePage.locator('#replacement-target').fill('1000');
await themePage.getByRole('button', { name: 'Change currency' }).click();
await themePage.getByText('Change this month’s budget currency?').waitFor();
assert.equal((await new AxeBuilder({ page: themePage }).analyze()).violations.length, 0, 'light currency confirmation accessibility');
await themePage.getByRole('button', { name: 'Go back' }).click();
await themePage.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
await themePage.getByRole('button', { name: 'Backup', exact: true }).click();
await themePage.locator('input[type=file]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
await themePage.getByText(/not a valid Kobo backup/).waitFor();
assert.equal((await new AxeBuilder({ page: themePage }).analyze()).violations.length, 0, 'light backup dialog accessibility');
await themePage.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
await themePage.getByRole('button', { name: 'Delete Light FX' }).click();
assert.equal((await new AxeBuilder({ page: themePage }).analyze()).violations.length, 0, 'light delete dialog accessibility');
await themePage.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
assert.deepEqual(themeErrors, []);
await themeContext.close();

// A blocked preference store must not prevent switching themes in this session.
const blockedThemeContext = await browser.newContext();
await blockedThemeContext.addInitScript(() => {
  const get = Storage.prototype.getItem; const set = Storage.prototype.setItem;
  Storage.prototype.getItem = function (key) { if (key === 'kobo.theme') throw new DOMException('blocked', 'SecurityError'); return get.call(this, key); };
  Storage.prototype.setItem = function (key, value) { if (key === 'kobo.theme') throw new DOMException('blocked', 'SecurityError'); return set.call(this, key, value); };
});
const blockedThemePage = await blockedThemeContext.newPage(); await blockedThemePage.goto(baseURL);
assert.equal(await blockedThemePage.locator('html').getAttribute('data-theme'), 'dark');
await blockedThemePage.getByRole('switch', { name: 'Light mode' }).click();
assert.equal(await blockedThemePage.locator('html').getAttribute('data-theme'), 'light');
await blockedThemePage.reload();
assert.equal(await blockedThemePage.locator('html').getAttribute('data-theme'), 'dark');
await blockedThemeContext.close();
await browser.close();
console.log('Browser workflows, conversions, confirmations, backup/restore, migration, themes, responsive layout, accessibility: PASS');
