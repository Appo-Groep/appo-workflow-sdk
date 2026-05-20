export type WssClientType = 'extension' | 'retool';

export type WssConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'auth_failed';

export interface WssMessage {
  type: string;
  [key: string]: unknown;
}

export interface ReconnectOptions {
  minDelayMs?: number;
  maxDelayMs?: number;
  growFactor?: number;
  maxRetries?: number;
}

export interface AppoWssClientConfig {
  url: string;

  gateToken: string;

  sharedId: string;

  clientType: WssClientType;

  getToken: () => Promise<string>;

  onMessage?: (msg: WssMessage) => void;

  onStatusChange?: (status: WssConnectionStatus) => void;

  onAuthError?: (reason: string) => void;

  protocolVersion?: string;

  reconnect?: ReconnectOptions;
}
