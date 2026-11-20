# Production deployment and operations

This repository is prepared for a **private, static Cloudflare Pages deployment**. It does not deploy itself, and no Cloudflare account, hostname, Access policy or authorized identity is configured by this repository. Do not describe a deployment as private or launch it until the checks below have passed against the actual URLs. If supplied alongside the source archive, `kobo-static-build.zip` contains the built `dist/` files at its root; it is not access-controlled on its own.

## What this deployment does—and does not do

Kobo has no application server or built-in sign-in. Cloudflare Access must protect the entire site, including assets and every deployment hostname. Access controls who can open the site; it does not encrypt or synchronize budgets. Each browser profile and origin has its own local, unencrypted data. Two authorized people do **not** automatically share a budget. The app needs a secure context with Web Locks for editing; if unavailable, it fails closed into read-only mode.

You need a Cloudflare account with Zero Trust/Access enabled, a stable production hostname (the project's `pages.dev` hostname or a custom domain), and a specific list of authorized email addresses. Do not send account passwords, API tokens or one-time login codes in chat. Decide who owns the account, responds to incidents, maintains the allowlist and holds backups.

## 1. Verify the release locally

Use a currently patched Node.js 24 LTS and npm. The browser suites require Chromium, Firefox and WebKit, and may also require operating-system packages.

```sh
npm ci
npm audit --audit-level=high
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:browser:built
```

On a clean Linux CI machine, `npx playwright install --with-deps chromium firefox webkit` installs the browser and required system packages. `test:browser:built` starts an isolated local preview, runs the browser suites and stops it. FX responses in these suites are mocked; a provider can still fail in production.

The supplied GitHub Actions workflow runs these checks on pushes, pull requests and weekly. It does not deploy and does not itself enforce branch protection. If using GitHub, enable branch protection and require the **Verify / checks** status before merging the production branch; review dependency and action updates regularly.

## 2. Create the hosting project deliberately

Choose Pages **Git integration** or **Direct Upload** before creating the project. Cloudflare does not support switching an existing project between those deployment modes; a different project would require a new hostname and a local-data migration. Git integration is a good default when the source lives in a maintained GitHub or GitLab repository. Set:

- Production branch: the protected branch you intend to release, such as `main`.
- Node version: `24` (`.node-version` is included; also check the Pages build setting).
- Build command: `npm run build`.
- Build output directory: `dist`.
- Build/install from the committed lockfile; no application secrets or database variables are needed.

Pages' automatically generated production and deployment URLs can be publicly reachable before Access is configured. If the chosen creation flow cannot establish the required policy first, use a non-sensitive placeholder or an effective provider-side block while establishing it; do not publish the app or share a URL until the actual policy is in place and tested. A custom domain cannot be attached to Pages with an existing Access policy on that domain in the documented flow, so plan and verify that transition rather than assuming it is private from the first instant. See [Pages known issues](https://developers.cloudflare.com/pages/platform/known-issues/).

The application assumes deployment at the **origin root**. HTTPS must be working before use. Changes to scheme, host or port create a different browser-storage origin.

## 3. Restrict *every* reachable hostname and path

Configure Cloudflare Zero Trust Access with explicit **Allow** rules for the authorized email addresses and a suitable identity method, such as email one-time PIN. Review and remove any broader allow or bypass rule that would permit unintended users. Protect the entire hostname, not only `/`; static JS, CSS, favicon and other paths must also require authorization.

At minimum cover and verify all of the following:

1. The production root hostname, `PROJECT.pages.dev`.
2. Every deployment/preview hostname under `*.PROJECT.pages.dev`, including branch aliases and immutable hash URLs, including the current production deployment's hash URL.
3. Every custom domain or alias pointing at the project.

**The Pages “Enable access policy” switch protects preview deployments only; it does not by itself protect the production `PROJECT.pages.dev` hostname or a custom domain.** Follow Cloudflare's [documented production and preview policy procedure](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain), then add a separate Access application for each custom domain as needed. Confirm that both the root and wildcard rules remain present after changing the Pages-managed policy. Review policies again after every new hostname, preview, identity-provider or routing change. `noindex`, an unguessable URL and a redirect are not authentication.

## 4. Prove the gate and the deployed build

From a fresh, signed-out browser or private window, visit each production, custom, branch, and hash hostname. Each should require the expected Cloudflare Access sign-in before returning the application **or its assets**. Use at least one explicitly allowed email and one identity that is not on the allowlist: the first must enter successfully; the second must be denied. Repeat for every reachable hostname. Never send the one-time code to someone else.

The optional no-credentials probe fails closed unless each listed HTTPS URL redirects to the **specified** Cloudflare Access team login. Supply real URLs and the real team hostname, including known asset URLs from that deployment:

```sh
npm run verify:access -- YOUR-TEAM.cloudflareaccess.com \
  https://YOUR-PROJECT.pages.dev/ \
  https://YOUR-PROJECT.pages.dev/favicon.svg \
  https://DEPLOYMENT-HASH.YOUR-PROJECT.pages.dev/ \
  https://YOUR-CUSTOM-DOMAIN/
```

List the actual branch alias, hashed deployment, custom hosts and built asset paths as additional arguments. A passing probe only checks the listed unauthenticated requests; it does **not** prove allowlist membership, cover URLs not supplied, or replace the allowed/denied identity tests. A `403`, an unexpected redirect or a network error fails the probe and needs investigation. No cookies, login codes or service tokens are used by the probe.

After signing in, use browser developer tools to confirm HTTPS, working JS/CSS/fonts and the actual response headers. `public/_headers` configures the Pages build with a restrictive CSP, no framing, `nosniff`, referrer and permissions policies, HSTS, and a no-index hint. Root HTML is revalidated and Vite's fingerprinted `/assets/*` can be cached immutably. Preview headers intentionally permit the Arena frame and therefore differ from production. Source tests and a local Vite preview cannot prove that Cloudflare applied the headers; verify the live responses. A different hosting platform needs its own equivalent headers and access controls.

Perform a smoke test on desktop and phone: create a non-sensitive test transaction and target, reload, export/restore a test backup in an isolated browser profile, verify multi-tab read-only handoff, and resolve a sample FX rate. Remove test data or use a separate profile. Confirm the canonical hostname is stable before using it for real records.

## Ongoing operations and recovery

- After meaningful changes, download a complete JSON backup, store it securely with encryption provided outside Kobo, and periodically test a restore in a separate browser profile. JSON/CSV and the emergency raw recovery download are **not encrypted** by the app. CSV and the emergency raw download are not directly restorable as Kobo backups.
- Keep the prior origin open long enough to export before moving from a temporary tunnel or changing hostname, browser or device; then restore on the new origin. If the old origin has disappeared or its storage was cleared, Kobo cannot retrieve that data.
- Only current cooperating Kobo tabs use the single-writer Web Lock. Close **all old-version tabs** before upgrading. Older scripts, browser extensions or other code on the origin can ignore the lock; the stale-write check detects some, not all, such races. For a conflict, save the session backup, reload, compare the current saved budget, and restore only after deciding which complete version to keep; there is no automatic merge.
- On a storage/quota warning, keep the tab open, download a backup, free space or restore browser storage access, and use **Retry saving this session**. If the app crashes, do not clear site data: the recovery screen can download raw saved keys for diagnosis, but it cannot recover unsaved form/session changes and its raw file is not a normal backup.
- Monitor the Pages deployment, domain/TLS and Access logs with the account owner's tools. Decide an alert recipient and check access/availability regularly; no monitoring or on-call service is provisioned here. Provider outages can make reference rates unavailable, in which case use an appropriate manual rate; values remain marked incomplete rather than guessed.
- Before releasing or rolling back, back up affected browser profiles and close existing tabs. An older build may not understand current data or coordinate writes; do not blindly roll back to one. After any release or rollback, repeat the access, header and smoke tests.
- Removing someone's Access permission does not erase records already saved in their browser or files already downloaded. Use trusted devices and browser profiles. Clearing site data, private browsing eviction, a failed device or a lost backup can permanently delete local records. The app has no server-side recovery or offline service worker.

Security headers and the checks here are defense in depth, not an independent security audit, an uptime guarantee or protection from a compromised device, browser, extension, identity account or same-origin script.
