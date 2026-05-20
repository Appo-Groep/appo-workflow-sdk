import ReconnectingWebSocket from 'reconnecting-websocket';
import type { CloseEvent as RwsCloseEvent } from 'reconnecting-websocket/dist/events';
import { buildAuthMessage } from './auth';
import type {
  AppoWssClientConfig,
  WssConnectionStatus,
  WssMessage,
} from './types';

const AUTH_REJECTED_CLOSE_CODE = 4401;

export class AppoWssClient {
  private readonly config: AppoWssClientConfig;
  private readonly rws: ReconnectingWebSocket;
  private status: WssConnectionStatus = 'idle';
  private authenticated = false;
  private closedByCaller = false;

  constructor(config: AppoWssClientConfig) {
    this.config = config;

    const protocolVersion = config.protocolVersion ?? 'appo-v1';
    const protocols = [protocolVersion, `gk.${config.gateToken}`];

    const r = config.reconnect ?? {};
    this.rws = new ReconnectingWebSocket(config.url, protocols, {
      minReconnectionDelay: r.minDelayMs ?? 1000,
      maxReconnectionDelay: r.maxDelayMs ?? 30_000,
      reconnectionDelayGrowFactor: r.growFactor ?? 1.5,
      maxRetries: r.maxRetries ?? Infinity,
    });

    this.rws.addEventListener('open', () => {
      void this.onOpen();
    });
    this.rws.addEventListener('message', (event) => this.onRawMessage(event));
    this.rws.addEventListener('close', (event) => this.onClose(event));
    this.rws.addEventListener('error', () => {
      if (!this.closedByCaller) this.setStatus('reconnecting');
    });

    this.setStatus('connecting');
  }

  send(message: Record<string, unknown>): boolean {
    if (!this.authenticated) return false;
    this.rws.send(JSON.stringify(message));
    return true;
  }

  close(): void {
    this.closedByCaller = true;
    this.authenticated = false;
    this.rws.close();
    this.setStatus('disconnected');
  }

  getStatus(): WssConnectionStatus {
    return this.status;
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  private setStatus(next: WssConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.config.onStatusChange?.(next);
  }

  private async onOpen(): Promise<void> {
    this.authenticated = false;
    this.setStatus('authenticating');
    try {
      const token = await this.config.getToken();
      const authMsg = buildAuthMessage({
        token,
        sharedId: this.config.sharedId,
        clientType: this.config.clientType,
      });
      this.rws.send(JSON.stringify(authMsg));
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'getToken_failed';
      this.config.onAuthError?.(reason);
      this.setStatus('auth_failed');
      this.closedByCaller = true;
      this.rws.close();
    }
  }

  private onRawMessage(event: MessageEvent): void {
    const raw = typeof event.data === 'string' ? event.data : null;
    if (raw === null) return;

    let msg: WssMessage;
    try {
      msg = JSON.parse(raw) as WssMessage;
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'auth_success') {
      this.authenticated = true;
      this.setStatus('connected');
      return;
    }

    if (msg.type === 'auth_error') {
      this.authenticated = false;
      this.setStatus('auth_failed');
      const reason =
        typeof msg.reason === 'string' ? msg.reason : 'auth_error';
      this.config.onAuthError?.(reason);
      return;
    }

    if (this.authenticated) {
      this.config.onMessage?.(msg);
    }
  }

  private onClose(event: RwsCloseEvent): void {
    this.authenticated = false;

    if (event.code === AUTH_REJECTED_CLOSE_CODE) {
      this.setStatus('auth_failed');
      this.config.onAuthError?.('rejected_by_server');
      this.closedByCaller = true;
      this.rws.close();
      return;
    }

    if (this.closedByCaller) {
      this.setStatus('disconnected');
      return;
    }

    this.setStatus('reconnecting');
  }
}
