import { useState } from 'react';
import { Target, X } from 'lucide-react';
import Dialog from './Dialog.jsx';
import { formatMonth } from '../lib/budget.js';
import { getCurrency, minorToInput, parseAmount } from '../lib/currency.js';

export default function TargetForm({ month, currency, targetMinor, onClose, onSave, onRemove }) {
  const hasTarget = Number.isSafeInteger(targetMinor) && targetMinor > 0;
  const [amount, setAmount] = useState(() => hasTarget ? minorToInput(targetMinor, currency) : '');
  const [error, setError] = useState('');
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  function submit(event) {
    event.preventDefault();
    const result = parseAmount(amount, currency);
    if (!result.ok) { setError(result.error); requestAnimationFrame(() => document.getElementById('target-amount')?.focus()); return; }
    onSave(result.minor);
  }
  return (
    <Dialog onClose={onClose} labelledBy="target-dialog-title" describedBy="target-dialog-description" className="target-dialog">
      <div className="dialog-heading"><div><p className="eyebrow">YOUR SPENDING PLAN</p><h2 id="target-dialog-title">{hasTarget ? 'Edit spending target' : 'Set a spending target'}</h2><p id="target-dialog-description">A little plan for {formatMonth(month)}. You can change it any time.</p></div>
        <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
      <div className="target-dialog-summary"><span className="target-dialog-icon"><Target size={18} /></span><p>Your target is a limit for <strong>expenses</strong> in this month’s budget currency, <strong>{currency}</strong>. It doesn’t change your monthly net.</p></div>
      <form onSubmit={submit} noValidate><div className="form-field target-form-field"><label htmlFor="target-amount">Spending target <span className="required-star">*</span></label>
        <div className={`money-input ${error ? 'has-error' : ''}`}><span aria-hidden="true" className="input-currency">{currency}</span>
          <input data-autofocus id="target-amount" inputMode={getCurrency(currency).decimals ? 'decimal' : 'numeric'} autoComplete="off" placeholder={getCurrency(currency).decimals ? '0.00' : '0'} maxLength={16} value={amount}
            onChange={(event) => { setAmount(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'target-error' : 'target-help'} /></div>
        {error ? <p className="field-error" id="target-error">{error}</p> : <p className="field-help" id="target-help">{getCurrency(currency).decimals ? 'Enter a positive amount with up to 2 decimal places.' : 'Enter a positive amount in whole yen.'}</p>}</div>
        <p className="date-note">This target applies only to {formatMonth(month)}. No target or unused amount carries into another month.</p>
        {confirmingRemove && <div className="remove-target-confirm" role="alert"><p>Remove this month’s target? Your transactions will stay.</p><div><button type="button" onClick={() => setConfirmingRemove(false)}>Keep target</button><button type="button" onClick={onRemove}>Yes, remove</button></div></div>}
        <div className="dialog-actions target-dialog-actions">{hasTarget && !confirmingRemove && <button className="remove-target-button" type="button" onClick={() => setConfirmingRemove(true)}>Remove target</button>}
          <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">{hasTarget ? 'Save changes' : 'Save target'}</button></div>
        <p className="target-export-note">Targets are included in a full backup, but not the monthly CSV.</p>
      </form>
    </Dialog>
  );
}
