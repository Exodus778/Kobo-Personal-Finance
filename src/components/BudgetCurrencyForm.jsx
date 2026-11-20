import { useState } from 'react';
import { X } from 'lucide-react';
import Dialog from './Dialog.jsx';
import { formatMonth } from '../lib/budget.js';
import { CURRENCIES, formatMoney, getCurrency, parseAmount } from '../lib/currency.js';

export default function BudgetCurrencyForm({ month, setting, entryCount, onClose, onSave }) {
  const [currency, setCurrency] = useState(setting.currency);
  const [targetChoice, setTargetChoice] = useState('replace');
  const [targetAmount, setTargetAmount] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const changed = currency !== setting.currency;
  const hasTarget = Number.isSafeInteger(setting.targetMinor);
  function submit(event) {
    event.preventDefault();
    if (!changed) { onClose(); return; }
    let newTarget = null;
    if (hasTarget && targetChoice === 'replace') {
      const parsed = parseAmount(targetAmount, currency);
      if (!parsed.ok) { setError(parsed.error); requestAnimationFrame(() => document.getElementById('replacement-target')?.focus()); return; }
      newTarget = parsed.minor;
    }
    const value = { currency, targetMinor: newTarget };
    if (entryCount || hasTarget) { setPending(value); return; }
    onSave(value);
  }
  return (
    <Dialog onClose={onClose} labelledBy="base-dialog-title" describedBy="base-dialog-description" className="base-dialog">
      <div className="dialog-heading"><div><p className="eyebrow">ONE MONTH AT A TIME</p><h2 id="base-dialog-title">Budget currency</h2><p id="base-dialog-description">Choose the currency for {formatMonth(month)}’s spending target and progress.</p></div>
        <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
      <form onSubmit={submit} noValidate>
        <div className="form-field"><label htmlFor="budget-currency">Monthly budget currency</label><select data-autofocus id="budget-currency" value={currency} onChange={(event) => { setCurrency(event.target.value); setPending(null); setError(''); setTargetAmount(''); }}>
          {CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}</select>
          <p className="field-help">This applies only to {formatMonth(month)}. “View in” is separate.</p></div>
        {changed && hasTarget && <div className="base-target-choice"><p>Your existing target is <strong>{formatMoney(setting.targetMinor, setting.currency)}</strong>. It will not be silently converted or reinterpreted. Choose what happens to it:</p>
          <label className="choice-row"><input type="radio" name="target-choice" checked={targetChoice === 'replace'} onChange={() => { setTargetChoice('replace'); setPending(null); }} /> Set a new target in {currency}</label>
          {targetChoice === 'replace' && <div className="form-field replacement-target"><label htmlFor="replacement-target">New target in {currency}</label><div className={`money-input ${error ? 'has-error' : ''}`}><span className="input-currency" aria-hidden="true">{currency}</span>
            <input id="replacement-target" inputMode={getCurrency(currency).decimals ? 'decimal' : 'numeric'} placeholder={getCurrency(currency).decimals ? '0.00' : '0'} value={targetAmount} maxLength={16} onChange={(event) => { setTargetAmount(event.target.value); setPending(null); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'replacement-error' : undefined} /></div>
            {error && <p className="field-error" id="replacement-error">{error}</p>}</div>}
          <label className="choice-row"><input type="radio" name="target-choice" checked={targetChoice === 'remove'} onChange={() => { setTargetChoice('remove'); setPending(null); setError(''); }} /> Remove the existing target instead</label>
        </div>}
        {changed && <p className="date-note">Original transactions and saved rates stay intact. New {currency} conversions will be looked up for each transaction’s date; missing rates make progress incomplete.</p>}
        {pending && <div className="inline-confirm" role="alert"><strong>Change this month’s budget currency?</strong><p>{formatMonth(month)} has {entryCount} {entryCount === 1 ? 'entry' : 'entries'}. Progress will be measured in {currency}.{hasTarget ? targetChoice === 'remove' ? ' Your existing target will be removed.' : ` Your existing target will be replaced with the new ${currency} target.` : ''}</p>
          <div><button type="button" onClick={() => setPending(null)}>Go back</button><button type="button" onClick={() => onSave(pending)}>Confirm currency change</button></div></div>}
        <div className="dialog-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>{!pending && <button type="submit" className="button button-primary">{changed ? 'Change currency' : 'Done'}</button>}</div>
      </form>
    </Dialog>
  );
}
