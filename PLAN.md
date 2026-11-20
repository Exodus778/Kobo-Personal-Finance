# Kobo: budget tracker logic & layout plan

**Status:** working local-first React application with independent monthly budgets, multiple currencies, historical rates, spending alerts and complete JSON backups.

## 1. Product decisions

- Each calendar month is independent. Neither the net nor target carries into another month.
- NGN is the default; USD, EUR, GBP, JPY, CNY, CAD, AUD, CHF, INR and ZAR are also supported.
- Transactions retain their original amount and currency. A monthly budget currency determines the target; **View in** separately determines the currency for totals, categories and transaction amounts.
- Historical conversions use rates for each transaction's date, not today's rate. Preserve the rate, date and source actually used; manual rates and effective bank rates are available per transaction and pair.
- If an exact-date rate is unavailable, allow manual entry or explicit acceptance of an earlier published rate. Mark affected totals incomplete rather than guessing.
- The monthly target has no date. Keep the target and progress in its budget currency; changing View in does not change the percentage. Replacing a budget currency after entries exist requires confirmation. A target must be explicitly replaced or removed when its currency changes.
- Show in-app alerts at 75% and 100% of the target. Provide a full backup/restore separate from the monthly CSV report.
- Keep a dark, sleek visual direction, plain CSS and equally considered mobile and desktop layouts.

## 2. Logic and data

### Transactions and rates

- Each entry has an ID, type, original currency and positive integer minor-unit amount, type-specific category, date, optional description, creation timestamp, sample marker and a map of destination-specific rate observations.
- Supported currencies have two minor-unit decimal places except JPY, which has none. Per transaction or target, the maximum is 999,999,999.99 major units for two-decimal currencies or 999,999,999 JPY.
- Fetch exact-date reference rates from Frankfurter with the dated Fawaz Currency API as a fallback. Validate the date, pair and positive rate. Cache only exact automatic observations; per-transaction manual and accepted earlier rates are not shared through the cache.
- An earlier observation is obtained through an explicit 14-day lookback and is applied only when the user accepts its displayed date. Reference rates may differ from bank charges and may be unavailable.
- Convert directly from each transaction's original currency to the requested destination. A manual USD→NGN rate does not become a USD→EUR rate; a different pair needs its own observation. Round each transaction once, half up, to the destination's minor unit before summing. Unsafe or missing conversions are excluded and clearly labelled incomplete.
- Changing an entry's date or original currency invalidates saved rates. If manual rates exist, require confirmation before replacing them. Changing its amount alone retains the rate.

### Monthly totals, target and alerts

For the selected month only:

- **Money in** = sum of converted income; **money out** = sum of converted expenses.
- **Monthly net** = money in − money out, not a bank balance.
- **Category share** = category expense ÷ known total expense, in the view currency. Incomplete charts are labelled.
- **Target used** = expenses converted to the month's budget currency ÷ its target. Income is excluded. **Remaining** is target minus expenses when under; show the amount over when exceeded. The bar caps at 100% while the percentage can exceed it.
- Show an in-app warning when known spending reaches 75%, and a target-reached alert at 100%. When expense conversions are missing, label progress incomplete and do not claim an accurate remaining amount.

### Persistence and safety

- Store a validated v2 budget document in localStorage. When v2 is absent, migrate valid legacy v1 transaction and target keys as NGN without deleting or changing those keys. An unreadable saved document blocks automatic writes rather than being silently overwritten.
- Full JSON backup includes all months, transactions, targets, currencies, saved rate observations, cache and view preference. Import validates and confirms replacement, then writes atomically; it does not merge. CSV is a selected-month report with conversion details, not a restore format.
- Data and downloads are not encrypted; no account, bank integration, automatic backup or cross-device sync exists. Current same-origin tabs coordinate a single writer via Web Locks; non-cooperating old versions remain a risk. Rate providers receive the requested date and pair or base plus network metadata, not transaction amounts or descriptions.
- Sample transactions are tagged, count until removed and stay in their selected month.

## 3. Style stack

| Layer | Choice |
| --- | --- |
| App | React 18, JSX and Vite |
| Styles | Plain CSS with reusable design tokens and responsive breakpoints |
| Icons | Lucide React |
| Chart | CSS conic-gradient doughnut plus a readable category list |
| Numbers | Integer minor units, decimal-string rates and browser `Intl` formatting |
| Storage | Browser `localStorage`, with a versioned JSON backup |
| Type | Self-hosted DM Sans and DM Serif Display |

The interface uses a charcoal and deep-green canvas, softly bordered surfaces, a pale-lime accent and restrained category colours.

## 4. Layout

**Desktop:** sidebar navigation; heading with backup, CSV and add actions; month picker; budget and view currency controls; net/income/expense cards; target and alerts; transactions and category chart side by side. Transaction rows expose original and converted amounts and rate provenance.

**Mobile:** compact brand bar; stacked actions, month and currency controls; full-width net with income and expense cards; target and alerts; transactions and chart stacked vertically. Dialogs and currency controls adapt to narrower screens. Focus styles, text labels and chart alternatives remain available.

## 5. Test coverage

`npm test` checks original and currency-specific amount parsing, precision and rounding, date boundaries, monthly isolation, rate provenance and fallback, target alerts, missing conversions, migration, full backup validation, CSV and storage errors. `npm run test:browser` checks the workflows, rate override race, mobile layout, accessibility, corrupt storage, atomic restore, multi-tab handoff and recovery. `npm run test:browser:built` runs them against the built app; see `read.md` for setup.
