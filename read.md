# Kobo

Kobo is a local-first personal budget tracker. It records income and expenses in their original currencies, groups them by calendar month and compares spending with an optional monthly target. NGN is the default for new months and for records migrated from the original naira-only version.

## Purpose and scope

A transaction history alone does not always answer how much came in, where money went or whether spending stayed within a plan, especially when amounts are in different currencies. Kobo brings manually entered figures into one place without a bank connection or account. It is intended for personal, single-browser use, not bank reconciliation, tax reporting or accounting.

Each month stands alone: monthly net is that month's income minus its expenses, not an account balance. Surpluses, deficits and targets do not roll over.

## Capabilities

- Add, edit and delete income and expense transactions with original currency, positive amount, category, date and optional description.
- View monthly income, expenses and net; filter the transaction list without changing totals or exports.
- Set a budget currency and an optional spending target for each month. Progress, remaining amount and overspend use that month's budget currency.
- Switch **View in** independently for converted totals, the expense chart and transaction amounts.
- Retrieve transaction-date reference rates automatically, preserve the actual rates used and show the rate, date and source per currency pair.
- Override a transaction's rate manually or derive an effective rate from a bank-charged amount. If necessary, search for an earlier published rate and explicitly choose whether to use it.
- Mark affected totals and target progress incomplete when conversions are missing or too large to calculate safely.
- Show in-app spending alerts at 75% and 100% of the monthly target.
- Download a complete JSON backup and restore it after validation and confirmation; export the selected month's transaction report separately as CSV.
- Try labelled sample transactions in an empty month and remove them independently.
- Use the responsive dark interface on phones and computers, with keyboard-accessible dialogs and textual chart values.

## Supported currencies and amounts

| Code | Currency | Decimal places |
| --- | --- | ---: |
| NGN | Nigerian naira | 2 |
| USD | US dollar | 2 |
| EUR | Euro | 2 |
| GBP | British pound | 2 |
| JPY | Japanese yen | 0 |
| CNY | Chinese yuan | 2 |
| CAD | Canadian dollar | 2 |
| AUD | Australian dollar | 2 |
| CHF | Swiss franc | 2 |
| INR | Indian rupee | 2 |
| ZAR | South African rand | 2 |

Transaction and target input must be positive, without commas, signs, exponents or a leading decimal point. The maximum for one transaction or target is 999,999,999.99 major units for two-decimal currencies, or 999,999,999 yen. JPY amounts must be whole units. Descriptions are trimmed and limited to 80 characters. Dates from 1900-01-01 through 2100-12-31 are accepted, although providers may not have rates for every date.

## Getting started

### Requirements and installation

A currently patched Node.js 24 LTS, npm, and a modern browser with JavaScript and `localStorage` enabled are required. Editing also requires Web Locks in a secure context (HTTPS or localhost); without them the app is read-only. Automatic reference-rate retrieval needs internet access. The app itself requires no backend, database, API key or environment variables.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The development server normally uses port 5173 if available. It binds to `0.0.0.0`; on a shared network, consider who can reach it. The Vite configuration permits the `.e2b.app` preview host suffix as well as Vite's default hosts. Configure any other host explicitly when needed.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm test` | Run the domain, FX, migration, backup and storage tests. |
| `npm run build` | Create a static production build in `dist/`. |
| `npm run preview` | Serve an existing production build locally for inspection. |
| `npm run test:browser` | Run browser workflow and accessibility checks against a running server. |
| `npm run test:browser:built` | Start an isolated built-app preview and run all browser suites. |
| `npm run verify:access` | Probe listed production URLs for the configured Cloudflare Access challenge. |

For browser tests, first run `npx playwright install chromium firefox webkit` and install any OS libraries Playwright requests. Run `npm run build` followed by `npm run test:browser:built`, or start the app with `npm run dev` and run `npm run test:browser` in another terminal. The latter uses `http://127.0.0.1:5173/` by default; set `KOBO_TEST_URL` to change the URL. FX responses are mocked for reproducibility. `vite preview` is for inspecting a build, not serving production traffic.

## Using Kobo

### Month and currencies

Select the month with the month control. Its budget currency defaults to NGN and is separate from the global **View in** preference. Use **Change** beside the monthly budget currency to select another supported currency for that month. When entries exist, the change requires confirmation. Existing transactions retain their original currencies and stored pair-specific rates; new required conversions are fetched for their transaction dates.

A target has no transaction date, so it is not silently converted. If a target exists when the budget currency changes, choose either a new amount in the new currency or explicit removal of the old target, then confirm. A target or unused amount never carries into another month.

**View in** changes the display currency for summary cards, expense categories and transaction amounts, not the monthly budget currency or target progress. The selected display currency is stored as a preference and applies across months.

### Transactions and rates

Choose **Add transaction**, select income or expense, and enter the original amount and currency, category, date and optional description. The date determines the month; saving a date in a different month switches the view there. When adding an entry in the current month, the default date is today in the browser's local timezone; for another month it is the first day of that month.

After saving, each transaction shows its original amount and its view and budget conversions, including the rate, rate date, source and whether it is automatic, manual or an explicitly accepted earlier rate. Use **Edit rate** or **Resolve rate** beside a pair to:

- Enter the destination units for one unit of the original currency, including an effective bank rate.
- Enter what the bank actually charged in the destination currency and let Kobo derive a rate for that transaction.
- Search for an exact-date reference rate and explicitly use it.
- Search the previous 14 days for the closest earlier Frankfurter observation, review its date and explicitly accept it. An earlier rate is never used automatically.

A manual rate applies only to that transaction and currency pair. If a transaction has USD→NGN manually set and the display is EUR, the NGN target uses the manual USD→NGN rate while the EUR view uses a separate direct USD→EUR rate. No manual rate is silently reused for an unrelated pair. Changing a transaction's date or original currency invalidates its saved rates; if any are manual, Kobo asks before replacing them. Changing the amount while keeping date and currency retains its rates.

An automatic exact-date rate is requested for the visible month's required budget and display pairs. A successful observation is saved on the transaction; exact automatic observations may also be cached for another transaction with the same date and pair. Manual and accepted earlier rates are never shared via that cache. Saved observations are not silently refreshed when a provider later revises a rate. Select **Edit rate** and explicitly choose a new exact-date rate to replace one.

If no usable rate is available, the original amount is preserved; affected converted amounts are shown as incomplete, not as zero or as a guessed current rate. Known portions of totals and chart are labelled, and missing expense conversions make target progress incomplete. If a converted amount or total exceeds the safe calculation range, it is excluded and the affected totals are also marked incomplete. Retry or resolve the entry's rate where appropriate.

### Spending target and alerts

Choose **Set target** for the selected month, then edit or remove it as needed. Only expenses count toward target usage; a target does not create a transaction or change net. Kobo displays an in-app warning when known spending reaches 75% of the target and a further alert at 100% or more. These are visible app alerts, not push notifications. When expense conversions are missing, a threshold can still be shown if known expenses alone reach it, but the final percentage and remaining amount may be unknown.

### Sample data

**Try sample data** is available when the selected month has no transactions. Sample entries are labelled, originally denominated in NGN, and included in totals, chart and target progress until removed. **Remove samples** removes only marked samples in the selected month; an edited sample remains marked.

## Calculation and conversion rules

Amounts are positive integer minor units in their original currency. Type determines income or expense. Rates are decimal strings, and conversion uses integer arithmetic; each converted transaction is rounded half up once to the destination currency's minor unit before aggregation. For example, JPY is rounded to whole yen. Values that cannot be represented safely are not included in the affected total and are reported as incomplete.

For the selected month:

```text
view income / expenses = sums of each entry converted directly to the view currency
view net               = view income - view expenses
category share         = known view-currency category expenses / known view expenses × 100
budget spending        = sum of expenses converted directly to the monthly budget currency
target used            = budget spending / target × 100
remaining              = max(target - budget spending, 0)
over target            = max(budget spending - target, 0)
```

The progress bar caps visually at 100%; overspending and the displayed percentage can exceed 100%. If expenses are missing, category percentages describe the known expenses only. There is no target conversion convention: targets and their comparisons remain in the month's budget currency. Filtering the transaction list does not change totals, target progress, chart or monthly CSV.

## Historical rate sources and privacy

For an exact-date lookup Kobo first requests a pair from the keyless [Frankfurter API](https://frankfurter.dev/). If that does not yield a valid rate for the requested date and pair, it tries the dated [Fawaz Currency API](https://github.com/fawazahmed0/exchange-api) via jsDelivr and then its Cloudflare mirror. Earlier-rate search uses a 14-day Frankfurter time series. Responses are checked for supported currencies, a finite positive rate and the reported date; a later or different date is not silently treated as exact.

These are third-party reference rates, can be blended or revised by the provider, may not be available for every pair or day, and can differ from actual market, card or bank rates and fees. A provider's reported date does not guarantee all of its underlying source quotes were collected at the same instant. Availability and coverage can change; no service-level guarantee is provided. Manual rates are available when automatic retrieval fails or a bank rate is more appropriate.

The browser makes these requests directly. Providers can see the requested date and currency pair, or in the Fawaz fallback the date and base currency, together with normal network metadata such as IP address. The app does not send transaction amounts, descriptions or categories in rate requests. The financial records themselves are stored locally and are not uploaded to an application backend.

## Storage, migration and backup

Data is saved in browser `localStorage`, scoped to the site's origin, **without encryption**. Anyone with access to the browser profile or script access on that origin may be able to read it. Clearing site data may delete it; a different browser, device or origin will not automatically have it. Private browsing and storage restrictions may also remove or block data. There is no automatic backup, application account or synchronisation. Cloudflare Access, when configured, controls access to the site; it does not encrypt or share local budgets.

Current Kobo tabs on the same origin use a Web Lock to allow one editable tab at a time. Additional tabs display saved data in read-only mode and acquire editing access after the current writer closes. A browser without Web Locks or a secure context stays read-only. Changes by an older build, extension or other non-cooperating code can bypass this protocol; the stale-write check is not an atomic compare-and-swap and cannot prevent every such race. Close old-version tabs before upgrading. If a conflict is detected, download the session backup and reload; compare versions before restoring because restore replaces rather than merges.

The active document is stored under `kobo.budget.data.v2`, containing transactions, per-month currency and target settings, automatic-rate cache and the display preference. Each transaction holds the rates actually used for its destination pairs. The previous keys, `kobo.budget.transactions.v1` and `kobo.budget.targets.v1`, are read when no v2 document exists. Valid v1 amounts and targets migrate as NGN, and the old keys are left untouched. Once v2 exists, it is authoritative; the old keys are not kept in sync. Reverting to an older app would therefore not show newer v2 changes.

Saved documents and imported backups are validated, including transaction IDs, currencies, amounts, dates and rate provenance. If saved data cannot be read, the app warns and blocks ordinary edits rather than replacing it with an empty document; an explicit restore remains available in the editable tab. Some valid data may still be visible in the session. If saving fails, a warning is displayed. Keep the tab open, download a backup and use **Retry saving this session** after storage is available. A backup taken while a read is blocked contains only data visible in the session, not unreadable records. If an unexpected render failure occurs, the recovery screen can download the raw saved keys, including malformed ones; that unencrypted file is not directly restorable and cannot include unsaved session changes.

Choose **Backup → Download backup** for an unencrypted JSON file containing all months, transactions, targets, currencies, saved per-transaction rates, automatic-rate cache and display preference. Store it securely. To restore, choose a Kobo JSON backup (up to 10 MiB), review the confirmation, then explicitly replace the current budget. The app validates the file and attempts an atomic localStorage write before replacing in-memory data. Restore replaces all current data; it does not merge. If the write fails, the current budget is not replaced. An explicit restore can replace an unreadable v2 document; old v1 keys remain untouched.

## CSV report

**Export CSV** downloads all selected-month transactions as `kobo-transactions-YYYY-MM.csv`, regardless of the active filter. It includes sample entries until removed and is disabled for an empty month. Columns contain date, type, category, description, original amount and currency; view and budget amounts, currencies, rates, rate dates, provenance and sources; and the sample flag. A missing or unsafe conversion is labelled rather than guessed. Values are positive; Type distinguishes income and expense. The export is UTF-8 with a byte-order mark, quoted cells and spreadsheet-formula protection.

CSV excludes targets, other months and unused cached rates. It cannot be imported and is not a full backup. CSV and JSON downloads are not encrypted by the app.

## Architecture

```text
src/
  App.jsx                         Dashboard, persistence and FX request orchestration
  main.jsx                        React entry point
  styles.css                      Plain-CSS dark theme and responsive layout
  hooks/
    useBudgetStore.js             Single-writer lock, persistence and recovery handling
  components/
    RecoveryBoundary.jsx          Render-failure screen and raw saved-data export
    TransactionForm.jsx           Original-currency transaction entry
    TargetForm.jsx                Monthly target entry and removal
    SpendingTarget.jsx            Progress, incomplete state and threshold alerts
    BudgetCurrencyForm.jsx        Monthly base-currency changes and confirmation
    RateDialog.jsx                Manual, bank-derived and reviewed reference rates
    BackupDialog.jsx              Full JSON backup and confirmed restore
    CategoryIcon.jsx              Category icon mapping
    Dialog.jsx                    Shared modal and keyboard focus handling
  lib/
    currency.js                   Currency metadata and precision-safe arithmetic
    dates.js                      Calendar validation and formatting
    rates.js                      Rate validation, exact lookup and earlier search
    budget.js                     Categories, summaries, targets, samples and CSV
    storage.js                    Guarded storage, migration and backup validation
tests/
  budget.test.js                  Original domain and legacy-storage coverage
  multicurrency.test.js           FX, precision, migration and backup coverage
  browser-workflows.mjs           Mocked browser workflows and accessibility
  browser-edge.mjs                Race, mobile and storage-failure checks
  browser-storage.mjs             Tab handoff, conflicts, failure and recovery checks
  browser-compat.mjs              Firefox and WebKit mobile/persistence smoke tests
scripts/                          Built-preview harness and Access verification probe
public/fonts/                     Self-hosted fonts and their licence texts
```

React holds interface state; summaries, target progress and alerts are derived, not stored as totals. The expense chart is a CSS conic-gradient doughnut with a readable category list. The UI uses React 18, JSX, Vite 8, plain CSS, Lucide icons and the browser's `Intl` API.

## Deployment and limitations

`npm run build` creates static assets in `dist/`. The current build and font references assume the site is served from the origin root; hosting under a subpath requires adjusting the Vite base and root-relative assets. Editing requires HTTPS (or localhost). Because storage is origin-scoped, moving to a new origin does not move data; export a JSON backup while the old origin is available and restore it on the new one. See `DEPLOYMENT.md` for the private Cloudflare Pages deployment and verification checklist. No production site or Access policy is configured by this repository.

There is no bank integration, live bank-rate feed, account balance reconciliation, built-in authentication, server sync, CSV import, recurring entry support or custom categories. Reference-rate services may be unavailable. Local storage and downloads are unencrypted. The bundled DM Sans and DM Serif Display font licences are in `public/fonts/`. No separate application licence is specified in this repository.

## Private temporary Cloudflare preview

For a temporary shareable preview, a current version of `cloudflared` can use a protected Quick Tunnel with an email allowlist, without a Cloudflare account or domain. Install it using Cloudflare's official instructions, start the built-app preview, and create the tunnel:

```sh
npm ci
npm run build
npm run preview -- --port 4173
# In another terminal; substitute an address you control:
cloudflared tunnel --url http://localhost:4173 --http-host-header localhost:4173 --allowed-mail 'you@example.com'
```

Repeat `--allowed-mail` for other authorized individuals. An allowed visitor enters their email and then the one-time code Cloudflare sends to it. Do not send login codes or account tokens in chat. Avoid domain-wide wildcards unless access for every address at the domain is intentional. The temporary hostname changes each time the tunnel starts; the link stops when the tunnel process ends. Quick Tunnels do not provide an uptime guarantee and are not a production deployment.

The built-app Vite preview sends a Content Security Policy limiting script and font sources to the site, and allowing only the documented FX providers for external connections. Inline styles are allowed because the React interface uses dynamically generated styles; this is not a strict style policy. The preview also sends `nosniff`, referrer, permissions and cross-origin headers, and permits framing by the same origin and Arena domains. `public/_headers` supplies a stricter no-framing policy plus HSTS and caching rules on Cloudflare Pages; other hosting providers need their own header configuration. These headers are defense in depth, not a substitute for authentication or an independent security review.

Cloudflare email verification controls access to the preview link; it does not encrypt browser storage, JSON backups or CSVs. An authorized person with access to a device or exported file may still read its records. Data is scoped to the exact browser and origin: a new Quick Tunnel URL will not automatically contain the records from an old URL. Back up from the old origin and restore on the new one if both are still available.
