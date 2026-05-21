type WssClientType = 'extension' | 'retool';
type WssConnectionStatus = 'idle' | 'connecting' | 'authenticating' | 'connected' | 'reconnecting' | 'disconnected' | 'auth_failed';
interface WssMessage {
    type: string;
    [key: string]: unknown;
}
interface ReconnectOptions {
    minDelayMs?: number;
    maxDelayMs?: number;
    growFactor?: number;
    maxRetries?: number;
}
interface KeepaliveOptions {
    /** How often to send `{type:"ping"}` while connected. 0 disables. Default 30_000. */
    pingIntervalMs?: number;
    /** How long to wait for a matching `pong` before treating the connection dead. Default 10_000. */
    pongTimeoutMs?: number;
}
type WebSocketCtor = new (url: string, protocols?: string | string[]) => WebSocket;
interface AppoWssClientConfig {
    url: string;
    gateToken: string;
    sharedId: string;
    clientType: WssClientType;
    getToken: () => Promise<string>;
    onMessage?: (msg: WssMessage) => void;
    onStatusChange?: (status: WssConnectionStatus) => void;
    /**
     * Called when the connection cannot proceed past handshake/auth.
     * Reasons include: `rejected_by_server`, `auth_error`, `getToken_failed`,
     * `subprotocol_mismatch`, `pong_timeout`, or any string the server provides
     * in an `auth_error.reason` field.
     */
    onAuthError?: (reason: string) => void;
    /**
     * Sent as the first entry in `Sec-WebSocket-Protocol`. The server is expected
     * to echo this exact value back as the negotiated subprotocol; if it does not,
     * the SDK treats the connection as misrouted/misconfigured and closes it.
     * Default: `appo-v1`.
     */
    protocolVersion?: string;
    reconnect?: ReconnectOptions;
    keepalive?: KeepaliveOptions;
    /**
     * Custom WebSocket constructor. Defaults to the global `WebSocket`.
     * Primarily a hook for tests to inject a mock; can also be used in non-browser
     * environments (e.g. Node) by passing `ws`'s WebSocket class.
     */
    webSocketCtor?: WebSocketCtor;
    /**
     * Optional caller-supplied build version string included in the auth message
     * as `client_version`. The server records it so a compatibility checker
     * (e.g. the Retool app) can detect outdated clients and prompt the user
     * to update. Free-form string; typically `package.json#version`.
     */
    clientVersion?: string;
}

declare class AppoWssClient {
    private readonly config;
    private readonly rws;
    private readonly protocolVersion;
    private readonly pingIntervalMs;
    private readonly pongTimeoutMs;
    private status;
    private authenticated;
    private closedByCaller;
    private pingTimer;
    private pongTimer;
    constructor(config: AppoWssClientConfig);
    send(message: Record<string, unknown>): boolean;
    close(): void;
    getStatus(): WssConnectionStatus;
    isAuthenticated(): boolean;
    private setStatus;
    private onOpen;
    private onRawMessage;
    private onClose;
    private startKeepalive;
    private stopKeepalive;
    private clearPongTimer;
    private sendPing;
    /** Permanent failure: notify caller, stop reconnect, close socket. */
    private fail;
}

interface ValidationResult {
    valid: boolean;
    errors?: string[];
}
declare function validateMessage(msg: unknown): ValidationResult;

export { AppoWssClient, type AppoWssClientConfig, type ValidationResult, type WssClientType, type WssConnectionStatus, type WssMessage, validateMessage };
