import { isCurrency, parseRate } from './currency.js';
import { isValidDate, MIN_DATE } from './dates.js';

export const FRANKFURTER_SOURCE = 'Frankfurter reference rates';
export const FAWAZ_SOURCE = 'Fawaz Currency API reference rates';

export function rateKey(date, from, to) { return `${date}|${from}|${to}`; }

/** A transaction owns its rate. Manual and earlier rates are never global-cache entries. */
export function isValidRate(rate, from, to, transactionDate) {
  if (!rate || typeof rate !== 'object' || Array.isArray(rate) || !isCurrency(from) || !isCurrency(to) || from === to) return false;
  if (rate.from !== from || rate.to !== to || !isValidDate(rate.date) || !parseRate(rate.rate).ok) return false;
  if (typeof rate.rate !== 'string' || typeof rate.source !== 'string' || !rate.source || rate.source.length > 120) return false;
  if (!['automatic', 'manual', 'earlier'].includes(rate.kind)) return false;
  if (!isValidDate(transactionDate)) return false;
  if (rate.kind === 'earlier') return rate.date < transactionDate;
  return rate.date === transactionDate;
}

function observation(from, to, date, rawRate, source, kind = 'automatic') {
  const result = parseRate(rawRate);
  return result.ok ? { from, to, date, rate: result.rate, source, kind } : null;
}

async function jsonRequest(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch only an observation explicitly labelled with the transaction date. */
export async function fetchExactRate(date, from, to, fetchImpl = globalThis.fetch) {
  if (!isValidDate(date) || !isCurrency(from) || !isCurrency(to) || from === to || typeof fetchImpl !== 'function') return null;
  const frankfurter = await jsonRequest(`https://api.frankfurter.dev/v2/rate/${from}/${to}?date=${date}`, fetchImpl);
  if (frankfurter?.date === date && frankfurter?.base === from && frankfurter?.quote === to) {
    const rate = observation(from, to, date, frankfurter.rate, FRANKFURTER_SOURCE);
    if (rate) return rate;
  }
  const lower = from.toLowerCase();
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${lower}.json`,
    `https://${date}.currency-api.pages.dev/v1/currencies/${lower}.json`,
  ];
  for (const url of urls) {
    const body = await jsonRequest(url, fetchImpl);
    if (body?.date === date) {
      const rate = observation(from, to, date, body?.[lower]?.[to.toLowerCase()], FAWAZ_SOURCE);
      if (rate) return rate;
    }
  }
  return null;
}

function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

/** Offer, but never automatically apply, the closest published rate in a 14-day lookback. */
export async function findEarlierRate(date, from, to, fetchImpl = globalThis.fetch) {
  if (!isValidDate(date) || !isCurrency(from) || !isCurrency(to) || from === to || typeof fetchImpl !== 'function' || date === MIN_DATE) return null;
  const previous = addDays(date, -1);
  const start = addDays(date, -14) < MIN_DATE ? MIN_DATE : addDays(date, -14);
  const url = `https://api.frankfurter.dev/v2/rates?from=${start}&to=${previous}&base=${from}&quotes=${to}`;
  const body = await jsonRequest(url, fetchImpl);
  if (!Array.isArray(body)) return null;
  const candidates = body.filter((item) => item && item.base === from && item.quote === to && isValidDate(item.date) && item.date >= start && item.date <= previous && parseRate(item.rate).ok)
    .sort((a, b) => b.date.localeCompare(a.date));
  return candidates.length ? observation(from, to, candidates[0].date, candidates[0].rate, FRANKFURTER_SOURCE, 'earlier') : null;
}
