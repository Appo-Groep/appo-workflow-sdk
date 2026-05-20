# appo-wss-sdk

Client SDK for the Appo Workflow WebSocket server (WSS). Used by the Chrome extension and by the Retool app.

The SDK handles:
- The pre-auth gate-token handshake in `Sec-WebSocket-Protocol`
- The first-message Google-OAuth2 auth handshake
- Auto-reconnect with token refresh on every reconnect
- Connection status callbacks
- JSON-schema validation against the WSS protocol

The SDK is **auth-format agnostic** — the caller provides a `getToken()` function, and the SDK forwards whatever string it returns to the server. The WSS decides how to validate it.

The SDK contains **no secrets, no hardcoded URLs, no system-specific config**. Everything sensitive is passed in at construction time by the caller (Retool env vars / extension build config).

---

## Install

### Chrome extension (bundled at build time)

```bash
npm install github:Appo-Groep/appo-workflow-sdk#v0.1.0
```

```ts
import { AppoWssClient } from '@appo-groep/appo-wss-sdk';
```

### Retool app (jsDelivr, pinned tag)

```html
<script src="https://cdn.jsdelivr.net/gh/Appo-Groep/appo-workflow-sdk@v0.1.0/dist/index.global.js"></script>
```

```js
const { AppoWssClient } = window.AppoWssSdk;
```

Pin to an explicit version tag. Never use `@latest`.

---

## Usage

### Retool

```ts
const client = new AppoWssClient({
  url: retoolContext.configVars.WSS_URL,
  gateToken: retoolContext.configVars.WSS_GATE_TOKEN,
  sharedId: urlParams.get('shared_id'),
  clientType: 'retool',
  getToken: async () => {
    // GIS tokenClient handles silent refresh after first interactive grant
    const response = await tokenClient.requestAccessToken({ prompt: '' });
    return response.access_token;
  },
  onMessage: (msg) => { /* route to Retool state */ },
  onStatusChange: (status) => { /* update UI */ },
  onAuthError: (reason) => { /* surface to user */ },
});

client.send({ type: 'context_get' });
```

### Chrome extension

```ts
const client = new AppoWssClient({
  url: WSS_URL,
  gateToken: GATE_TOKEN,
  sharedId,
  clientType: 'extension',
  getToken: () => new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) reject(new Error('auth_failed'));
      else resolve(token);
    });
  }),
  onMessage: (msg) => { /* dispatch to content scripts */ },
});
```

---

## API

### `new AppoWssClient(config)`

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | `string` | yes | WSS URL, e.g. `wss://wss.appo-workflow.internal/connect`. |
| `gateToken` | `string` | yes | Static gate token (pre-auth noise filter). Sent in `Sec-WebSocket-Protocol` as `gk.<token>`. Not a security credential. |
| `sharedId` | `string` | yes | UUID identifying the extension↔Retool channel. |
| `clientType` | `'extension' \| 'retool'` | yes | Which side of the channel this client is. |
| `getToken` | `() => Promise<string>` | yes | Returns a Google OAuth2 access token. Called fresh on every connect and reconnect. |
| `onMessage` | `(msg) => void` | no | Called for every message received after `auth_success`. |
| `onStatusChange` | `(status) => void` | no | Called on transitions between `idle \| connecting \| authenticating \| connected \| reconnecting \| disconnected \| auth_failed`. |
| `onAuthError` | `(reason: string) => void` | no | Called when auth fails. Reasons: `rejected_by_server`, `auth_error`, `getToken_failed`, `subprotocol_mismatch`, `pong_timeout`, or any string the server provides in `auth_error.reason`. |
| `protocolVersion` | `string` | no | Defaults to `appo-v1`. Sent first in `Sec-WebSocket-Protocol`. Server is expected to echo this back; if not, the SDK closes the connection with `subprotocol_mismatch`. |
| `reconnect` | object | no | Tuning: `{ minDelayMs, maxDelayMs, growFactor, maxRetries }`. |
| `keepalive` | object | no | `{ pingIntervalMs?: number (default 30000), pongTimeoutMs?: number (default 10000) }`. Set `pingIntervalMs: 0` to disable. |
| `webSocketCtor` | `new (url, protocols?) => WebSocket` | no | Custom WebSocket constructor. Defaults to the global `WebSocket`. Tests pass a mock; servers can pass `ws`'s class for Node. |

### Methods

- `client.send(message)` — Sends a JSON message. Returns `false` if not yet authenticated.
- `client.close()` — Closes the connection permanently (no further reconnect).
- `client.getStatus()` — Returns the current status.
- `client.isAuthenticated()` — Returns whether the connection is past `auth_success`.

### `validateMessage(msg)`

Validates a message against the SDK's JSON-schema registry. Returns `{ valid: true }` for unknown types (so the server can introduce new types without breaking older SDKs).

---

## Connection lifecycle

```
new AppoWssClient(...)
  │  status: connecting
  │
  └─→ ReconnectingWebSocket dials WSS with
      Sec-WebSocket-Protocol: appo-v1, gk.<gateToken>
        │
        ├─[gate token wrong]→ server destroys socket silently
        │                     ReconnectingWebSocket retries with backoff
        │
        └─[gate ok]→ SDK checks server echoed `appo-v1` subprotocol
                       │
                       ├─[no/wrong echo]→ status: auth_failed
                       │                   onAuthError('subprotocol_mismatch: ...')
                       │                   no reconnect
                       │
                       └─[echo ok]→ status: authenticating
                                      │
                                      └─→ client calls getToken()
                                      └─→ client sends { type: 'auth', token, shared_id, client_type }
                                             │
                                             ├─[token bad]→ server sends auth_error / close(4401)
                                             │              status: auth_failed
                                             │              onAuthError(reason) — no reconnect
                                             │
                                             └─[token ok]→ server sends auth_success
                                                           status: connected
                                                           ping interval starts
                                                           onMessage starts firing

(every ~1h Cloud Run drops the connection → ReconnectingWebSocket reconnects
 → subprotocol re-verified → getToken() called again → fresh auth handshake → connected)
```

### Keepalive

After `auth_success`, the SDK sends `{type:"ping"}` every `pingIntervalMs` (default 30s). The server is expected to reply with `{type:"pong"}` within `pongTimeoutMs` (default 10s). If a pong does not arrive in time, the SDK reports `pong_timeout` via `onAuthError` and forces a reconnect.

---

## Release process

The SDK is consumed via jsDelivr from this GitHub repo's tag refs. `dist/` is built and committed to the tagged commit by CI.

```bash
git tag v0.2.0
git push origin v0.2.0
# release.yml builds dist/, force-commits it to the tag, pushes
# Retool can immediately load https://cdn.jsdelivr.net/gh/Appo-Groep/appo-workflow-sdk@v0.2.0/dist/index.global.js
```

`dist/` is gitignored on regular commits — only the release workflow force-adds it.

---

## Message protocol

All schemas live in `src/schemas/`. `validateMessage(msg)` checks `msg.type` against the registry.

**Client → server** (the SDK sends these): `auth`, `context_update`, `context_get`, `state_set`, `state_get`, `forward`, `action`, `inject_html`, `broadcast_user`, `broadcast_global`, `ping`.

**Server → client** (the SDK receives these): `auth_success`, `auth_error`, `context_data`, `state_data`, `inject_html`, `action`, `presence_update`, `error`, `pong`, `token_expired`.

`broadcast_global` requires the authenticated user to have `role: it_admin` — enforced server-side, not by the SDK.

`inject_html` payloads are strictly schema-validated: only the SafeElement whitelist (`button | div | span | li | label | a`), `appo-*`-prefixed classes/data attributes, fixed event set (`click | change | input`). The extension's executor performs the same validation again before touching the DOM (two independent layers — see DESIGN.md §8.4).

---

## Local development

```bash
npm install
npm run build       # outputs dist/index.{js,mjs,global.js} + .d.ts
npm run dev         # watch mode
npm run typecheck
npm test            # vitest
```
