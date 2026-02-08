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
      getNativeTheme: () => Promise<boolean>;
      updaterDownload: () => Promise<void>;
      updaterInstall: () => Promise<void>;
      setLoginItemSettings: (openAtLogin: boolean) => Promise<void>;
      getLoginItemSettings: () => Promise<{ openAtLogin: boolean }>;
      setDefaultProtocolClient: (protocol: string) => Promise<boolean>;
      removeDefaultProtocolClient: (protocol: string) => Promise<boolean>;
      isDefaultProtocolClient: (protocol: string) => Promise<boolean>;
      importSettingsFile: () => Promise<any | null>;
      getDiskSpace: (path?: string) => Promise<{ total: number; free: number }>;
      platform: string;
    };
  }
}
