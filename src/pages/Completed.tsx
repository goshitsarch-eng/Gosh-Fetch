import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { CheckCircle } from 'lucide-react';
import DownloadCard from '../components/downloads/DownloadCard';
import { selectCompletedDownloads, clearHistory, fetchDownloads, loadCompletedHistory } from '../store/downloadSlice';
import { formatBytes } from '../lib/utils/format';
import type { AppDispatch } from '../store/store';

export default function Completed() {
  const dispatch = useDispatch<AppDispatch>();
  const completedDownloads = useSelector(selectCompletedDownloads);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const totalSize = completedDownloads.reduce((sum, d) => sum + d.totalSize, 0);

  useEffect(() => {
    dispatch(loadCompletedHistory());
    dispatch(fetchDownloads());
    const interval = setInterval(() => dispatch(fetchDownloads()), 1000);
    return () => clearInterval(interval);
  }, [dispatch]);

  async function handleClearHistory() {
    setIsClearing(true);
    await dispatch(clearHistory());
    setIsClearing(false);
    setShowClearConfirm(false);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="header-left">
          <h1>Completed</h1>
          <div className="header-stats">
            <span className="stat">{completedDownloads.length} downloads</span>
            <span className="stat-divider">{'\u00B7'}</span>
            <span className="stat">{formatBytes(totalSize)} total</span>
          </div>
        </div>
        {completedDownloads.length > 0 && (
          <button className="btn btn-secondary" onClick={() => setShowClearConfirm(true)} disabled={isClearing}>
            {isClearing ? 'Clearing...' : 'Clear History'}
          </button>
        )}
      </header>

      <div className="downloads-list">
        {completedDownloads.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon" style={{ color: 'var(--color-success)' }}><CheckCircle size={48} /></div>
            <h3>No completed downloads</h3>
            <p>Downloads will appear here once they finish</p>
          </div>
        ) : (
          completedDownloads.map(download => <DownloadCard key={download.gid} download={download} />)
        )}
      </div>

      {showClearConfirm && (
        <div className="modal-backdrop" onClick={() => setShowClearConfirm(false)} role="dialog" aria-modal="true" aria-labelledby="clear-history-title">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" id="clear-history-title">Clear History</h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to clear download history? This will not delete the downloaded files.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowClearConfirm(false)}>Cancel</button>
              <button className="btn btn-destructive" onClick={handleClearHistory} disabled={isClearing}>
                {isClearing ? 'Clearing...' : 'Clear History'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
