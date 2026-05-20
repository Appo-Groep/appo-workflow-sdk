type Listener = (event: { type: string; target: MockWebSocket; [k: string]: unknown }) => void;

/**
 * Minimal WebSocket-compatible mock that the SDK's `webSocketCtor` config can accept.
 * Tests drive it via the helper methods (`simulateOpen`, `simulateMessage`,
 * `simulateClose`) and inspect `sentMessages` to assert what the client wrote.
 *
 * Every constructed instance is recorded on `MockWebSocket.instances` so tests
 * can observe reconnect attempts (ReconnectingWebSocket builds a new one each
 * time it reconnects).
 */
export class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  static reset(): void {
    MockWebSocket.instances = [];
  }

  readonly url: string;
  readonly offeredProtocols: string[];
  protocol = '';
  readyState: number = MockWebSocket.CONNECTING;
  sentMessages: string[] = [];

  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.offeredProtocols = Array.isArray(protocols)
      ? protocols
      : protocols
        ? [protocols]
        : [];
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error(
        `MockWebSocket.send called in readyState=${this.readyState}`,
      );
    }
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.fire('close', { code, reason, wasClean: true });
  }

  // --- test helpers ---------------------------------------------------------

  simulateOpen(serverProtocol = 'appo-v1'): void {
    this.protocol = serverProtocol;
    this.readyState = MockWebSocket.OPEN;
    this.fire('open', {});
  }

  simulateMessage(data: unknown): void {
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    this.fire('message', { data: raw });
  }

  simulateClose(code = 1006, reason = 'simulated'): void {
    this.readyState = MockWebSocket.CLOSED;
    this.fire('close', { code, reason, wasClean: false });
  }

  // --- internals ------------------------------------------------------------

  private fire(type: string, init: Record<string, unknown>): void {
    const event = { type, target: this, ...init };
    this.listeners.get(type)?.forEach((l) => l(event));
  }

  lastSent(): unknown {
    const raw = this.sentMessages.at(-1);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}
