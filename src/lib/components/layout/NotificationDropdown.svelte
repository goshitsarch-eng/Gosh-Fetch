<script lang="ts">
  import { notifications } from '../../stores/notifications.svelte';
  import type { AppNotification } from '../../stores/notifications.svelte';
  import './NotificationDropdown.css';

  function getNotificationIcon(type: AppNotification['type']): string {
    switch (type) {
      case 'completed':
        return 'check_circle';
      case 'failed':
        return 'error';
      case 'added':
        return 'add_circle';
      case 'paused':
        return 'pause_circle';
      case 'resumed':
        return 'play_circle';
      default:
        return 'notifications';
    }
  }

  function getNotificationIconClass(type: AppNotification['type']): string {
    switch (type) {
      case 'completed':
        return 'notif-icon green';
      case 'failed':
        return 'notif-icon red';
      case 'added':
        return 'notif-icon blue';
      case 'paused':
        return 'notif-icon orange';
      case 'resumed':
        return 'notif-icon blue';
      default:
        return 'notif-icon';
    }
  }

  function getNotificationText(type: AppNotification['type']): string {
    switch (type) {
      case 'completed':
        return 'Download completed';
      case 'failed':
        return 'Download failed';
      case 'added':
        return 'Download added';
      case 'paused':
        return 'Download paused';
      case 'resumed':
        return 'Download resumed';
      default:
        return 'Notification';
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

  let isOpen = $state(false);
  let dropdownEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownEl && !dropdownEl.contains(e.target as Node)) {
        isOpen = false;
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  });

  function handleToggle() {
    if (!isOpen && notifications.unreadCount > 0) {
      notifications.markAllRead();
    }
    isOpen = !isOpen;
  }
</script>

<div class="notification-wrapper" bind:this={dropdownEl}>
  <button
    class="notification-bell"
    onclick={handleToggle}
    title="Notifications"
    aria-label={`Notifications${notifications.unreadCount > 0 ? ` (${notifications.unreadCount} unread)` : ''}`}
  >
    <span class="material-symbols-outlined">notifications</span>
    {#if notifications.unreadCount > 0}
      <span class="notification-badge"
        >{notifications.unreadCount > 9 ? '9+' : notifications.unreadCount}</span
      >
    {/if}
  </button>

  {#if isOpen}
    <div class="notification-dropdown">
      <div class="notif-header">
        <span class="notif-title">Notifications</span>
        {#if notifications.items.length > 0}
          <button class="notif-clear-btn" onclick={() => notifications.clearAll()}>
            Clear all
          </button>
        {/if}
      </div>
      <div class="notif-list">
        {#if notifications.items.length === 0}
          <div class="notif-empty">
            <span class="material-symbols-outlined">notifications_off</span>
            <span>No notifications</span>
          </div>
        {:else}
          {#each notifications.items.slice(0, 20) as notif (notif.id)}
            <div class="notif-item{!notif.read ? ' unread' : ''}">
              <span class="material-symbols-outlined {getNotificationIconClass(notif.type)}">
                {getNotificationIcon(notif.type)}
              </span>
              <div class="notif-content">
                <span class="notif-text">{getNotificationText(notif.type)}</span>
                <span class="notif-name" title={notif.downloadName}>{notif.downloadName}</span>
                <span class="notif-time">{formatRelativeTime(notif.timestamp)}</span>
              </div>
              <button
                class="notif-dismiss"
                onclick={(e) => {
                  e.stopPropagation();
                  notifications.remove(notif.id);
                }}
                aria-label="Dismiss"
              >
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>
