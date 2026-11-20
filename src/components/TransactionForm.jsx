import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, X } from 'lucide-react';
import Dialog from './Dialog.jsx';
import { CATEGORIES, dateForMonth, MAX_DATE, MIN_DATE, validateDraft } from '../lib/budget.js';
import { CURRENCIES, getCurrency, minorToInput } from '../lib/currency.js';

export default function TransactionForm({ transaction, month, budgetCurrency, onClose, onSave }) {
  const isEditing = Boolean(transaction);
  const [draft, setDraft] = useState(() => transaction ? {
    type: transaction.type, currency: transaction.currency, amount: minorToInput(transaction.amountMinor, transaction.currency),
    category: transaction.category, date: transaction.date, description: transaction.description,
  } : { type: 'expense', currency: budgetCurrency, amount: '', category: CATEGORIES.expense[0].id,
    date: dateForMonth(month), description: '' });
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(null);
  const currency = getCurrency(draft.currency);
  const manualCount = Object.values(transaction?.rates ?? {}).filter((rate) => rate.kind === 'manual').length;
  const identityChanged = isEditing && (transaction.date !== draft.date || transaction.currency !== draft.currency);

  function update(field, value) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setPending(null);
  }
  function changeType(type) {
    setDraft((previous) => ({ ...previous, type, category: CATEGORIES[type][0].id }));
    setErrors((previous) => ({ ...previous, type: undefined, category: undefined }));
    setPending(null);
  }
  function submit(event) {
    event.preventDefault();
    const result = validateDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      requestAnimationFrame(() => document.querySelector('.transaction-dialog [aria-invalid="true"]')?.focus());
      return;
    }
    if (identityChanged && manualCount) { setPending(result.value); return; }
    onSave(result.value);
  }

  return (
    <Dialog onClose={onClose} labelledBy="transaction-dialog-title" describedBy="transaction-dialog-description" className="transaction-dialog">
      <div className="dialog-heading"><div><p className="eyebrow">YOUR TRANSACTIONS</p>
        <h2 id="transaction-dialog-title">{isEditing ? 'Edit transaction' : 'Add a transaction'}</h2>
        <p id="transaction-dialog-description">{isEditing ? 'Make a change to your entry below.' : 'The small things add up. Let’s keep track.'}</p></div>
        <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
      </div>
      <form onSubmit={submit} noValidate>
        <fieldset className="type-fieldset"><legend>What would you like to add?</legend><div className="type-options">
          <label className={`type-option ${draft.type === 'expense' ? 'is-selected expense-selected' : ''}`}>
            <input type="radio" name="type" value="expense" checked={draft.type === 'expense'} onChange={() => changeType('expense')} />
            <span className="type-icon expense-type"><ArrowUpRight size={17} /></span><span>Expense<small>Money going out</small></span><span className="type-check" aria-hidden="true" />
          </label>
          <label className={`type-option ${draft.type === 'income' ? 'is-selected income-selected' : ''}`}>
            <input type="radio" name="type" value="income" checked={draft.type === 'income'} onChange={() => changeType('income')} />
            <span className="type-icon income-type"><ArrowDownLeft size={17} /></span><span>Income<small>Money coming in</small></span><span className="type-check" aria-hidden="true" />
          </label>
        </div></fieldset>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="transaction-currency">Original currency <span className="required-star">*</span></label>
            <select id="transaction-currency" value={draft.currency} onChange={(event) => update('currency', event.target.value)} aria-invalid={Boolean(errors.currency)}>
              {CURRENCIES.map((item) => <option value={item.code} key={item.code}>{item.code} — {item.name}</option>)}
            </select>
            {errors.currency && <p className="field-error">{errors.currency}</p>}
          </div>
          <div className="form-field">
            <label htmlFor="transaction-amount">Original amount <span className="required-star">*</span></label>
            <div className={`money-input ${errors.amount ? 'has-error' : ''}`}><span aria-hidden="true" className="input-currency">{draft.currency}</span>
              <input data-autofocus id="transaction-amount" inputMode={currency?.decimals === 0 ? 'numeric' : 'decimal'} autoComplete="off" placeholder={currency?.decimals === 0 ? '0' : '0.00'} maxLength={16} value={draft.amount}
                onChange={(event) => update('amount', event.target.value)} aria-invalid={Boolean(errors.amount)} aria-describedby={errors.amount ? 'amount-error' : 'amount-help'} />
            </div>
            {errors.amount ? <p className="field-error" id="amount-error">{errors.amount}</p> : <p className="field-help" id="amount-help">{currency?.decimals === 0 ? 'JPY uses whole units, no decimals.' : 'Up to 2 decimal places; no commas.'}</p>}
          </div>
        </div>
        <div className="form-grid">
          <div className="form-field"><label htmlFor="transaction-category">Category <span className="required-star">*</span></label>
            <select id="transaction-category" value={draft.category} onChange={(event) => update('category', event.target.value)} aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? 'category-error' : undefined}>
              {CATEGORIES[draft.type].map((category) => <option value={category.id} key={category.id}>{category.label}</option>)}
            </select>{errors.category && <p className="field-error" id="category-error">{errors.category}</p>}
          </div>
          <div className="form-field"><label htmlFor="transaction-date">Date <span className="required-star">*</span></label>
            <input id="transaction-date" type="date" min={MIN_DATE} max={MAX_DATE} value={draft.date} onChange={(event) => update('date', event.target.value)} aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? 'date-error' : undefined} />
            {errors.date && <p className="field-error" id="date-error">{errors.date}</p>}
          </div>
        </div>
        <div className="form-field"><label htmlFor="transaction-description">Description <span className="optional">Optional</span></label>
          <input id="transaction-description" type="text" maxLength={80} placeholder={draft.type === 'expense' ? 'e.g. Groceries for the week' : 'e.g. Monthly salary'} value={draft.description}
            onChange={(event) => update('description', event.target.value)} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'description-error' : undefined} />
          {errors.description && <p className="field-error" id="description-error">{errors.description}</p>}
        </div>
        <p className="date-note">The date sets the month and exchange-rate date. After saving, use the rate controls on the entry to add a manual or effective bank rate.{transaction?.sample ? ' This entry will remain marked as sample data.' : ''}</p>
        {pending && <div className="inline-confirm" role="alert"><strong>Replace saved manual rates?</strong><p>Changing the date or original currency removes this entry’s {manualCount === 1 ? 'manual rate' : `${manualCount} manual rates`} and its other saved rates. New date-specific rates will be looked up; you can enter new manual rates afterward.</p>
          <div><button type="button" onClick={() => setPending(null)}>Keep editing</button><button type="button" onClick={() => onSave(pending)}>Yes, change &amp; replace rates</button></div></div>}
        <div className="dialog-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
          {!pending && <button type="submit" className="button button-primary">{isEditing ? 'Save changes' : 'Add transaction'}</button>}</div>
      </form>
    </Dialog>
  );
}
