import { useState } from 'react';
import { ArrowRightLeft, Search, X } from 'lucide-react';
import Dialog from './Dialog.jsx';
import { formatDate, transactionConversion } from '../lib/budget.js';
import { formatMoney, formatRate, getCurrency, parseConvertedAmount, parseRate, rateFromBankAmount } from '../lib/currency.js';
import { fetchExactRate, findEarlierRate } from '../lib/rates.js';

function rateDescription(rate) {
  return rate.kind === 'manual' ? 'Manual' : rate.kind === 'earlier' ? 'Earlier published rate · accepted' : 'Automatic';
}

export default function RateDialog({ entry, to, onClose, onSave }) {
  const existing = transactionConversion(entry, to);
  const [mode, setMode] = useState('rate');
  const [manual, setManual] = useState(existing.rate?.kind === 'manual' ? existing.rate.rate : '');
  const [bankAmount, setBankAmount] = useState('');
  const [error, setError] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');
  const [candidate, setCandidate] = useState(null);
  const [busy, setBusy] = useState('');
  const from = entry.currency;
  const fullDate = formatDate(entry.date, { day: 'numeric', month: 'short', year: 'numeric' });
  async function search(kind) {
    setBusy(kind); setCandidate(null); setLookupMessage('');
    const found = kind === 'exact' ? await fetchExactRate(entry.date, from, to) : await findEarlierRate(entry.date, from, to);
    setBusy('');
    if (!found) setLookupMessage(kind === 'exact' ? 'No exact-date rate could be found. Check your connection, enter a manual rate or search earlier dates.' : 'Couldn’t find an earlier rate in the previous 14 days. Check your connection or enter a manual rate instead.');
    else setCandidate(found);
  }
  function submit(event) {
    event.preventDefault();
    let rate;
    let source;
    if (mode === 'rate') {
      const parsed = parseRate(manual);
      if (!parsed.ok) { setError(parsed.error); return; }
      rate = parsed.rate; source = 'Manual: entered rate';
    } else {
      const parsed = parseConvertedAmount(bankAmount, to);
      if (!parsed.ok) { setError(parsed.error); return; }
      rate = rateFromBankAmount(entry.amountMinor, from, parsed.minor, to);
      if (!rate) { setError('That charge cannot be represented safely as a rate. Enter the rate directly instead.'); return; }
      source = 'Manual: bank-charged amount';
    }
    onSave({ from, to, date: entry.date, rate, kind: 'manual', source });
  }
  return (
    <Dialog onClose={onClose} labelledBy="rate-dialog-title" describedBy="rate-dialog-description" className="rate-dialog">
      <div className="dialog-heading"><div><p className="eyebrow">TRANSACTION EXCHANGE RATE</p><h2 id="rate-dialog-title">{from} <ArrowRightLeft size={17} aria-label="to" /> {to}</h2><p id="rate-dialog-description">For this entry on {fullDate}. A manual rate applies to this entry and this pair only.</p></div>
        <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
      <div className="rate-current"><span>ORIGINAL AMOUNT</span><strong>{formatMoney(entry.amountMinor, from)}</strong>
        {existing.rate ? <p>Current: 1 {from} = {formatRate(existing.rate.rate)} {to} · {rateDescription(existing.rate)} · {existing.rate.date} · {existing.rate.source}</p> : <p>No saved rate for this pair. The conversion is incomplete.</p>}
        {existing.reason === 'too-large' && <p>The converted amount exceeds the supported calculation range.</p>}</div>
      <form onSubmit={submit} noValidate>
        <fieldset className="rate-mode"><legend>Enter a manual rate</legend>
          <label className="choice-row"><input type="radio" name="rate-mode" checked={mode === 'rate'} onChange={() => { setMode('rate'); setError(''); }} /> Enter the rate</label>
          <label className="choice-row"><input type="radio" name="rate-mode" checked={mode === 'bank'} onChange={() => { setMode('bank'); setError(''); }} /> Calculate from the amount charged by my bank</label>
        </fieldset>
        {mode === 'rate' ? <div className="form-field"><label htmlFor="manual-rate">1 {from} equals how many {to}?</label><input data-autofocus id="manual-rate" inputMode="decimal" autoComplete="off" placeholder="e.g. 1500.50" maxLength={32} value={manual} onChange={(event) => { setManual(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'rate-error' : 'rate-help'} /><p className="field-help" id="rate-help">Enter units of {to} for one {from}; up to 18 decimal places.</p></div>
          : <div className="form-field"><label htmlFor="bank-amount">Amount your bank charged in {to}</label><div className="money-input"><span className="input-currency" aria-hidden="true">{to}</span><input id="bank-amount" inputMode={getCurrency(to).decimals ? 'decimal' : 'numeric'} autoComplete="off" placeholder={getCurrency(to).decimals ? '0.00' : '0'} maxLength={22} value={bankAmount} onChange={(event) => { setBankAmount(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'rate-error' : 'bank-help'} /></div><p className="field-help" id="bank-help">We’ll derive the effective rate from the original and charged amounts.</p></div>}
        {error && <p className="field-error rate-form-error" id="rate-error" role="alert">{error}</p>}
        <div className="rate-manual-actions"><button type="submit" className="button button-primary">Save manual rate</button></div>
      </form>
      <div className="rate-divider"><span>OR USE A REFERENCE RATE</span></div>
      <div className="rate-fetch-actions"><button type="button" className="button button-outline" disabled={Boolean(busy)} onClick={() => search('exact')}><Search size={14} /> {busy === 'exact' ? 'Searching…' : 'Find exact-date rate'}</button>
        <button type="button" className="button button-outline" disabled={Boolean(busy)} onClick={() => search('earlier')}>{busy === 'earlier' ? 'Searching…' : 'Find an earlier rate'}</button></div>
      <p className="rate-disclaimer">Published reference rates may differ from your bank’s rate. Earlier dates are never applied without your approval.</p>
      {lookupMessage && <p className="rate-lookup-message" role="status">{lookupMessage}</p>}
      {candidate && <div className="rate-candidate" role="status"><strong>{candidate.kind === 'earlier' ? 'Earlier published rate' : 'Exact-date reference rate'}</strong><p>1 {from} = {formatRate(candidate.rate)} {to}<br />Rate date: {candidate.date} · {candidate.source}</p>
        {candidate.kind === 'earlier' && <p>This is earlier than the transaction date, {entry.date}. Use it only if appropriate.</p>}
        <button type="button" onClick={() => onSave(candidate)}>{candidate.kind === 'earlier' ? `Use rate from ${candidate.date}` : 'Use this exact-date rate'}</button></div>}
      <div className="dialog-actions"><button type="button" className="button button-quiet" onClick={onClose}>Close</button></div>
    </Dialog>
  );
}
