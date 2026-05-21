import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppoWssClient } from './client';
import { MockWebSocket } from './test-utils/mock-websocket';
import type {
  AppoWssClientConfig,
  WssConnectionStatus,
} from './types';

const SHARED_ID = '00000000-0000-4000-8000-000000000000';

function buildClient(overrides: Partial<AppoWssClientConfig> = {}): {
  client: AppoWssClient;
  statuses: WssConnectionStatus[];
  authErrors: string[];
  messages: unknown[];
  getToken: ReturnType<typeof vi.fn>;
} {
  const statuses: WssConnectionStatus[] = [];
  const authErrors: string[] = [];
  const messages: unknown[] = [];
  const getToken = vi.fn(async () => 'test-token');

  const client = new AppoWssClient({
    url: 'ws://test/connect',
    gateToken: 'GATE',
    sharedId: SHARED_ID,
    clientType: 'extension',
    getToken,
    onMessage: (m) => messages.push(m),
    onStatusChange: (s) => statuses.push(s),
    onAuthError: (r) => authErrors.push(r),
    reconnect: { minDelayMs: 1, maxDelayMs: 5, maxRetries: 0 },
    keepalive: { pingIntervalMs: 1000, pongTimeoutMs: 200 },
    webSocketCtor: MockWebSocket as unknown as AppoWssClientConfig['webSocketCtor'],
    ...overrides,
  });

  return { client, statuses, authErrors, messages, getToken };
}

function lastSocket(): MockWebSocket {
  const s = MockWebSocket.instances.at(-1);
  if (!s) throw new Error('no socket created');
  return s;
}

/**
 * ReconnectingWebSocket defers the initial connect through setTimeout(_,0) +
 * a Promise chain. Two real ticks is enough to land in `new WebSocket(...)`.
 */
const realTick = () => new Promise<void>((r) => setTimeout(r, 0));
const waitForSocket = async (): Promise<MockWebSocket> => {
  for (let i = 0; i < 10; i++) {
    if (MockWebSocket.instances.length > 0) return lastSocket();
    await realTick();
  }
  throw new Error('socket never constructed');
};

/** Microtask flush — used after simulateOpen() because client.onOpen awaits getToken(). */
const flushAuthSend = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('AppoWssClient — handshake', () => {
  beforeEach(() => {
    MockWebSocket.reset();
  });

  it('offers appo-v1 and gk.<token> as subprotocols', async () => {
    buildClient();
    const sock = await waitForSocket();
    expect(sock.offeredProtocols).toEqual(['appo-v1', 'gk.GATE']);
  });

  it('fails with subprotocol_mismatch if server does not echo appo-v1', async () => {
    const { authErrors, statuses } = buildClient();
    const sock = await waitForSocket();
    sock.simulateOpen('');
    await flushAuthSend();

    expect(statuses).toContain('auth_failed');
    expect(authErrors[0]).toMatch(/^subprotocol_mismatch:/);
  });

  it('sends an auth message with the configured shared_id, client_type, and token', async () => {
    const { getToken } = buildClient();
    const sock = await waitForSocket();
    sock.simulateOpen('appo-v1');
    await flushAuthSend();

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(sock.lastSent()).toEqual({
      type: 'auth',
      token: 'test-token',
      shared_id: SHARED_ID,
      client_type: 'extension',
    });
  });

  it('includes client_version in the auth message when config provides it', async () => {
    buildClient({ clientVersion: '2.3.1' });
    const sock = await waitForSocket();
    sock.simulateOpen('appo-v1');
    await flushAuthSend();

    expect(sock.lastSent()).toEqual({
      type: 'auth',
      token: 'test-token',
      shared_id: SHARED_ID,
      client_type: 'extension',
      client_version: '2.3.1',
    });
  });

  it('fails with getToken_failed when getToken throws', async () => {
    const { authErrors, statuses } = buildClient({
      getToken: async () => {
        throw new Error('no_chrome_account');
      },
    });
    const sock = await waitForSocket();
    sock.simulateOpen('appo-v1');
    await flushAuthSend();

    expect(statuses).toContain('auth_failed');
    expect(authErrors[0]).toMatch(/getToken_failed/);
  });
});

describe('AppoWssClient — auth result', () => {
  beforeEach(() => {
    MockWebSocket.reset();
  });

  it('transitions to connected on auth_success', async () => {
    const { client, statuses } = buildClient();
    const sock = await waitForSocket();
    sock.simulateOpen('appo-v1');
    await flushAuthSend();

    sock.simulateMessage({
      type: 'auth_success',
      user_id: 'u@appo.com',
      role: 'it_member',
    });
    expect(statuses).toContain('connected');
    expect(client.isAuthenticated()).toBe(true);
  });

  it('transitions to auth_failed on auth_error with the server-provided reason', async () => {
    const { client, authErrors, statuses } = buildClient();
    const sock = await waitForSocket();
    sock.simulateOpen('appo-v1');
    await flushAuthSend();

    sock.simulateMessage({ type: 'auth_error', reason: 'not_in_allowlist' });
    expect(statuses).toContain('auth_failed');
    expect(authErrors).toContain('not_in_allowlist');
    expect(client.isAuthenticated()).toBe(false);
  });

  it('reports rejected_by_server and does not reconnect on close(4401)', async () => {
    const { authErrors, statuses } = buildClient();
    const sock = await waitForSocket();
    sock.simulateOpen('appo-v1');
    await flushAuthSend();

    const socketsBefore = MockWebSocket.instances.length;
    sock.simulateClose(4401, 'auth rejected');

    expect(statuses).toContain('auth_failed');
    expect(authErrors).toContain('rejected_by_server');
    await realTick();
    await realTick();
    expect(MockWebSocket.instances.length).toBe(socketsBefore);
  });

  it('transitions to reconnecting on a non-4401 server close', async () => {
    const { statuses } = buildClient();
    const sock = await waitForSocket();
    sock.simulateOpen('appo-v1');
    await flushAuthSend();
    sock.simulateMessage({
      type: 'auth_success',
      user_id: 'u@appo.com',
      role: 'it_member',
    });
    sock.simulateClose(1006);

    expect(statuses).toContain('reconnecting');
  });
});

describe('AppoWssClient — keepalive', () => {
  beforeEach(() => {
    MockWebSocket.reset();
  });

  it('clears the pong timeout when a pong arrives', async () => {
    const { authErrors } = buildClient();
    const sock = await waitForSocket();
    sock.simulateOpen('appo-v1');
    await flushAuthSend();

    // Install fake timers BEFORE auth_success so the ping interval uses them.
    vi.useFakeTimers();
    try {
      sock.simulateMessage({
        type: 'auth_success',
        user_id: 'u@appo.com',
        role: 'it_member',
      });
      vi.advanceTimersByTime(1100); // triggers ping
      sock.simulateMessage({ type: 'pong' });
      vi.advanceTimersByTime(500); // past pongTimeoutMs of 200
    } finally {
      vi.useRealTimers();
    }

    expect(authErrors).not.toContain('pong_timeout');
  });

  it('reports pong_timeout when pong does not arrive', async () => {
    const { authErrors } = buildClient();
    const sock = await waitForSocket();
    sock.simulateOpen('appo-v1');
    await flushAuthSend();

    vi.useFakeTimers();
    try {
      sock.simulateMessage({
        type: 'auth_success',
        user_id: 'u@appo.com',
        role: 'it_member',
      });
      vi.advanceTimersByTime(1100); // triggers ping
      vi.advanceTimersByTime(300); // past pongTimeoutMs of 200
    } finally {
      vi.useRealTimers();
    }

    expect(authErrors).toContain('pong_timeout');
  });
});

describe('AppoWssClient — send / close', () => {
  beforeEach(() => {
    MockWebSocket.reset();
  });

  it('send() returns false before auth_success', async () => {
    const { client } = buildClient();
    await waitForSocket();
    expect(client.send({ type: 'context_get' })).toBe(false);
  });

  it('send() writes a JSON message after auth_success', async () => {
    const { client } = buildClient();
    const sock = await waitForSocket();
    sock.simulateOpen('appo-v1');
    await flushAuthSend();
    sock.simulateMessage({
      type: 'auth_success',
      user_id: 'u@appo.com',
      role: 'it_member',
    });

    const sentBefore = sock.sentMessages.length;
    expect(client.send({ type: 'state_get', key: 'foo' })).toBe(true);
    expect(sock.sentMessages.length).toBe(sentBefore + 1);
    expect(JSON.parse(sock.sentMessages.at(-1)!)).toEqual({
      type: 'state_get',
      key: 'foo',
    });
  });

  it('routes non-auth messages to onMessage only after auth_success', async () => {
    const { messages } = buildClient();
    const sock = await waitForSocket();
    sock.simulateOpen('appo-v1');
    await flushAuthSend();

    sock.simulateMessage({ type: 'state_data', key: 'x' });
    expect(messages).toEqual([]);

    sock.simulateMessage({
      type: 'auth_success',
      user_id: 'u@appo.com',
      role: 'it_member',
    });
    sock.simulateMessage({ type: 'state_data', key: 'x', value: 42 });
    expect(messages).toEqual([{ type: 'state_data', key: 'x', value: 42 }]);
  });

  it('close() transitions to disconnected', async () => {
    const { client, statuses } = buildClient();
    const sock = await waitForSocket();
    sock.simulateOpen('appo-v1');
    await flushAuthSend();
    sock.simulateMessage({
      type: 'auth_success',
      user_id: 'u@appo.com',
      role: 'it_member',
    });

    client.close();
    expect(statuses).toContain('disconnected');
    expect(client.isAuthenticated()).toBe(false);
  });
});
