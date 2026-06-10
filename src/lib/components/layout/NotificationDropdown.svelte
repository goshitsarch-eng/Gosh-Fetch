<script lang="ts">
  import Icon from '../ui/Icon.svelte';
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
        return 'downloading';
      case 'paused':
        return 'pause';
      case 'resumed':
        return 'play_arrow';
      default:
        return 'notifications';
    }
  }

  function getNotificationIconClass(type: AppNotification['type']): string {
    switch (type) {
      case 'completed':
        return 'done';
      case 'failed':
        return 'err';
      case 'added':
      case 'resumed':
        return 'act';
      default:
        return '';
    }
  }

  function getNotificationText(type: AppNotification['type']): string {
    switch (type) {
      case 'completed':
        return 'Download complete';
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

<div class="notif-wrapper" bind:this={dropdownEl}>
  <button
    class="icon-btn notif-bell"
    onclick={handleToggle}
    title="Notifications"
    aria-label={`Notifications${notifications.unreadCount > 0 ? ` (${notifications.unreadCount} unread)` : ''}`}
  >
    <Icon name="notifications" />
    {#if notifications.unreadCount > 0}
      <span class="notif-unread-dot"></span>
    {/if}
  </button>

  {#if isOpen}
    <div class="notif-dropdown">
      <div class="notif-head">
        <b>Notifications</b>
        {#if notifications.items.length > 0}
          <button onclick={() => notifications.clearAll()}>Clear all</button>
        {/if}
      </div>
      {#if notifications.items.length === 0}
        <div class="notif-empty">
          <Icon name="notifications_off" size={26} />
          <span>No notifications</span>
        </div>
      {:else}
        {#each notifications.items.slice(0, 20) as notif (notif.id)}
          <div class="notif-item" class:unread={!notif.read}>
            <div class="notif-ico {getNotificationIconClass(notif.type)}">
              <Icon name={getNotificationIcon(notif.type)} fill size={17} />
            </div>
            <div class="body">
              <div class="t">{getNotificationText(notif.type)}</div>
              <div class="d" title={notif.downloadName}>{notif.downloadName}</div>
              <div class="time">{formatRelativeTime(notif.timestamp)}</div>
            </div>
            <button
              class="notif-dismiss"
              onclick={(e) => {
                e.stopPropagation();
                notifications.remove(notif.id);
              }}
              aria-label="Dismiss"
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
