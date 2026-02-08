import { createPortal } from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectUpdaterPhase,
  selectUpdaterVersion,
  selectUpdaterDismissed,
  dismissUpdate,
  setDownloading,
} from '../../store/updaterSlice';
import type { AppDispatch } from '../../store/store';
import './UpdateToast.css';

export default function UpdateToast() {
  const dispatch = useDispatch<AppDispatch>();
  const phase = useSelector(selectUpdaterPhase);
  const version = useSelector(selectUpdaterVersion);
  const dismissed = useSelector(selectUpdaterDismissed);

  if (phase !== 'available' || dismissed) return null;

  function handleLater() {
    dispatch(dismissUpdate());
  }

  async function handleUpdateNow() {
    dispatch(setDownloading());
    try {
      await window.electronAPI.updaterDownload();
    } catch (err) {
      console.error('Failed to start update download:', err);
    }
  }

  return createPortal(
    <div className="update-toast" role="alert" aria-live="polite">
      <button className="update-toast-close" onClick={handleLater} aria-label="Close">
        <span className="material-symbols-outlined">close</span>
      </button>

      <div className="update-toast-header">
        <div className="update-toast-icon-badge">
          <span className="material-symbols-outlined">bolt</span>
        </div>
        <div className="update-toast-header-text">
          <span className="update-toast-label">GOSH-FETCH</span>
          <span className="update-toast-version">
            v{version}
            <span className="update-toast-pulse-dot" />
          </span>
        </div>
      </div>

      <div className="update-toast-body">
        <h4 className="update-toast-title">New Update Available</h4>
        <p className="update-toast-desc">
          A fresh build is ready to install. This update includes improvements and bug fixes.
        </p>
      </div>

      <div className="update-toast-actions">
        <button className="btn btn-ghost" onClick={handleLater}>Later</button>
        <button className="btn btn-primary" onClick={handleUpdateNow}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
          Update Now
        </button>
      </div>
    </div>,
    document.body
  );
}
