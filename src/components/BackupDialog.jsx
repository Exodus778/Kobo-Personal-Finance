import { useState } from 'react';
import { Download, Upload, X } from 'lucide-react';
import Dialog from './Dialog.jsx';
import { MAX_BACKUP_BYTES, parseBackup } from '../lib/storage.js';

export default function BackupDialog({ onClose, onBackup, onRestore, readBlocked, canRestore = true }) {
  const [candidate, setCandidate] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  async function chooseFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setCandidate(null); setError(''); setFileName(file.name);
    if (file.size > MAX_BACKUP_BYTES) { setError('Backup files must be 10 MB or smaller. Nothing was changed.'); return; }
    try {
      const result = parseBackup(await file.text());
      if (!result.ok) { setError(result.error); return; }
      setCandidate(result);
    } catch { setError('The file could not be read. Nothing was changed.'); }
  }
  function restore() {
    const result = onRestore(candidate.data);
    if (!result.ok) setError(result.error);
  }
  return (
    <Dialog onClose={onClose} labelledBy="backup-title" describedBy="backup-description" className="backup-dialog">
      <div className="dialog-heading"><div><p className="eyebrow">YOUR DATA, YOUR COPY</p><h2 id="backup-title">Backup &amp; restore</h2><p id="backup-description">Move or protect your complete local budget with a JSON backup.</p></div>
        <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
      <div className="backup-section"><div className="backup-section-heading"><span className="backup-icon"><Download size={18} /></span><div><h3>Download a full backup</h3><p>Includes all months, transactions, targets, currencies and saved rate data.</p></div></div>
        {readBlocked && <p className="backup-warning">Some saved data could not be read. This backup contains only data currently visible in this session, not unreadable records.</p>}
        <button type="button" className="button button-primary" onClick={onBackup}><Download size={15} /> Download backup</button></div>
      <div className="backup-section restore-section"><div className="backup-section-heading"><span className="backup-icon"><Upload size={18} /></span><div><h3>Restore a backup</h3><p>Choose a Kobo JSON backup. Review it before replacing the current budget.</p></div></div>
        {!canRestore && <p className="backup-warning">Restore is unavailable in this read-only tab. Close the other editable tab or resolve the storage notice first.</p>}
        <label className={`file-picker ${!canRestore ? 'file-picker-disabled' : ''}`}><Upload size={15} /><span>Choose backup file</span><input type="file" accept="application/json,.json" onChange={chooseFile} disabled={!canRestore} /></label>
        {fileName && <p className="selected-file">Selected: {fileName}</p>}
        {error && <p className="field-error backup-error" role="alert">{error}</p>}
        {candidate && <div className="inline-confirm restore-confirm" role="alert"><strong>Replace all current budget data?</strong><p>This will replace every current month, entry, target, currency and saved rate with {candidate.data.transactions.length} {candidate.data.transactions.length === 1 ? 'entry' : 'entries'} and {Object.keys(candidate.data.months).length} saved monthly {Object.keys(candidate.data.months).length === 1 ? 'setting' : 'settings'} from the selected file. It does not merge data. Download a current backup first if needed.</p>
          <div><button type="button" onClick={() => setCandidate(null)}>Cancel restore</button><button type="button" onClick={restore} disabled={!canRestore}>Yes, replace my budget</button></div></div>}
      </div>
      <p className="rate-disclaimer">Backups are not encrypted. Keep them somewhere private. CSV exports are separate and cannot be restored.</p>
      <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Close</button></div>
    </Dialog>
  );
}
