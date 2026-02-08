import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import {
  selectUpdaterPhase,
  selectUpdaterVersion,
  selectUpdaterProgress,
  selectUpdaterReleaseNotes,
} from '../../store/updaterSlice';
import './UpdateModal.css';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function renderReleaseNotes(md: string): string {
  if (!md) return '<p>No release notes available.</p>';

  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Remaining plain lines as paragraphs
  html = html
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<')) return trimmed;
      return `<p>${trimmed}</p>`;
    })
    .join('\n');

  return html;
}

export default function UpdateModal() {
  const phase = useSelector(selectUpdaterPhase);
  const version = useSelector(selectUpdaterVersion);
  const progress = useSelector(selectUpdaterProgress);
  const releaseNotes = useSelector(selectUpdaterReleaseNotes);

  if (phase !== 'downloading' && phase !== 'downloaded') return null;

  const isComplete = phase === 'downloaded';

  async function handleInstall() {
    try {
      await window.electronAPI.updaterInstall();
    } catch (err) {
      console.error('Failed to install update:', err);
    }
  }

  return createPortal(
    <div className="update-modal-backdrop">
      <div className="update-modal" role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
        {/* Header */}
        <div className="update-modal-header">
          <div className="update-modal-header-left">
            <div className="update-modal-icon-wrap">
              <span className="material-symbols-outlined">cloud_download</span>
            </div>
            <div>
              <h2 id="update-modal-title">Updating Gosh-Fetch</h2>
              <span className="update-modal-target">Target Version v{version}</span>
            </div>
          </div>
          <span className={`update-modal-status-pill${isComplete ? ' complete' : ''}`}>
            <span className={`update-modal-status-dot${isComplete ? ' complete' : ''}`} />
            {isComplete ? 'COMPLETE' : 'IN PROGRESS'}
          </span>
        </div>

        {/* Progress Section */}
        <div className="update-modal-progress-section">
          <div className="update-modal-progress-info">
            <div className="update-modal-progress-left">
              <span className="update-modal-progress-label">
                {isComplete ? 'Download Complete' : 'Downloading Update...'}
              </span>
              <span className="update-modal-progress-detail">
                {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
                {!isComplete && ` \u2022 ${formatSpeed(progress.bytesPerSecond)}`}
              </span>
            </div>
            <span className="update-modal-percent">{Math.round(progress.percent)}%</span>
          </div>
          <div className="update-modal-progress-track">
            <div
              className={`update-modal-progress-fill${isComplete ? ' complete' : ''}`}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>

        {/* Release Notes */}
        {releaseNotes && (
          <div className="update-modal-notes-section">
            <div className="update-modal-notes-label">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sticky_note_2</span>
              <span>RELEASE NOTES</span>
            </div>
            <div
              className="update-modal-notes-body"
              dangerouslySetInnerHTML={{ __html: renderReleaseNotes(releaseNotes) }}
            />
          </div>
        )}

        {/* Footer */}
        <div className="update-modal-footer">
          {isComplete ? (
            <button className="btn btn-primary" onClick={handleInstall}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>restart_alt</span>
              Install &amp; Restart
            </button>
          ) : (
            <div className="update-modal-footer-note">
              <span className="material-symbols-outlined spin" style={{ fontSize: 14 }}>sync</span>
              <span>Gosh-Fetch will restart automatically once the update is ready.</span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
