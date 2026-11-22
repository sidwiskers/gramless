export class GramlessClientError extends Error {
  code: string;
  issues: any[];
  constructor(message: string, code?: string, issues?: any[]);
}

export interface ClientButtonController {
  show(text?: string | null, onClick?: (() => void) | null): void;
  hide(): void;
  enable(): void;
  disable(): void;
  setText(text: string): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  onClick(fn: () => void): void;
  offClick(fn: () => void): void;
  readonly isVisible: boolean;
  readonly isActive: boolean;
}

export interface ClientBackButtonController {
  show(onClick?: (() => void) | null): void;
  hide(): void;
  onClick(fn: () => void): void;
  offClick(fn: () => void): void;
  readonly isVisible: boolean;
}

export interface ClientHapticController {
  impact(style?: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notification(type?: 'error' | 'success' | 'warning'): void;
  selection(): void;
}

export interface ClientCloudStorageController {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string | number | boolean): Promise<boolean>;
  getItems(keys: string[]): Promise<Record<string, string>>;
  removeItem(key: string): Promise<boolean>;
  getKeys(): Promise<string[]>;
}

export interface ClientThemeController {
  readonly isDark: boolean;
  readonly themeParams: Record<string, string>;
  onThemeChange(callback: () => void): void;
}

export interface CreateClientOptions {
  baseUrl?: string;
  initData?: string;
  mock?: {
    initData?: string;
    user?: Record<string, any>;
  };
  fetch?: typeof fetch;
}

export class GramlessClient {
  constructor(options?: CreateClientOptions);
  baseUrl: string;
  initData: string;
  readonly user: Record<string, any> | null;
  readonly chat: Record<string, any> | null;
  readonly authDate: number | null;
  readonly startParam: string | null;
  readonly isTelegram: boolean;

  haptic: ClientHapticController;
  mainButton: ClientButtonController;
  secondaryButton: ClientButtonController;
  backButton: ClientBackButtonController;
  cloudStorage: ClientCloudStorageController;
  theme: ClientThemeController;

  ready(): this;
  expand(): this;
  close(): void;
  sendData(data: string | Record<string, any>): void;
  shareMessage(preparedMessageId: string): Promise<boolean>;
  call<T = any>(endpointName: string, payload?: Record<string, any>, options?: RequestInit): Promise<T>;
}

export function createClient(options?: CreateClientOptions): GramlessClient;
export default createClient;
