<<<<<<< HEAD
# Kobo — local-first multicurrency budget tracker

Kobo records income and expenses in their original currencies, shows month-by-month totals and category breakdowns, and compares spending with an optional monthly target. NGN is the default. Each month is independent: no surplus, deficit or target carries forward.

## Run locally

Use a currently patched Node.js 24 LTS, npm and a modern browser. Editing requires JavaScript, browser `localStorage`, and Web Locks in a secure context (HTTPS or localhost).

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Other commands:

```sh
npm test                    # domain, FX, storage and security checks
npm run build               # static build in dist/
npm run preview             # inspect the built app locally; not a production server
npm run test:browser:built  # test the build in an isolated local preview
```

For browser checks, first install Chromium, Firefox and WebKit with `npx playwright install chromium firefox webkit` and any operating-system libraries Playwright requests. `npm run test:browser` can instead test a separately running server; it uses `http://127.0.0.1:5173/` by default, or the URL in `KOBO_TEST_URL`. FX responses are mocked for repeatability.

## Using currencies

Choose the **monthly budget currency** for the selected month; its target and progress stay in that currency. Choose **View in** separately for dashboard totals, the category chart and transaction amounts. Transactions retain their original amount and currency. Each pair is converted directly from that original currency using a saved, transaction-date rate; destination pairs have independent rates. A manual USD→NGN bank rate does not become a USD→EUR rate. Targets are never automatically converted using an arbitrary date.

Use a transaction's **Edit rate** or **Resolve rate** control to enter a rate, calculate one from a bank-charged amount, retry an exact-date reference rate, or explicitly accept an earlier published rate. Missing rates make affected totals and progress incomplete rather than guessed. Reference rates are not guaranteed bank charges.

## Data and privacy

Budgets, targets and rate observations are stored locally in this browser, without encryption or account-based synchronization. Cloudflare Access, if configured, protects the website, not data on the device. Each browser, profile, device and origin has separate data; authorized users do not automatically share a budget. Clearing browser data can delete records. FX providers receive the date and currency pair or base plus normal network metadata, not transaction amounts or descriptions.

Use **Backup** to download a complete, unencrypted JSON backup and restore it later. Restore replaces the entire budget after validation and confirmation; it does not merge. The monthly CSV is a separate report and cannot be imported. Keep backups private and test recovery periodically. Existing version-1 naira entries and targets migrate to NGN without deleting the original keys.

Current Kobo tabs on the same origin coordinate a single editable tab using Web Locks; other tabs are read-only until the writer closes. A browser without Web Locks or a secure context is read-only. Non-cooperating old builds or other scripts may ignore the lock, so close old-version tabs before upgrading. If a conflict or failed save is reported, keep the tab open and download a session backup before reloading. See `read.md` and `DEPLOYMENT.md` for the limits and recovery procedure.

## Private production deployment

No live production site or Cloudflare Access policy is configured in this repository. The app has no built-in authentication. Follow **[DEPLOYMENT.md](DEPLOYMENT.md)** to deploy behind Cloudflare Access, protect the production `pages.dev` hostname, every deployment/preview URL and any custom domains, and verify both allowed and denied identities before launch. The Pages preview access switch alone does not protect production. `.github/workflows/verify.yml` provides tests but does not deploy or enforce branch protection by itself.

The Cloudflare Pages build receives restrictive security headers through `public/_headers`; Vite's built-app preview uses a slightly different framing policy for the Arena preview. Other hosts must supply their own access and headers. Neither headers nor the supplied tests constitute an independent security audit.

## Project guide

- `DEPLOYMENT.md` — private production setup, access verification and operations.
- `read.me`, `read.md` — concise and detailed product guides.
- `PLAN.md` — product decisions, logic, style stack and responsive layout.
- `src/lib/` — precision-safe amounts, rates, budget calculations and validated storage.
- `src/hooks/useBudgetStore.js` — single-writer coordination and save/recovery handling.
- `src/App.jsx`, `src/components/`, `src/styles.css` — responsive React interface and plain CSS.
- `tests/`, `scripts/` — automated tests, built-preview harness and Access probe.

## Temporary private preview

A protected Cloudflare Quick Tunnel can be used for a short-lived preview, not production hosting. Install a current `cloudflared` from [Cloudflare](https://developers.cloudflare.com/tunnel/downloads/), then:

```sh
npm ci
npm run build
npm run preview -- --port 4173
# In a second terminal, substitute an email address you control:
cloudflared tunnel --url http://localhost:4173 --http-host-header localhost:4173 --allowed-mail 'you@example.com'
```

Repeat `--allowed-mail` for additional authorized addresses. The hostname changes and access ends when the process stops. Do not send anyone a login code. A new hostname has separate local storage; export a JSON backup from the old origin before it disappears if you need to move its data.
=======
# Kobo-Personal-Finance
Kobo is a local-first personal budget tracker. It records income and expenses in their original currencies, groups them by calendar month and compares spending with an optional monthly target. NGN is the default for new months and for records migrated from the original naira-only version.
>>>>>>> a86f3b7183c59e2408a74d597b1dd57986347d98
