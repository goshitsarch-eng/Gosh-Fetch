export interface AppNotification {
  id: string;
  type: 'completed' | 'failed' | 'added' | 'paused' | 'resumed';
  downloadName: string;
  timestamp: number;
  read: boolean;
}

const MAX_NOTIFICATIONS = 50;

class NotificationStore {
  items = $state<AppNotification[]>([]);

  unreadCount = $derived(this.items.filter((n) => !n.read).length);

  add(type: AppNotification['type'], downloadName: string) {
    const notification: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      downloadName,
      timestamp: Date.now(),
      read: false,
    };
    this.items = [notification, ...this.items].slice(0, MAX_NOTIFICATIONS);
  }

  markAllRead() {
    this.items = this.items.map((n) => ({ ...n, read: true }));
  }

  remove(id: string) {
    this.items = this.items.filter((n) => n.id !== id);
  }

  clearAll() {
    this.items = [];
  }
}

export const notifications = new NotificationStore();
