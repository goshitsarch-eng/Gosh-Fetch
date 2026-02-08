import React from 'react';
import { useSelector } from 'react-redux';
import { selectStats, selectIsConnected } from '../../store/statsSlice';
import { formatSpeed } from '../../lib/utils/format';
import './StatusBar.css';

export default function StatusBar() {
  const stats = useSelector(selectStats);
  const isConnected = useSelector(selectIsConnected);

  return (
    <footer className="status-bar">
      <div className="status-left">
        <div className="status-speed download">
          <span className="material-symbols-outlined">download</span>
          <span className="status-speed-value">{formatSpeed(stats.downloadSpeed)}</span>
        </div>
        <div className="status-speed upload">
          <span className="material-symbols-outlined">upload</span>
          <span className="status-speed-value">{formatSpeed(stats.uploadSpeed)}</span>
        </div>
      </div>
      <div className="status-right">
        <div className={`status-connection ${isConnected ? 'online' : 'offline'}`}>
          <span className="connection-dot" />
          <span>{isConnected ? 'Online' : 'Offline'}</span>
        </div>
      </div>
    </footer>
  );
}
