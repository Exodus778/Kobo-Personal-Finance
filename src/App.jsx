import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, ArrowRight, ChartPie, Check, ChevronLeft, ChevronRight,
  CircleHelp, ClipboardList, Download, FolderArchive, LayoutDashboard, Leaf, LockKeyhole, Pencil,
  Plus, ReceiptText, RefreshCw, Sparkles, Sun, Target, Trash2, WalletCards, X,
} from 'lucide-react';
import TransactionForm from './components/TransactionForm.jsx';
import TargetForm from './components/TargetForm.jsx';
import SpendingTarget from './components/SpendingTarget.jsx';
import BudgetCurrencyForm from './components/BudgetCurrencyForm.jsx';
import RateDialog from './components/RateDialog.jsx';
import BackupDialog from './components/BackupDialog.jsx';
import CategoryIcon from './components/CategoryIcon.jsx';
import Dialog from './components/Dialog.jsx';
import {
  calculateMonthlySummary, formatDate, formatMonth, getCategory, isValidMonth, localToday,
  makeId, makeSampleTransactions, monthSettings, requiredRateRequests, shiftMonth,
  transactionConversion, transactionsToCsv,
} from './lib/budget.js';
import { CURRENCIES, formatMoney, formatRate, getCurrency } from './lib/currency.js';
import { fetchExactRate, rateKey } from './lib/rates.js';
import { createBackup } from './lib/storage.js';
import useBudgetStore from './hooks/useBudgetStore.js';

const THEME_STORAGE_KEY = 'kobo.theme';
function readTheme() {
  try { return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}
function plural(count, singular, pluralForm = `${singular}s`) { return `${count} ${count === 1 ? singular : pluralForm}`; }
function downloadFile(contents, mime, filename) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Brand({ compact = false }) {
  return <a className={`brand ${compact ? 'brand-compact' : ''}`} href="#overview" aria-label="Kobo budget tracker, go to overview"><span className="brand-mark" aria-hidden="true"><span>k</span><i /></span><span className="brand-word">kobo<span>.</span><small>PERSONAL FINANCE</small></span></a>;
}
function ThemeToggle({ theme, onToggle, className }) {
  return <button type="button" className={`theme-toggle ${className}`} role="switch" aria-label="Light mode" aria-checked={theme === 'light'} title={theme === 'light' ? 'Turn off light mode' : 'Turn on light mode'} onClick={onToggle}><Sun size={15} aria-hidden="true" /><span className="theme-toggle-label">Light</span><span className="theme-switch-track" aria-hidden="true"><span /></span></button>;
}
function Sidebar({ storageError }) {
  return <aside className="sidebar"><Brand /><div className="sidebar-rule" /><p className="sidebar-label">YOUR SPACE</p>
    <nav className="side-nav" aria-label="Page sections"><a className="nav-link nav-primary" href="#overview"><LayoutDashboard size={17} /><span>Overview</span><span className="nav-dot" /></a><a className="nav-link" href="#target"><Target size={17} /><span>Spending target</span></a><a className="nav-link" href="#transactions"><ReceiptText size={17} /><span>Transactions</span></a><a className="nav-link" href="#spending"><ChartPie size={17} /><span>Spending</span></a></nav>
    <div className="sidebar-bottom"><div className="sidebar-message"><div className="sidebar-message-icon"><Leaf size={18} /></div><p className="sidebar-message-title">A little more clarity.</p><p>Good habits start with knowing where your money goes.</p><span className="sidebar-decoration sidebar-decoration-one" aria-hidden="true" /><span className="sidebar-decoration sidebar-decoration-two" aria-hidden="true" /></div>
      <div className="sidebar-privacy"><LockKeyhole size={15} /><span><strong>{storageError ? 'Storage needs attention' : 'Your data stays here'}</strong><small>{storageError ? 'See the notice on this page' : 'Stored locally · rates online'}</small></span></div></div>
  </aside>;
}
function MonthPicker({ month, onChange }) {
  return <div className="month-picker" aria-label="Choose a month"><button className="month-arrow" type="button" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))} disabled={month === '1900-01'}><ChevronLeft size={17} /></button><label className="month-input-wrap"><span className="sr-only">Selected month</span><input type="month" min="1900-01" max="2100-12" value={month} onChange={(event) => { if (isValidMonth(event.target.value)) onChange(event.target.value); }} /></label><button className="month-arrow" type="button" aria-label="Next month" onClick={() => onChange(shiftMonth(month, 1))} disabled={month === '2100-12'}><ChevronRight size={17} /></button></div>;
}
function CurrencyControls({ setting, viewCurrency, onBase, onView, readOnly }) {
  return <div className="currency-controls">
    <div className="budget-currency"><div><span className="currency-kicker">MONTHLY BUDGET CURRENCY</span><strong>{setting.currency} <span>— {getCurrency(setting.currency).name}</span></strong><small>For your target &amp; progress</small></div><button type="button" className="currency-change" onClick={onBase} disabled={readOnly}>Change <Pencil size={12} /></button></div>
    <div className="view-currency"><label htmlFor="view-currency">VIEW IN</label><select id="view-currency" value={viewCurrency} onChange={(event) => onView(event.target.value)} disabled={readOnly}>{CURRENCIES.map((currency) => <option value={currency.code} key={currency.code}>{currency.code} — {currency.name}</option>)}</select><small>For totals, chart &amp; transactions</small></div>
  </div>;
}
function SummaryCards({ summary }) {
  const currency = summary.currency;
  return <div className="summary-grid">
    <article className="summary-card net-card"><div className="summary-top"><span>Monthly net</span><span className="summary-icon net-icon"><WalletCards size={18} /></span></div><p className="summary-amount" title={formatMoney(summary.net, currency)}>{formatMoney(summary.net, currency)}</p><div className="summary-note"><span className="small-dot" />{summary.complete ? 'Income minus spending' : 'Incomplete · known entries only'}</div><div className="net-orbit net-orbit-one" aria-hidden="true" /><div className="net-orbit net-orbit-two" aria-hidden="true" /></article>
    <article className="summary-card light-card"><div className="summary-top"><span>Money in</span><span className="summary-icon in-icon"><ArrowDownLeft size={19} /></span></div><p className="summary-amount" title={formatMoney(summary.income, currency)}>{formatMoney(summary.income, currency)}</p><div className="summary-note"><span className="summary-note-icon note-in"><ArrowDownLeft size={12} /></span>{summary.missingIncome ? 'Incomplete · known income' : plural(summary.incomeCount, 'income entry', 'income entries')}</div></article>
    <article className="summary-card light-card"><div className="summary-top"><span>Money out</span><span className="summary-icon out-icon"><ArrowUpRight size={19} /></span></div><p className="summary-amount" title={formatMoney(summary.expense, currency)}>{formatMoney(summary.expense, currency)}</p><div className="summary-note"><span className="summary-note-icon note-out"><ArrowUpRight size={12} /></span>{summary.missingExpense ? 'Incomplete · known expenses' : plural(summary.expenseCount, 'expense entry', 'expense entries')}</div></article>
  </div>;
}
function RateLine({ entry, currency, label, lookupStatus, onRate, readOnly }) {
  if (entry.currency === currency) return <div className="rate-line"><span><strong>{label}</strong> · {currency} original; no conversion</span></div>;
  const conversion = transactionConversion(entry, currency);
  const rate = conversion.rate;
  const status = lookupStatus[rateKey(entry.date, entry.currency, currency)];
  let text;
  if (rate) {
    const provenance = rate.kind === 'manual' ? 'Manual' : rate.kind === 'earlier' ? 'Earlier published rate · accepted' : 'Automatic';
    text = <>{conversion.amount !== null && <>{formatMoney(conversion.amount, currency)} · </>}1 {entry.currency} = {formatRate(rate.rate)} {currency} · {provenance} · {rate.date} · {rate.source}{conversion.reason === 'too-large' && ' · amount too large'}</>;
  } else text = readOnly ? 'Conversion incomplete · edit in the active tab' : status === 'error' ? 'Rate unavailable · conversion incomplete' : 'Looking up a historical rate…';
  return <div className="rate-line"><span><strong>{label}</strong> · {text}</span><button type="button" disabled={readOnly} onClick={() => onRate(entry, currency)} aria-label={`${rate ? 'Edit' : 'Resolve'} ${label.toLowerCase()} rate for ${entry.description || getCategory(entry.type, entry.category)?.label}`}>{rate ? 'Edit rate' : 'Resolve rate'}</button></div>;
}
function TransactionsCard({ entries, filter, viewCurrency, budgetCurrency, lookupStatus, onFilter, onAdd, onLoadSample, onEdit, onDelete, onRate, readOnly }) {
  const filtered = filter === 'all' ? entries : entries.filter((entry) => entry.type === filter);
  const filters = [['all', 'All'], ['income', 'Income'], ['expense', 'Expenses']];
  return <section className="panel transactions-panel" id="transactions" aria-labelledby="transactions-title">
    <div className="panel-heading transaction-heading"><div><p className="eyebrow">THE DETAILS</p><h2 id="transactions-title">Transactions <span className="count-pill">{entries.length}</span></h2><p className="panel-subtitle">Original amounts, with conversions you can trace.</p></div><button className="add-small" type="button" disabled={readOnly} onClick={onAdd}><Plus size={16} /><span>Add new</span></button></div>
    <div className="transaction-toolbar"><div className="filter-group" aria-label="Filter transactions by type">{filters.map(([value, label]) => <button key={value} type="button" className={`filter-button ${filter === value ? 'active' : ''}`} aria-pressed={filter === value} onClick={() => onFilter(value)}>{label}</button>)}</div><span className="showing-count">{plural(filtered.length, 'entry', 'entries')}</span></div>
    {entries.length === 0 ? <div className="transactions-empty"><div className="empty-illustration" aria-hidden="true"><span className="empty-sparkle one">✳</span><ClipboardList size={27} strokeWidth={1.45} /><span className="empty-sparkle two">✦</span></div><h3>A fresh start for your finances</h3><p>Your transactions will show up here.<br />Add one to get started, or explore with sample data.</p><div className="empty-actions"><button className="button button-primary small-button" type="button" disabled={readOnly} onClick={onAdd}><Plus size={15} /> Add transaction</button><button className="text-button" type="button" disabled={readOnly} onClick={onLoadSample}>Try sample data <ArrowRight size={14} /></button></div></div>
      : filtered.length === 0 ? <div className="filter-empty"><span className="filter-empty-icon"><ReceiptText size={19} /></span><h3>No {filter === 'income' ? 'income' : 'expenses'} this month</h3><p>Try another filter or add a new transaction.</p></div>
        : <div className="transaction-list"><div className="list-column-labels" aria-hidden="true"><span>TRANSACTION</span><span>VIEW AMOUNT · {viewCurrency}</span></div>
          {filtered.map((entry) => { const category = getCategory(entry.type, entry.category); const title = entry.description || category?.label || 'Transaction'; const converted = transactionConversion(entry, viewCurrency);
            return <div className="transaction-row" key={entry.id}><div className="transaction-main"><CategoryIcon type={entry.type} category={entry.category} /><div className="transaction-info"><span className="transaction-name" title={title}>{title}</span><span className="transaction-meta">{category?.label} <i /> {formatDate(entry.date)} {entry.sample && <><i /><span className="sample-tag">Sample</span></>}</span></div>
              <div className="transaction-amount-block"><span className={`transaction-amount ${entry.type === 'income' ? 'positive' : ''} ${converted.amount === null ? 'amount-missing' : ''}`} aria-label={`${entry.type === 'income' ? 'Income' : 'Expense'} ${converted.amount === null ? 'conversion incomplete' : formatMoney(converted.amount, viewCurrency)}`}>{converted.amount === null ? 'Incomplete' : <>{entry.type === 'income' ? '+' : '−'}{formatMoney(converted.amount, viewCurrency)}</>}</span><small>{viewCurrency} view</small></div>
              <div className="row-actions"><button type="button" className="row-action" disabled={readOnly} onClick={() => onEdit(entry)} aria-label={`Edit ${title}`} title="Edit"><Pencil size={15} /></button><button type="button" className="row-action delete-action" disabled={readOnly} onClick={() => onDelete(entry)} aria-label={`Delete ${title}`} title="Delete"><Trash2 size={15} /></button></div></div>
              <div className="transaction-conversions"><div className="original-line"><strong>Original</strong> · {formatMoney(entry.amountMinor, entry.currency)} {entry.currency}</div>
                {viewCurrency === budgetCurrency ? <RateLine entry={entry} currency={viewCurrency} label="View & budget" lookupStatus={lookupStatus} onRate={onRate} readOnly={readOnly} /> : <><RateLine entry={entry} currency={viewCurrency} label="View" lookupStatus={lookupStatus} onRate={onRate} readOnly={readOnly} /><RateLine entry={entry} currency={budgetCurrency} label="Budget" lookupStatus={lookupStatus} onRate={onRate} readOnly={readOnly} /></>}
              </div></div>;
          })}</div>}
    <div className="panel-footnote"><LockKeyhole size={13} /> Entries stay here; rate lookups go online.</div>
  </section>;
}
function percentageLabel(value) { if (value > 0 && value < 1) return '<1%'; return `${Math.round(value)}%`; }
function SpendingCard({ summary, month }) {
  let cursor = 0;
  const gradient = summary.breakdown.length ? `conic-gradient(${summary.breakdown.map((item, index) => { const start = cursor; cursor += item.percentage; return `${item.color} ${start}% ${index === summary.breakdown.length - 1 ? 100 : cursor}%`; }).join(', ')})` : undefined;
  return <section className="panel spending-panel" id="spending" aria-labelledby="spending-title"><div className="panel-heading"><div><p className="eyebrow">WHERE IT GOES · {summary.currency}</p><h2 id="spending-title">Spending breakdown</h2><p className="panel-subtitle">{summary.missingExpense ? 'Incomplete; known expenses only.' : 'Your expenses, by category.'}</p></div><span className="panel-icon"><ChartPie size={18} /></span></div>
    <div className="chart-wrap"><div className={`donut ${!gradient ? 'empty-donut' : ''}`} style={gradient ? { background: gradient } : undefined} aria-hidden="true"><div className="donut-hole"><span>{summary.missingExpense ? 'Known spent' : 'Total spent'}</span><strong title={formatMoney(summary.expense, summary.currency)}>{formatMoney(summary.expense, summary.currency)}</strong><small>{formatMonth(month, { month: 'short' })}</small></div></div></div>
    {summary.breakdown.length ? <ul className="category-list" aria-label="Expense categories and their share of known spending">{summary.breakdown.map((item) => <li className="category-row" key={item.id}><span className="category-dot" style={{ backgroundColor: item.color }} /><span className="category-name">{item.label}</span><span className="category-percent">{percentageLabel(item.percentage)}</span><strong>{formatMoney(item.amountMinor, summary.currency)}</strong></li>)}</ul>
      : <div className="chart-empty"><p>{summary.missingExpense ? 'Expense conversions are incomplete' : 'No expenses to show yet'}</p><span>{summary.missingExpense ? 'Resolve missing rates to complete this breakdown.' : 'Once you add an expense, you’ll see where it goes.'}</span></div>}
    <div className="spending-footer"><span className="footer-indicator" /> {summary.missingExpense ? 'Shares of known expenses only' : `Based on expenses in ${formatMonth(month)}`}</div>
  </section>;
}
function DeleteDialog({ entry, onCancel, onConfirm }) {
  const title = entry.description || getCategory(entry.type, entry.category)?.label || 'this transaction';
  return <Dialog onClose={onCancel} labelledBy="delete-title" describedBy="delete-description" className="confirm-dialog"><div className="delete-dialog-icon"><Trash2 size={20} /></div><h2 id="delete-title">Delete this transaction?</h2><p id="delete-description">“{title}” will be removed from your budget and monthly totals. This can’t be undone.</p><div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onCancel} data-autofocus>Cancel</button><button className="button button-danger" type="button" onClick={onConfirm}>Delete transaction</button></div></Dialog>;
}

export default function App() {
  const store = useBudgetStore();
  const { data, update: setData, canEdit, canRestore, isWritable, mode, readable, readErrors, writeError, dirty } = store;
  const [theme, setTheme] = useState(readTheme);
  const [month, setMonth] = useState(() => localToday().slice(0, 7));
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState(null);
  const [targetFormOpen, setTargetFormOpen] = useState(false);
  const [baseFormOpen, setBaseFormOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [rateForm, setRateForm] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [notice, setNotice] = useState('');
  const [lookupStatus, setLookupStatus] = useState({});
  const inflight = useRef(new Map());
  const generation = useRef(0);
  const alive = useRef(true);
  const setting = monthSettings(data.months, month);
  const viewCurrency = data.viewCurrency;
  const summary = useMemo(() => calculateMonthlySummary(data.transactions, month, viewCurrency), [data.transactions, month, viewCurrency]);
  const baseSummary = useMemo(() => viewCurrency === setting.currency ? summary : calculateMonthlySummary(data.transactions, month, setting.currency), [data.transactions, month, setting.currency, viewCurrency, summary]);
  const requests = useMemo(() => requiredRateRequests(summary.entries, [setting.currency, viewCurrency]), [summary.entries, setting.currency, viewCurrency]);
  const sampleCount = summary.entries.filter((entry) => entry.sample).length;
  const storageErrors = [...readErrors, ...(writeError ? [writeError] : [])];
  const uniqueIssues = [...summary.missing, ...baseSummary.missing].filter((item, index, list) => list.findIndex((other) => other.transaction.id === item.transaction.id && other.currency === item.currency) === index);
  const missingRates = uniqueIssues.filter((item) => item.reason === 'missing-rate');
  const loadingRates = canEdit && missingRates.some((item) => lookupStatus[rateKey(item.transaction.date, item.transaction.currency, item.currency)] !== 'error');
  const hasFailedRate = missingRates.some((item) => lookupStatus[rateKey(item.transaction.date, item.transaction.currency, item.currency)] === 'error');

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3f6f0' : '#0e1511');
  }, [theme]);
  useEffect(() => {
    function syncTheme(event) {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      try { if (event.storageArea !== window.localStorage) return; } catch { return; }
      setTheme(event.key === THEME_STORAGE_KEY && event.newValue === 'light' ? 'light' : 'dark');
    }
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!notice) return undefined; const timer = setTimeout(() => setNotice(''), 3800); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!canEdit) { generation.current += 1; inflight.current.clear(); setLookupStatus({}); }
  }, [canEdit]);
  // Protect form drafts as well as edits that could not be persisted.
  useEffect(() => {
    if (!form && !targetFormOpen && !baseFormOpen && !rateForm) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [form, targetFormOpen, baseFormOpen, rateForm]);

  // Apply cached exact-date observations only to matching pairs. Manual and
  // explicitly accepted earlier rates are never shared through this cache.
  useEffect(() => {
    if (!canEdit) return;
    const cached = requests.filter((request) => data.rateCache[request.key]);
    if (cached.length) {
      setData((current) => {
        let changed = false;
        const entries = current.transactions.map((entry) => {
          let rates = entry.rates;
          for (const request of cached) {
            const saved = current.rateCache[request.key];
            if (saved && entry.date === request.date && entry.currency === request.from && !rates[request.to]) { rates = { ...rates, [request.to]: saved }; changed = true; }
          }
          return rates === entry.rates ? entry : { ...entry, rates };
        });
        return changed ? { ...current, transactions: entries } : current;
      });
    }
    const available = Math.max(0, 4 - inflight.current.size);
    const next = requests.filter((request) => !data.rateCache[request.key] && lookupStatus[request.key] !== 'error' && !inflight.current.has(request.key)).slice(0, available);
    for (const request of next) {
      const token = Symbol(request.key); const currentGeneration = generation.current;
      inflight.current.set(request.key, token);
      setLookupStatus((current) => ({ ...current, [request.key]: 'loading' }));
      fetchExactRate(request.date, request.from, request.to).then((rate) => {
        if (inflight.current.get(request.key) === token) inflight.current.delete(request.key);
        if (!alive.current || !isWritable() || generation.current !== currentGeneration) return;
        if (rate) {
          setData((current) => ({ ...current, rateCache: { ...current.rateCache, [request.key]: rate },
            transactions: current.transactions.map((entry) => entry.date === request.date && entry.currency === request.from && !entry.rates[request.to]
              ? { ...entry, rates: { ...entry.rates, [request.to]: rate } } : entry) }));
          setLookupStatus((current) => { const nextStatus = { ...current }; delete nextStatus[request.key]; return nextStatus; });
        } else setLookupStatus((current) => ({ ...current, [request.key]: 'error' }));
      }).catch(() => { if (inflight.current.get(request.key) === token) inflight.current.delete(request.key); if (alive.current && isWritable() && generation.current === currentGeneration) setLookupStatus((current) => ({ ...current, [request.key]: 'error' })); });
    }
  }, [requests, data.rateCache, lookupStatus, canEdit, isWritable, setData]);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* The choice still applies for this session. */ }
  }

  function saveTransaction(value) {
    if (form?.transaction) {
      const id = form.transaction.id;
      setData((current) => ({ ...current, transactions: current.transactions.map((entry) => entry.id !== id ? entry : { ...entry, ...value,
        rates: entry.date === value.date && entry.currency === value.currency ? entry.rates : {} }) }));
      setNotice('Transaction updated.');
    } else {
      const entry = { ...value, id: makeId(), createdAt: new Date().toISOString(), sample: false, rates: {} };
      setData((current) => ({ ...current, transactions: [entry, ...current.transactions] })); setNotice('Transaction added.');
    }
    setMonth(value.date.slice(0, 7)); setFilter('all'); setForm(null);
  }
  function saveTarget(targetMinor) {
    setData((current) => ({ ...current, months: { ...current.months, [month]: { ...monthSettings(current.months, month), targetMinor } } }));
    setTargetFormOpen(false); setNotice(`Spending target saved for ${formatMonth(month)}.`);
  }
  function removeTarget() {
    setData((current) => ({ ...current, months: { ...current.months, [month]: { ...monthSettings(current.months, month), targetMinor: null } } }));
    setTargetFormOpen(false); setNotice(`Spending target removed for ${formatMonth(month)}.`);
  }
  function changeBase(nextSetting) {
    setData((current) => ({ ...current, months: { ...current.months, [month]: nextSetting } })); setBaseFormOpen(false); setNotice(`Budget currency set to ${nextSetting.currency} for ${formatMonth(month)}.`);
  }
  function saveRate(rate) {
    const entry = rateForm.entry; const key = rateKey(entry.date, entry.currency, rateForm.to);
    setData((current) => ({ ...current, rateCache: rate.kind === 'automatic' ? { ...current.rateCache, [key]: rate } : current.rateCache,
      transactions: current.transactions.map((item) => item.id === entry.id && item.date === entry.date && item.currency === entry.currency
        ? { ...item, rates: { ...item.rates, [rateForm.to]: rate } } : item) }));
    setLookupStatus((current) => { const next = { ...current }; delete next[key]; return next; });
    setRateForm(null); setNotice(rate.kind === 'manual' ? 'Manual rate saved for this transaction.' : rate.kind === 'earlier' ? 'Earlier published rate saved for this transaction.' : 'Exact-date reference rate saved.');
  }
  function retryRates() { setLookupStatus((current) => { const next = { ...current }; for (const request of requests) delete next[request.key]; return next; }); }
  function loadSamples() {
    const examples = makeSampleTransactions(month);
    setData((current) => current.transactions.some((entry) => entry.date.slice(0, 7) === month) ? current : { ...current, transactions: [...examples, ...current.transactions] });
    setFilter('all'); setNotice('Sample data added for this month.');
  }
  function removeSamples() { setData((current) => ({ ...current, transactions: current.transactions.filter((entry) => !(entry.sample && entry.date.slice(0, 7) === month)) })); setNotice('Sample entries removed for this month.'); }
  function deleteTransaction() { setData((current) => ({ ...current, transactions: current.transactions.filter((entry) => entry.id !== pendingDelete.id) })); setPendingDelete(null); setNotice('Transaction deleted.'); }
  function exportMonth() { downloadFile(transactionsToCsv(summary.entries, { viewCurrency, months: data.months }), 'text/csv;charset=utf-8', `kobo-transactions-${month}.csv`); setNotice('Your monthly CSV is ready.'); }
  function backup() { downloadFile(createBackup(data), 'application/json;charset=utf-8', `kobo-backup-${localToday()}.json`); setNotice('Your full backup is ready.'); }
  function restore(nextData) {
    const result = store.restore(nextData);
    if (!result.ok) return result;
    generation.current += 1; inflight.current.clear(); setLookupStatus({}); setBackupOpen(false); setFilter('all'); setNotice('Full backup restored.');
    return { ok: true };
  }

  return <div className="app-shell"><Sidebar storageError={storageErrors.length > 0 || mode !== 'writer'} /><div className="main-shell"><header className="mobile-bar"><Brand compact /><div className="mobile-bar-actions"><span className="mobile-local"><LockKeyhole size={13} /> Local budget</span><ThemeToggle theme={theme} onToggle={toggleTheme} className="mobile-theme-toggle" /></div></header>
    <main className="main-content" id="overview"><div className="topline"><span><span className="topline-dot" /> YOUR PERSONAL BUDGET</span><div className="topline-actions"><span className="currency-tag"><span>✳</span> {viewCurrency} VIEW</span><ThemeToggle theme={theme} onToggle={toggleTheme} className="desktop-theme-toggle" /></div></div>
      <header className="page-header"><div><h1>A clearer view of your money<span>.</span></h1><p>Keep track of what comes in, what goes out, and everything in between.</p></div><div className="header-actions"><button className="button button-outline backup-button" type="button" onClick={() => setBackupOpen(true)}><FolderArchive size={16} /><span>Backup</span></button><button className="button button-outline export-button" type="button" onClick={exportMonth} disabled={!summary.entries.length} title={summary.entries.length ? `Export ${formatMonth(month)} transactions (targets are not included)` : 'Add a transaction to export this month'}><Download size={16} /> <span>Export CSV</span></button><button className="button button-primary header-add" type="button" disabled={!canEdit} onClick={() => setForm({ transaction: null })}><Plus size={17} /> Add transaction</button></div></header>
      {storageErrors.map((error) => <div className="storage-alert" role="alert" key={error}><CircleHelp size={18} /><p><strong>Browser storage notice.</strong> {error}</p></div>)}
      {dirty && mode === 'writer' && readable && <div className="storage-action"><button type="button" onClick={store.retry}>Retry saving this session</button></div>}
      {mode === 'waiting' && <div className="storage-alert" role="status"><LockKeyhole size={18} /><p><strong>Read-only while another tab is editing.</strong> Kobo allows one editable tab per browser and origin. Close the other Kobo tab; this one will become editable automatically.</p></div>}
      {mode === 'unavailable' && <div className="storage-alert" role="alert"><LockKeyhole size={18} /><p><strong>Editing is unavailable in this browser.</strong> Use HTTPS (or localhost) and a current browser with Web Locks enabled. You can still download a backup of data visible in this tab.</p></div>}
      <section className="overview-section" aria-labelledby="monthly-title"><div className="section-heading"><div><p className="eyebrow">YOUR MONTH AT A GLANCE</p><h2 id="monthly-title">Monthly overview</h2></div><div className="month-controls"><span className="month-label">VIEWING</span><MonthPicker month={month} onChange={setMonth} /></div></div>
        <CurrencyControls setting={setting} viewCurrency={viewCurrency} onBase={() => setBaseFormOpen(true)} onView={(currency) => setData((current) => ({ ...current, viewCurrency: currency }))} readOnly={!canEdit} />
        <SummaryCards summary={summary} /><p className="net-explainer"><CircleHelp size={13} /> Monthly net is this month’s income minus expenses; nothing rolls over. View amounts use each entry’s own date and direct currency-pair rate.</p></section>
      {uniqueIssues.length > 0 && <div className="fx-alert" role="status"><CircleHelp size={17} /><div><strong>{loadingRates ? 'Looking up historical rates.' : 'Some conversions are incomplete.'}</strong><p>{plural(uniqueIssues.length, 'conversion')} {uniqueIssues.length === 1 ? 'is' : 'are'} missing or outside the safe calculation range. Totals and progress show known amounts only. {!canEdit ? 'Use the editable tab to resolve rates.' : loadingRates ? 'You can also enter a manual rate.' : 'Resolve individual rates below.'}</p></div><div className="fx-alert-actions">{hasFailedRate && canEdit && <button type="button" onClick={retryRates}><RefreshCw size={13} /> Retry rates</button>}<a href="#transactions" onClick={() => setFilter('all')}>View entries</a></div></div>}
      {sampleCount > 0 && <div className="sample-banner"><span className="sample-banner-icon"><Sparkles size={16} /></span><p><strong>Sample data is on.</strong> {plural(sampleCount, 'sample entry', 'sample entries')} {sampleCount === 1 ? 'is' : 'are'} included in this month’s totals and target progress.</p><button type="button" disabled={!canEdit} onClick={removeSamples}>Remove samples <X size={14} /></button></div>}
      <SpendingTarget month={month} currency={setting.currency} spentMinor={baseSummary.expense} targetMinor={setting.targetMinor} missingExpense={baseSummary.missingExpense} onEdit={() => setTargetFormOpen(true)} readOnly={!canEdit} />
      <div className="dashboard-grid"><TransactionsCard entries={summary.entries} filter={filter} viewCurrency={viewCurrency} budgetCurrency={setting.currency} lookupStatus={lookupStatus} onFilter={setFilter} onAdd={() => setForm({ transaction: null })} onLoadSample={loadSamples} onEdit={(entry) => setForm({ transaction: entry })} onDelete={setPendingDelete} onRate={(entry, to) => setRateForm({ entry, to })} readOnly={!canEdit} /><SpendingCard summary={summary} month={month} /></div>
      <div className="conversion-note"><CircleHelp size={14} /><p><strong>About conversions.</strong> Budget and view amounts use direct rates from the original currency. A manual bank rate applies only to its selected pair; a different view currency uses its own rate. Historical reference rates can differ from bank charges. Lookups share the date and currency pair with the rate provider.</p></div>
      <footer className="page-footer"><span>Made for the little wins <span className="footer-sparkle">✳</span></span><span>One month at a time.</span></footer>
    </main></div>
    {form && <TransactionForm transaction={form.transaction} month={month} budgetCurrency={setting.currency} onClose={() => setForm(null)} onSave={saveTransaction} />}
    {targetFormOpen && <TargetForm month={month} currency={setting.currency} targetMinor={setting.targetMinor} onClose={() => setTargetFormOpen(false)} onSave={saveTarget} onRemove={removeTarget} />}
    {baseFormOpen && <BudgetCurrencyForm month={month} setting={setting} entryCount={summary.entries.length} onClose={() => setBaseFormOpen(false)} onSave={changeBase} />}
    {rateForm && <RateDialog entry={rateForm.entry} to={rateForm.to} onClose={() => setRateForm(null)} onSave={saveRate} />}
    {backupOpen && <BackupDialog onClose={() => setBackupOpen(false)} onBackup={backup} onRestore={restore} readBlocked={!readable} canRestore={canRestore} />}
    {pendingDelete && <DeleteDialog entry={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={deleteTransaction} />}
    <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">{notice && <><span><Check size={15} /></span>{notice}</>}</div>
  </div>;
}
