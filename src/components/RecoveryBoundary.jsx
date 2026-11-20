import { Component } from 'react';
import { BUDGET_STORAGE_KEY, STORAGE_KEY, TARGET_STORAGE_KEY } from '../lib/storage.js';

/** Last-resort recovery for render failures; never sends personal data away. */
export default class RecoveryBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false, message: '' }; }
  static getDerivedStateFromError() { return { failed: true }; }

  downloadRaw = () => {
    try {
      const raw = Object.fromEntries([BUDGET_STORAGE_KEY, STORAGE_KEY, TARGET_STORAGE_KEY].map((key) => [key, window.localStorage.getItem(key)]));
      if (Object.values(raw).every((value) => value === null)) {
        this.setState({ message: 'No saved Kobo data was found in this browser.' }); return;
      }
      const contents = JSON.stringify({ format: 'kobo-raw-storage-recovery', exportedAt: new Date().toISOString(), raw }, null, 2);
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'kobo-raw-storage-recovery.json';
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.setState({ message: 'Raw saved data downloaded. Keep this unencrypted file private.' });
    } catch {
      this.setState({ message: 'Browser storage is unavailable, so the saved data could not be downloaded.' });
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="recovery-screen" role="alert"><div className="recovery-card">
      <p className="eyebrow">KOBO · RECOVERY</p>
      <h1>Something went wrong.</h1>
      <p>Don’t clear your browser data. You can download the raw data already saved in this browser before trying to reload.</p>
      <p>Unsubmitted forms or changes that could not be saved may be lost. This raw recovery file is unencrypted and is not a directly restorable Kobo backup.</p>
      <div className="recovery-actions"><button type="button" className="button button-primary" onClick={this.downloadRaw}>Download saved data</button><button type="button" className="button button-outline" onClick={() => window.location.reload()}>Reload Kobo</button></div>
      {this.state.message && <p role="status">{this.state.message}</p>}
    </div></main>;
  }
}
