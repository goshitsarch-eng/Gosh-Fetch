import React, { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectNotifications, selectUnreadCount, markAllRead, clearAll, removeNotification } from '../../store/notificationSlice';
import type { AppNotification } from '../../store/notificationSlice';
import type { AppDispatch } from '../../store/store';
import './NotificationDropdown.css';

function getNotificationIcon(type: AppNotification['type']): string {
  switch (type) {
    case 'completed': return 'check_circle';
    case 'failed': return 'error';
    case 'added': return 'add_circle';
    case 'paused': return 'pause_circle';
    case 'resumed': return 'play_circle';
    default: return 'notifications';
  }
}

function getNotificationIconClass(type: AppNotification['type']): string {
  switch (type) {
    case 'completed': return 'notif-icon green';
    case 'failed': return 'notif-icon red';
    case 'added': return 'notif-icon blue';
    case 'paused': return 'notif-icon orange';
    case 'resumed': return 'notif-icon blue';
    default: return 'notif-icon';
  }
}

function getNotificationText(type: AppNotification['type']): string {
  switch (type) {
    case 'completed': return 'Download completed';
    case 'failed': return 'Download failed';
    case 'added': return 'Download added';
    case 'paused': return 'Download paused';
    case 'resumed': return 'Download resumed';
    default: return 'Notification';
  }
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationDropdown() {
  const dispatch = useDispatch<AppDispatch>();
  const notifications = useSelector(selectNotifications);
  const unreadCount = useSelector(selectUnreadCount);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  function handleToggle() {
    setIsOpen(prev => !prev);
    if (!isOpen && unreadCount > 0) {
      dispatch(markAllRead());
    }
  }

  return (
    <div className="notification-wrapper" ref={dropdownRef}>
      <button
        className="notification-bell"
        onClick={handleToggle}
        title="Notifications"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notif-header">
            <span className="notif-title">Notifications</span>
            {notifications.length > 0 && (
              <button className="notif-clear-btn" onClick={() => dispatch(clearAll())}>
                Clear all
              </button>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <span className="material-symbols-outlined">notifications_off</span>
                <span>No notifications</span>
              </div>
            ) : (
              notifications.slice(0, 20).map(notif => (
                <div key={notif.id} className={`notif-item${!notif.read ? ' unread' : ''}`}>
                  <span className={`material-symbols-outlined ${getNotificationIconClass(notif.type)}`}>
                    {getNotificationIcon(notif.type)}
                  </span>
                  <div className="notif-content">
                    <span className="notif-text">{getNotificationText(notif.type)}</span>
                    <span className="notif-name" title={notif.downloadName}>{notif.downloadName}</span>
                    <span className="notif-time">{formatRelativeTime(notif.timestamp)}</span>
                  </div>
                  <button
                    className="notif-dismiss"
                    onClick={(e) => { e.stopPropagation(); dispatch(removeNotification(notif.id)); }}
                    aria-label="Dismiss"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
