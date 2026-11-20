/** Supported currencies and their ISO 4217 minor-unit precision. */
export const CURRENCIES = [
  { code: 'NGN', name: 'Nigerian naira', decimals: 2 },
  { code: 'USD', name: 'US dollar', decimals: 2 },
  { code: 'EUR', name: 'Euro', decimals: 2 },
  { code: 'GBP', name: 'British pound', decimals: 2 },
  { code: 'JPY', name: 'Japanese yen', decimals: 0 },
  { code: 'CNY', name: 'Chinese yuan', decimals: 2 },
  { code: 'CAD', name: 'Canadian dollar', decimals: 2 },
  { code: 'AUD', name: 'Australian dollar', decimals: 2 },
  { code: 'CHF', name: 'Swiss franc', decimals: 2 },
  { code: 'INR', name: 'Indian rupee', decimals: 2 },
  { code: 'ZAR', name: 'South African rand', decimals: 2 },
];

export const DEFAULT_CURRENCY = 'NGN';
export const MAX_WHOLE_AMOUNT = 999_999_999;
const currencyByCode = new Map(CURRENCIES.map((currency) => [currency.code, currency]));
const formatters = new Map();

export function getCurrency(code) { return currencyByCode.get(code) ?? null; }
export function isCurrency(code) { return currencyByCode.has(code); }
export function maxAmountMinor(code) {
  const currency = getCurrency(code);
  if (!currency) return 0;
  return (MAX_WHOLE_AMOUNT + 1) * 10 ** currency.decimals - 1;
}

/** Parse major units without floating point. A record may never exceed 999,999,999 whole units. */
export function parseAmount(raw, code = DEFAULT_CURRENCY) {
  const currency = getCurrency(code);
  if (!currency) return { ok: false, error: 'Choose a supported currency.' };
  const value = String(raw ?? '').trim();
  const pattern = currency.decimals === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${currency.decimals}})?$`);
  if (!pattern.test(value)) {
    return { ok: false, error: currency.decimals === 0
      ? `${code} uses whole units. Enter an amount without decimal places.`
      : `Enter a number with up to ${currency.decimals} decimal places, like 5000.50.` };
  }
  const [whole, fraction = ''] = value.split('.');
  if (whole.replace(/^0+/, '').length > 9) return { ok: false, error: `The maximum is ${code} 999,999,999${currency.decimals ? '.99' : ''}.` };
  const minor = Number(whole) * 10 ** currency.decimals + Number(fraction.padEnd(currency.decimals, '0') || '0');
  if (!Number.isSafeInteger(minor) || minor > maxAmountMinor(code)) return { ok: false, error: `The maximum is ${code} 999,999,999${currency.decimals ? '.99' : ''}.` };
  if (minor <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
  return { ok: true, minor };
}

export function minorToInput(minor, code = DEFAULT_CURRENCY) {
  const currency = getCurrency(code);
  if (!currency || !Number.isSafeInteger(minor)) return '';
  const negative = minor < 0;
  const amount = BigInt(negative ? -minor : minor);
  const scale = 10n ** BigInt(currency.decimals);
  const whole = amount / scale;
  const fraction = currency.decimals ? `.${String(amount % scale).padStart(currency.decimals, '0')}` : '';
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

/** Format safely even near Number.MAX_SAFE_INTEGER, without rounding away minor units. */
export function formatMoney(minor, code = DEFAULT_CURRENCY) {
  const currency = getCurrency(code);
  if (!currency || !Number.isSafeInteger(minor)) return '—';
  if (!formatters.has(code)) formatters.set(code, new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: code, minimumFractionDigits: currency.decimals, maximumFractionDigits: currency.decimals,
  }));
  const negative = minor < 0;
  const amount = BigInt(negative ? -minor : minor);
  const scale = 10n ** BigInt(currency.decimals);
  const whole = amount / scale;
  const fraction = String(amount % scale).padStart(currency.decimals, '0');
  // -0 preserves the sign when a negative net is smaller than one major unit.
  const signedWhole = negative ? (whole === 0n ? -0 : -whole) : whole;
  return formatters.get(code).formatToParts(signedWhole).map((part) => part.type === 'fraction' ? fraction : part.value).join('');
}

function expandExponent(value) {
  const string = String(value).toLowerCase();
  if (!string.includes('e')) return string;
  const [coefficient, exponentText] = string.split('e');
  const exponent = Number(exponentText);
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = whole + fraction;
  const decimalAt = whole.length + exponent;
  if (decimalAt <= 0) return `0.${'0'.repeat(-decimalAt)}${digits}`;
  if (decimalAt >= digits.length) return digits + '0'.repeat(decimalAt - digits.length);
  return `${digits.slice(0, decimalAt)}.${digits.slice(decimalAt)}`;
}

/** Store rates as decimal strings, so conversion can use exact integer arithmetic. */
export function parseRate(raw) {
  const value = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? expandExponent(raw) : String(raw ?? '').trim();
  if (!/^\d{1,12}(?:\.\d{1,18})?$/.test(value)) {
    return { ok: false, error: 'Enter a positive rate with up to 18 decimal places, without commas or exponents.' };
  }
  let [whole, fraction = ''] = value.split('.');
  whole = whole.replace(/^0+(?=\d)/, '');
  fraction = fraction.replace(/0+$/, '');
  const normalized = fraction ? `${whole}.${fraction}` : whole;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0 || number > 1_000_000_000) {
    return { ok: false, error: 'The rate must be greater than zero and no more than 1,000,000,000.' };
  }
  return { ok: true, rate: normalized };
}

export function formatRate(rate) {
  const parsed = parseRate(rate);
  if (!parsed.ok) return '—';
  const [whole, fraction] = parsed.rate.split('.');
  return `${new Intl.NumberFormat('en-NG').format(BigInt(whole))}${fraction ? `.${fraction}` : ''}`;
}

/** Convert major-unit rates to target minor units, rounding half up once per transaction. */
export function convertMinor(amountMinor, from, to, rate) {
  const source = getCurrency(from);
  const destination = getCurrency(to);
  const parsed = parseRate(rate);
  if (!source || !destination || !Number.isSafeInteger(amountMinor) || amountMinor < 0 || !parsed.ok) return null;
  const [whole, fraction = ''] = parsed.rate.split('.');
  const numerator = BigInt(whole + fraction);
  const denominator = 10n ** BigInt(fraction.length);
  const top = BigInt(amountMinor) * numerator * 10n ** BigInt(destination.decimals);
  const bottom = denominator * 10n ** BigInt(source.decimals);
  const result = (top + bottom / 2n) / bottom;
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}

/** Derive an effective major-unit rate from what the bank actually charged. */
export function rateFromBankAmount(originalMinor, from, chargedMinor, to) {
  const source = getCurrency(from);
  const destination = getCurrency(to);
  if (!source || !destination || !Number.isSafeInteger(originalMinor) || originalMinor <= 0 || !Number.isSafeInteger(chargedMinor) || chargedMinor <= 0) return null;
  const precision = 18n;
  const numerator = BigInt(chargedMinor) * 10n ** BigInt(source.decimals) * 10n ** precision;
  const denominator = BigInt(originalMinor) * 10n ** BigInt(destination.decimals);
  const scaled = (numerator + denominator / 2n) / denominator;
  const digits = String(scaled).padStart(Number(precision) + 1, '0');
  const candidate = `${digits.slice(0, -Number(precision))}.${digits.slice(-Number(precision))}`;
  const parsed = parseRate(candidate);
  if (!parsed.ok || convertMinor(originalMinor, from, to, parsed.rate) !== chargedMinor) return null;
  return parsed.rate;
}

/** A bank's converted charge can exceed the per-entry original-amount limit. */
export function parseConvertedAmount(raw, code) {
  const currency = getCurrency(code);
  if (!currency) return { ok: false, error: 'Choose a supported currency.' };
  const value = String(raw ?? '').trim();
  const pattern = currency.decimals === 0 ? /^\d{1,16}$/ : new RegExp(`^\\d{1,16}(?:\\.\\d{1,${currency.decimals}})?$`);
  if (!pattern.test(value)) return { ok: false, error: currency.decimals ? 'Enter a positive amount with up to 2 decimal places, without commas.' : 'Enter a positive whole-unit amount, without commas.' };
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole) * 10n ** BigInt(currency.decimals) + BigInt(fraction.padEnd(currency.decimals, '0') || '0');
  if (result <= 0n || result > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, error: 'Enter a positive amount within the supported calculation range.' };
  return { ok: true, minor: Number(result) };
}
