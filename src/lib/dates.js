export const MIN_DATE = '1900-01-01';
export const MAX_DATE = '2100-12-31';

export function localToday(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < MIN_DATE || value > MAX_DATE) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
export function isValidMonth(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) && isValidDate(`${value}-01`);
}
export function shiftMonth(value, offset) {
  if (!isValidMonth(value) || !Number.isInteger(offset)) return value;
  const [year, month] = value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  const result = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
  return isValidMonth(result) ? result : value;
}
export function formatMonth(value, options = { month: 'long', year: 'numeric' }) {
  if (!isValidMonth(value)) return '';
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-NG', { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}
export function formatDate(value, options = { day: 'numeric', month: 'short' }) {
  if (!isValidDate(value)) return value;
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-NG', { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}
export function dateForMonth(month, today = localToday()) { return today.slice(0, 7) === month ? today : `${month}-01`; }
