import ReconnectingWebSocket from 'reconnecting-websocket';
import type { CloseEvent as RwsCloseEvent } from 'reconnecting-websocket/dist/events';
import { buildAuthMessage } from './auth';
import type {
  AppoWssClientConfig,
  WssConnectionStatus,
  WssMessage,
} from './types';

const AUTH_REJECTED_CLOSE_CODE = 4401;
const PONG_TIMEOUT_CLOSE_CODE = 4408;
const SUBPROTOCOL_MISMATCH_CLOSE_CODE = 4400;

const DEFAULT_PING_INTERVAL_MS = 30_000;
const DEFAULT_PONG_TIMEOUT_MS = 10_000;

export class AppoWssClient {
  private readonly config: AppoWssClientConfig;
  private readonly rws: ReconnectingWebSocket;
  private readonly protocolVersion: string;
  private readonly pingIntervalMs: number;
  private readonly pongTimeoutMs: number;

  private status: WssConnectionStatus = 'idle';
  private authenticated = false;
  private closedByCaller = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: AppoWssClientConfig) {
    this.config = config;
    this.protocolVersion = config.protocolVersion ?? 'appo-v1';
    this.pingIntervalMs =
      config.keepalive?.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
    this.pongTimeoutMs =
      config.keepalive?.pongTimeoutMs ?? DEFAULT_PONG_TIMEOUT_MS;

    const protocols = [this.protocolVersion, `gk.${config.gateToken}`];
    const r = config.reconnect ?? {};

    const rwsOptions: Record<string, unknown> = {
      minReconnectionDelay: r.minDelayMs ?? 1000,
      maxReconnectionDelay: r.maxDelayMs ?? 30_000,
      reconnectionDelayGrowFactor: r.growFactor ?? 1.5,
      maxRetries: r.maxRetries ?? Infinity,
    };
    if (config.webSocketCtor) {
      rwsOptions.WebSocket = config.webSocketCtor;
    }

    this.rws = new ReconnectingWebSocket(config.url, protocols, rwsOptions);

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
    this.stopKeepalive();
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
    this.stopKeepalive();

    if (this.rws.protocol !== this.protocolVersion) {
      this.fail(
        'subprotocol_mismatch',
        SUBPROTOCOL_MISMATCH_CLOSE_CODE,
        `expected ${this.protocolVersion}, got ${this.rws.protocol || '(none)'}`,
      );
      return;
    }

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
      this.fail('getToken_failed', AUTH_REJECTED_CLOSE_CODE, reason);
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
      this.startKeepalive();
      return;
    }

    if (msg.type === 'auth_error') {
      const reason =
        typeof msg.reason === 'string' ? msg.reason : 'auth_error';
      this.fail(reason, AUTH_REJECTED_CLOSE_CODE);
      return;
    }

    if (msg.type === 'pong') {
      this.clearPongTimer();
      return;
    }

    if (this.authenticated) {
      this.config.onMessage?.(msg);
    }
  }

  private onClose(event: RwsCloseEvent): void {
    this.authenticated = false;
    this.stopKeepalive();

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

  private startKeepalive(): void {
    if (this.pingIntervalMs <= 0) return;
    this.stopKeepalive();
    this.pingTimer = setInterval(() => this.sendPing(), this.pingIntervalMs);
  }

  private stopKeepalive(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.clearPongTimer();
  }

  private clearPongTimer(): void {
    if (this.pongTimer !== null) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private sendPing(): void {
    if (!this.authenticated) return;
    this.rws.send(JSON.stringify({ type: 'ping' }));
    this.clearPongTimer();
    this.pongTimer = setTimeout(() => {
      // Server didn't pong in time — treat connection as dead. Don't fail-permanent;
      // close the socket so ReconnectingWebSocket reconnects.
      this.config.onAuthError?.('pong_timeout');
      this.rws.reconnect();
    }, this.pongTimeoutMs);
  }

  /** Permanent failure: notify caller, stop reconnect, close socket. */
  private fail(reason: string, _closeCode: number, detail?: string): void {
    this.authenticated = false;
    this.stopKeepalive();
    this.setStatus('auth_failed');
    this.config.onAuthError?.(detail ? `${reason}: ${detail}` : reason);
    this.closedByCaller = true;
    this.rws.close();
  }
}
