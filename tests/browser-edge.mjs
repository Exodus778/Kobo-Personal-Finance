import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
const baseURL = process.env.KOBO_TEST_URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({viewport:{width:320,height:760},acceptDownloads:true});
await context.route('https://api.frankfurter.dev/**', async route => {
  const url=new URL(route.request().url()); const parts=url.pathname.split('/');
  await new Promise(resolve=>setTimeout(resolve,1400));
  await route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify({date:url.searchParams.get('date'),base:parts[3],quote:parts[4],rate:1500})});
});
const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message)); await page.goto(baseURL);
await page.locator('input[type=month]').fill('2025-03');
// All new dialogs must fit at 320 px and satisfy the same accessibility checks.
async function checkDialog(label) {
 const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
 assert.equal(dimensions.width,dimensions.scroll,`${label}: no horizontal scrolling`);
 const result=await new AxeBuilder({page}).analyze();
 assert.deepEqual(result.violations.map(v=>v.id),[],`${label}: accessibility violations`);
}
await page.getByRole('button',{name:'Set target'}).click(); await checkDialog('target');
await page.locator('#target-amount').fill('200000'); await page.getByRole('button',{name:'Save target'}).click();
await page.getByRole('button',{name:'Add transaction',exact:true}).first().click(); await checkDialog('transaction');
await page.locator('#transaction-currency').selectOption('USD'); await page.locator('#transaction-amount').fill('100'); await page.locator('#transaction-description').fill('Race'); await page.locator('#transaction-date').fill('2025-03-20'); await page.getByRole('dialog').getByRole('button',{name:'Add transaction'}).click();
await page.getByRole('button',{name:'Resolve view & budget rate for Race'}).click(); await checkDialog('rate');
await page.locator('#manual-rate').fill('1800'); await page.getByRole('button',{name:'Save manual rate'}).click();
await page.waitForTimeout(2000);
const race=await page.evaluate(()=>JSON.parse(localStorage.getItem('kobo.budget.data.v2')).transactions.find(t=>t.description==='Race'));
assert.equal(race.rates.NGN.kind,'manual'); assert.equal(race.rates.NGN.rate,'1800');
assert.match(await page.locator('.transaction-row').innerText(),/1,800 NGN · Manual/);
// Original-currency change is guarded too, not only date changes.
await page.getByRole('button',{name:'Edit Race',exact:true}).click(); await page.locator('#transaction-currency').selectOption('EUR'); await page.getByRole('button',{name:'Save changes'}).click();
await page.getByText('Replace saved manual rates?').waitFor(); await page.getByRole('button',{name:'Keep editing'}).click(); await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('kobo.budget.data.v2')).transactions[0])).currency,'USD');
// Base change provides explicit removal and confirmation instead of silently reinterpreting a target.
await page.getByRole('button',{name:'Change',exact:true}).click(); await checkDialog('budget currency'); await page.locator('#budget-currency').selectOption('JPY');
await page.getByLabel('Remove the existing target instead').check(); await page.getByRole('button',{name:'Change currency'}).click();
assert.match(await page.getByRole('dialog').innerText(),/existing target will be removed/); await page.getByRole('button',{name:'Confirm currency change'}).click();
assert.match(await page.locator('#target').innerText(),/No target set/);
assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('kobo.budget.data.v2')).months['2025-03'])).currency,'JPY');
await page.getByRole('button',{name:'Backup',exact:true}).click(); await checkDialog('backup'); await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
assert.deepEqual(errors,[]); await context.close();

// Corrupt v2 is guarded. Explicit, valid restore is the only replacement path.
const corrupt=await browser.newContext(); await corrupt.addInitScript(()=>localStorage.setItem('kobo.budget.data.v2','{corrupt'));
const p=await corrupt.newPage(); await p.goto(baseURL);
await p.getByText(/Saved budget data could not be read/).waitFor();
assert.equal(await p.evaluate(()=>localStorage.getItem('kobo.budget.data.v2')),'{corrupt');
await p.getByRole('button',{name:'Backup',exact:true}).click();
assert.match(await p.getByRole('dialog').innerText(),/only data currently visible/);
const valid={format:'kobo-budget-backup',backupVersion:1,exportedAt:'2025-03-20T00:00:00Z',data:{version:2,transactions:[],months:{'2025-03':{currency:'NGN',targetMinor:50000}},rateCache:{},viewCurrency:'NGN'}};
await p.locator('input[type=file]').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(valid))});
assert.equal(await p.evaluate(()=>localStorage.getItem('kobo.budget.data.v2')),'{corrupt');
// A failed atomic write cannot replace the in-memory or stored budget.
await p.evaluate(()=>{window._originalSet=Storage.prototype.setItem; Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});
await p.getByRole('button',{name:'Yes, replace my budget'}).click();
await p.getByText(/Restore could not be saved/).waitFor(); assert.equal(await p.evaluate(()=>localStorage.getItem('kobo.budget.data.v2')),'{corrupt');
await p.evaluate(()=>{Storage.prototype.setItem=window._originalSet;});
await p.getByRole('button',{name:'Yes, replace my budget'}).click();
assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('kobo.budget.data.v2')))).months['2025-03'].targetMinor,50000);
await corrupt.close(); await browser.close(); console.log('Additional race, mobile dialog, accessibility, corrupt storage and atomic-restore checks: PASS');
