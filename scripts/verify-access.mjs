import { pathToFileURL } from 'node:url';

/** Probe one URL without cookies or redirect following; never print login tokens. */
export async function checkAccess(teamHost, target, fetchImpl = globalThis.fetch) {
  const team = String(teamHost || '').toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(team)) {
    throw new Error('Provide your exact Cloudflare Access team hostname, for example team.cloudflareaccess.com.');
  }
  let url;
  try { url = new URL(target); } catch { throw new Error('Every target must be an absolute HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Every target must be an HTTPS URL without embedded credentials.');
  const label = `${url.origin}${url.pathname}`;
  try {
    const response = await fetchImpl(url, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(12_000),
      headers: { 'User-Agent': 'Kobo-access-check/1.0', Accept: 'text/html,*/*' },
    });
    const location = response.headers.get('location');
    let redirect;
    try { redirect = location ? new URL(location, url) : null; } catch { redirect = null; }
    const loginPath = `/cdn-cgi/access/login/${url.hostname}`;
    const challenged = [301, 302, 303, 307, 308].includes(response.status) &&
      redirect?.protocol === 'https:' && redirect.hostname === team && !redirect.port &&
      !redirect.username && !redirect.password &&
      (redirect.pathname === loginPath || redirect.pathname.startsWith(`${loginPath}/`));
    return { ok: Boolean(challenged), label, status: response.status };
  } catch {
    return { ok: false, label, status: 'network error' };
  }
}

async function main(args) {
  const [team, ...targets] = args;
  if (!team || !targets.length) {
    console.error('Usage: npm run verify:access -- TEAM.cloudflareaccess.com https://production.example/ [https://preview.example/ ...]');
    process.exitCode = 2; return;
  }
  try {
    let failed = false;
    for (const target of targets) {
      const result = await checkAccess(team, target);
      console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.label}: ${result.ok ? 'redirects to the expected Access sign-in' : `not an expected Access challenge (${result.status})`}`);
      if (!result.ok) failed = true;
    }
    console.log('This only checks the listed URLs without a session. Also test allowed and denied identities and every host/asset path in a private browser.');
    if (failed) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
