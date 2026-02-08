export {};

declare global {
  interface Window {
    electronAPI: {
      invoke: (method: string, params?: any) => Promise<any>;
      onEvent: (callback: (event: string, data: any) => void) => () => void;
      removeAllListeners: (channel: string) => void;
      selectFile: (options?: {
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<string | null>;
      selectDirectory: () => Promise<string | null>;
      showNotification: (title: string, body: string) => Promise<void>;
      platform: string;
    };
  }
}
