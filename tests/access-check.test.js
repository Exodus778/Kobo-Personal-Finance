import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAccess } from '../scripts/verify-access.mjs';

const team = 'example.cloudflareaccess.com';
const target = 'https://budget.example.com/assets/app.js?private=query';
const response = (status, location) => async (_url, options) => {
  assert.equal(options.redirect, 'manual');
  assert.equal(options.method, 'GET');
  return new Response(null, { status, headers: location ? { location } : {} });
};

test('the access probe requires a redirect to the configured team login', async () => {
  const result = await checkAccess(team, target, response(302, `https://${team}/cdn-cgi/access/login/budget.example.com?token=not-logged`));
  assert.equal(result.ok, true);
  assert.equal(result.label, 'https://budget.example.com/assets/app.js');
  assert.equal((await checkAccess(team, target, response(200))).ok, false);
  assert.equal((await checkAccess(team, target, response(302, 'https://wrong.cloudflareaccess.com/cdn-cgi/access/login/budget.example.com'))).ok, false);
  assert.equal((await checkAccess(team, target, response(302, `https://${team}/other-page`))).ok, false);
  assert.equal((await checkAccess(team, target, response(302, `https://${team}/cdn-cgi/access/login/another.example`))).ok, false);
  assert.equal((await checkAccess(team, target, async () => { throw new Error('unreachable'); })).ok, false);
});

test('the access probe rejects insecure targets and invalid expected team names', async () => {
  await assert.rejects(() => checkAccess(team, 'http://budget.example.com/'), /HTTPS/);
  await assert.rejects(() => checkAccess(team, 'https://user:password@budget.example.com/'), /credentials/);
  await assert.rejects(() => checkAccess('evil.example', target), /team hostname/);
});
