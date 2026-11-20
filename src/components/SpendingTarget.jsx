import { ArrowUpRight, BellRing, Pencil, Plus, Target } from 'lucide-react';
import { calculateTargetStatus, formatMonth, spendingAlert } from '../lib/budget.js';
import { formatMoney } from '../lib/currency.js';

function formatTargetPercent(value) {
  if (value > 0 && value < 1) return '<1%';
  if (value > 74 && value < 75) return '<75%';
  if (value > 99 && value < 100) return '<100%';
  if (value > 100 && value < 101) return '>100%';
  return `${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(Math.round(value))}%`;
}

export default function SpendingTarget({ month, currency, spentMinor, targetMinor, missingExpense, onEdit, readOnly = false }) {
  const status = calculateTargetStatus(spentMinor, targetMinor);
  const incomplete = missingExpense > 0;
  const isOver = Boolean(status?.overKobo);
  const percent = status ? formatTargetPercent(status.percentage) : '';
  const alert = spendingAlert(spentMinor, targetMinor);
  const statusText = !status ? '' : incomplete
    ? isOver ? `At least ${formatMoney(status.overKobo, currency)} over target` : status.remainingKobo === 0 ? 'You’ve reached at least your target' : 'Remaining amount unknown until all expenses have rates'
    : isOver ? `${formatMoney(status.overKobo, currency)} over your target`
      : status.remainingKobo === 0 ? 'You’ve reached your target' : `${formatMoney(status.remainingKobo, currency)} left in your target`;
  return (
    <section className={`target-card ${isOver ? 'target-over' : ''}`} id="target" aria-labelledby="target-title">
      <div className="target-card-header"><div className="target-card-title"><span className="target-icon"><Target size={18} /></span><div><p className="eyebrow">YOUR SPENDING PLAN · {currency}</p><h2 id="target-title">Monthly target</h2></div></div>
        <button className="target-edit-button" type="button" disabled={readOnly} onClick={onEdit}>{status ? <Pencil size={14} /> : <Plus size={15} />}{status ? 'Edit target' : 'Set target'}</button></div>
      {status ? <div className="target-progress-area">
        <div className="target-progress-copy"><div><strong>{formatMoney(status.spentKobo, currency)}</strong><span> of {formatMoney(status.targetKobo, currency)} {incomplete ? 'known spending' : 'spent'}</span></div><span className="target-percent">{incomplete ? 'Known: ' : ''}{percent} used</span></div>
        <div className="target-track" role="progressbar" aria-label={`Spending target for ${formatMonth(month)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(status.progressPercentage)} aria-valuetext={`${incomplete ? 'Known: ' : ''}${percent} used; ${statusText}`}><span className="target-fill" style={{ width: `${status.progressPercentage}%` }} /></div>
        <div className="target-bottom"><span className={`target-status ${isOver ? 'is-over' : ''}`}>{isOver ? <ArrowUpRight size={14} /> : <span className="target-status-dot" />}{statusText}</span><span>Always in {currency} · no rollover</span></div>
        {incomplete && <p className="target-incomplete">Incomplete: {missingExpense} expense {missingExpense === 1 ? 'conversion is' : 'conversions are'} unavailable. The final percentage may be higher.</p>}
        {alert && <div className={`spending-alert ${alert === 'limit' ? 'spending-alert-limit' : ''}`} role="status"><BellRing size={15} /><p><strong>{alert === 'limit' ? 'Target reached.' : '75% of your target used.'}</strong> {incomplete ? 'Based on known expenses; your actual spending may be higher.' : alert === 'limit' ? 'Your expenses have reached or exceeded this month’s limit.' : 'A little heads-up as you approach this month’s limit.'}</p></div>}
      </div> : <div className="target-empty-row"><div><p>Set a spending target for {formatMonth(month)}.</p><span>Measured in {currency}, independently of the display currency.</span></div><span className="target-empty-badge"><span /> No target set</span></div>}
    </section>
  );
}
