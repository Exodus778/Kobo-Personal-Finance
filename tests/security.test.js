import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import config from '../vite.config.js';

test('production headers restrict framing and match the preview policy otherwise', async () => {
  const preview = config.preview.headers;
  const pages = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  for (const [name, value] of Object.entries(preview)) {
    if (name !== 'Content-Security-Policy') assert.ok(pages.includes(`  ${name}: ${value}`), `${name} must match`);
  }
  const csp = preview['Content-Security-Policy'];
  const productionCsp = csp.replace("frame-ancestors 'self' https://arena.ai https://*.arena.ai", "frame-ancestors 'none'");
  assert.notEqual(productionCsp, csp);
  assert.ok(pages.includes(`  Content-Security-Policy: ${productionCsp}`));
  assert.match(productionCsp, /script-src 'self'/);
  assert.doesNotMatch(productionCsp, /unsafe-eval/);
  assert.match(productionCsp, /object-src 'none'/);
  assert.match(productionCsp, /base-uri 'none'/);
  assert.match(productionCsp, /frame-ancestors 'none'/);
  for (const source of ['https://api.frankfurter.dev', 'https://cdn.jsdelivr.net', 'https://*.currency-api.pages.dev']) assert.ok(productionCsp.includes(source));
  assert.equal(preview['X-Content-Type-Options'], 'nosniff');
  assert.equal(preview['Referrer-Policy'], 'no-referrer');
  assert.match(pages, /  X-Frame-Options: DENY/);
  assert.match(pages, /  Strict-Transport-Security: max-age=31536000/);
  assert.match(pages, /\n\/\n  Cache-Control: no-cache\n/);
  assert.match(pages, /\n\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable\n/);
});
