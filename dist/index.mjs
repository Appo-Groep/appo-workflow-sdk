// src/client.ts
import ReconnectingWebSocket from "reconnecting-websocket";

// src/auth.ts
function buildAuthMessage(args) {
  const msg = {
    type: "auth",
    token: args.token,
    shared_id: args.sharedId,
    client_type: args.clientType
  };
  if (args.clientVersion !== void 0) {
    msg.client_version = args.clientVersion;
  }
  return msg;
}

// src/client.ts
var AUTH_REJECTED_CLOSE_CODE = 4401;
var SUBPROTOCOL_MISMATCH_CLOSE_CODE = 4400;
var DEFAULT_PING_INTERVAL_MS = 3e4;
var DEFAULT_PONG_TIMEOUT_MS = 1e4;
var AppoWssClient = class {
  constructor(config) {
    this.status = "idle";
    this.authenticated = false;
    this.closedByCaller = false;
    this.pingTimer = null;
    this.pongTimer = null;
    this.config = config;
    this.protocolVersion = config.protocolVersion ?? "appo-v1";
    this.pingIntervalMs = config.keepalive?.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
    this.pongTimeoutMs = config.keepalive?.pongTimeoutMs ?? DEFAULT_PONG_TIMEOUT_MS;
    const protocols = [this.protocolVersion, `gk.${config.gateToken}`];
    const r = config.reconnect ?? {};
    const rwsOptions = {
      minReconnectionDelay: r.minDelayMs ?? 1e3,
      maxReconnectionDelay: r.maxDelayMs ?? 3e4,
      reconnectionDelayGrowFactor: r.growFactor ?? 1.5,
      maxRetries: r.maxRetries ?? Infinity
    };
    if (config.webSocketCtor) {
      rwsOptions.WebSocket = config.webSocketCtor;
    }
    this.rws = new ReconnectingWebSocket(config.url, protocols, rwsOptions);
    this.rws.addEventListener("open", () => {
      void this.onOpen();
    });
    this.rws.addEventListener("message", (event) => this.onRawMessage(event));
    this.rws.addEventListener("close", (event) => this.onClose(event));
    this.rws.addEventListener("error", () => {
      if (!this.closedByCaller) this.setStatus("reconnecting");
    });
    this.setStatus("connecting");
  }
  send(message) {
    if (!this.authenticated) return false;
    this.rws.send(JSON.stringify(message));
    return true;
  }
  close() {
    this.closedByCaller = true;
    this.authenticated = false;
    this.stopKeepalive();
    this.rws.close();
    this.setStatus("disconnected");
  }
  getStatus() {
    return this.status;
  }
  isAuthenticated() {
    return this.authenticated;
  }
  setStatus(next) {
    if (this.status === next) return;
    this.status = next;
    this.config.onStatusChange?.(next);
  }
  async onOpen() {
    this.authenticated = false;
    this.stopKeepalive();
    if (this.rws.protocol !== this.protocolVersion) {
      this.fail(
        "subprotocol_mismatch",
        SUBPROTOCOL_MISMATCH_CLOSE_CODE,
        `expected ${this.protocolVersion}, got ${this.rws.protocol || "(none)"}`
      );
      return;
    }
    this.setStatus("authenticating");
    try {
      const token = await this.config.getToken();
      const authMsg = buildAuthMessage({
        token,
        sharedId: this.config.sharedId,
        clientType: this.config.clientType,
        clientVersion: this.config.clientVersion
      });
      this.rws.send(JSON.stringify(authMsg));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "getToken_failed";
      this.fail("getToken_failed", AUTH_REJECTED_CLOSE_CODE, reason);
    }
  }
  onRawMessage(event) {
    const raw = typeof event.data === "string" ? event.data : null;
    if (raw === null) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "auth_success") {
      this.authenticated = true;
      this.setStatus("connected");
      this.startKeepalive();
      return;
    }
    if (msg.type === "auth_error") {
      const reason = typeof msg.reason === "string" ? msg.reason : "auth_error";
      this.fail(reason, AUTH_REJECTED_CLOSE_CODE);
      return;
    }
    if (msg.type === "pong") {
      this.clearPongTimer();
      return;
    }
    if (this.authenticated) {
      this.config.onMessage?.(msg);
    }
  }
  onClose(event) {
    this.authenticated = false;
    this.stopKeepalive();
    if (event.code === AUTH_REJECTED_CLOSE_CODE) {
      this.setStatus("auth_failed");
      this.config.onAuthError?.("rejected_by_server");
      this.closedByCaller = true;
      this.rws.close();
      return;
    }
    if (this.closedByCaller) {
      this.setStatus("disconnected");
      return;
    }
    this.setStatus("reconnecting");
  }
  startKeepalive() {
    if (this.pingIntervalMs <= 0) return;
    this.stopKeepalive();
    this.pingTimer = setInterval(() => this.sendPing(), this.pingIntervalMs);
  }
  stopKeepalive() {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.clearPongTimer();
  }
  clearPongTimer() {
    if (this.pongTimer !== null) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }
  sendPing() {
    if (!this.authenticated) return;
    this.rws.send(JSON.stringify({ type: "ping" }));
    this.clearPongTimer();
    this.pongTimer = setTimeout(() => {
      this.config.onAuthError?.("pong_timeout");
      this.rws.reconnect();
    }, this.pongTimeoutMs);
  }
  /** Permanent failure: notify caller, stop reconnect, close socket. */
  fail(reason, _closeCode, detail) {
    this.authenticated = false;
    this.stopKeepalive();
    this.setStatus("auth_failed");
    this.config.onAuthError?.(detail ? `${reason}: ${detail}` : reason);
    this.closedByCaller = true;
    this.rws.close();
  }
};

// src/validate.ts
import Ajv from "ajv";
import addFormats from "ajv-formats";

// src/schemas/auth.schema.ts
var authSchema = {
  type: "object",
  required: ["type", "token", "shared_id", "client_type"],
  additionalProperties: false,
  properties: {
    type: { const: "auth" },
    token: { type: "string", minLength: 1 },
    shared_id: { type: "string", format: "uuid" },
    client_type: { enum: ["extension", "retool"] },
    client_version: { type: "string", maxLength: 50 }
  }
};

// src/schemas/auth_error.schema.ts
var authErrorSchema = {
  type: "object",
  required: ["type", "reason"],
  properties: {
    type: { const: "auth_error" },
    reason: { type: "string", maxLength: 200 }
  }
};

// src/schemas/auth_success.schema.ts
var authSuccessSchema = {
  type: "object",
  required: ["type", "user_id", "role"],
  properties: {
    type: { const: "auth_success" },
    user_id: { type: "string", format: "email" },
    role: { enum: ["it_member", "it_admin"] }
  }
};

// src/schemas/action.schema.ts
var actionSchema = {
  type: "object",
  required: ["type", "action", "target"],
  properties: {
    type: { const: "action" },
    action: { type: "string", minLength: 1, maxLength: 100 },
    target: { enum: ["retool_client", "extension", "broadcast"] },
    payload: { type: "object" }
  }
};

// src/schemas/broadcast_global.schema.ts
var broadcastGlobalSchema = {
  type: "object",
  required: ["type", "message"],
  additionalProperties: false,
  properties: {
    type: { const: "broadcast_global" },
    message: { type: "object" }
  }
};

// src/schemas/broadcast_user.schema.ts
var broadcastUserSchema = {
  type: "object",
  required: ["type", "user_id", "message"],
  additionalProperties: false,
  properties: {
    type: { const: "broadcast_user" },
    user_id: { type: "string", format: "email" },
    message: { type: "object" }
  }
};

// src/schemas/context_data.schema.ts
var contextDataSchema = {
  type: "object",
  required: ["type", "payload"],
  properties: {
    type: { const: "context_data" },
    payload: {
      oneOf: [{ type: "null" }, { type: "object" }]
    }
  }
};

// src/schemas/context_get.schema.ts
var contextGetSchema = {
  type: "object",
  required: ["type"],
  additionalProperties: false,
  properties: {
    type: { const: "context_get" }
  }
};

// src/schemas/context_update.schema.ts
var contextUpdateSchema = {
  type: "object",
  required: ["type", "payload"],
  additionalProperties: false,
  properties: {
    type: { const: "context_update" },
    payload: {
      type: "object",
      required: ["host", "pathname", "platform"],
      additionalProperties: false,
      properties: {
        host: { type: "string", maxLength: 253 },
        pathname: { type: "string", maxLength: 2048 },
        title: { type: "string", maxLength: 500 },
        platform: {
          enum: ["make", "retool", "gcp", "github", "notion", "unknown"]
        },
        detectedEntityType: { type: "string", maxLength: 100 },
        detectedEntityId: { type: "string", maxLength: 100 },
        timestamp: { type: "string", format: "date-time" }
      }
    }
  }
};

// src/schemas/error.schema.ts
var errorSchema = {
  type: "object",
  required: ["type", "reason"],
  properties: {
    type: { const: "error" },
    reason: { type: "string", maxLength: 200 },
    in_response_to: { type: "string", maxLength: 100 },
    details: {}
  }
};

// src/schemas/forward.schema.ts
var forwardSchema = {
  type: "object",
  required: ["type", "target", "message"],
  additionalProperties: false,
  properties: {
    type: { const: "forward" },
    target: { enum: ["extension", "retool"] },
    message: { type: "object" }
  }
};

// src/schemas/inject_html.schema.ts
var safeElementSchema = {
  type: "object",
  required: ["tag"],
  additionalProperties: false,
  properties: {
    tag: { enum: ["button", "div", "span", "li", "label", "a"] },
    textContent: { type: "string", maxLength: 200 },
    classes: {
      type: "array",
      maxItems: 10,
      items: { type: "string", pattern: "^appo-[a-z0-9-]+$" }
    },
    dataAttributes: {
      type: "object",
      maxProperties: 10,
      propertyNames: { pattern: "^appo-[a-z0-9-]+$" },
      additionalProperties: { type: "string", maxLength: 200 }
    },
    children: {
      type: "array",
      maxItems: 10,
      items: { $ref: "#/definitions/SafeElement" }
    }
  }
};
var wssCommandSchema = {
  type: "object",
  required: ["type", "action", "target"],
  properties: {
    type: { const: "action" },
    action: { type: "string", maxLength: 100 },
    target: { enum: ["retool_client", "extension", "broadcast"] },
    payload: { type: "object" }
  }
};
var injectHtmlSchema = {
  type: "object",
  required: ["type", "payload"],
  properties: {
    type: { const: "inject_html" },
    payload: {
      type: "object",
      required: ["injections"],
      properties: {
        injections: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            required: ["id", "selector", "strategy", "element"],
            additionalProperties: false,
            properties: {
              id: { type: "string", pattern: "^appo-[a-z0-9-]+$" },
              selector: { type: "string", maxLength: 500 },
              strategy: {
                enum: ["append", "prepend", "before", "after", "clone-child"]
              },
              cloneChildIndex: { type: ["integer", "null"], minimum: 0 },
              element: { $ref: "#/definitions/SafeElement" },
              events: {
                type: "array",
                maxItems: 5,
                items: {
                  type: "object",
                  required: ["event", "wssCommand"],
                  additionalProperties: false,
                  properties: {
                    event: { enum: ["click", "change", "input"] },
                    wssCommand: wssCommandSchema
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  definitions: {
    SafeElement: safeElementSchema
  }
};

// src/schemas/ping.schema.ts
var pingSchema = {
  type: "object",
  required: ["type"],
  additionalProperties: false,
  properties: {
    type: { const: "ping" }
  }
};

// src/schemas/pong.schema.ts
var pongSchema = {
  type: "object",
  required: ["type"],
  additionalProperties: false,
  properties: {
    type: { const: "pong" }
  }
};

// src/schemas/presence_update.schema.ts
var presenceUpdateSchema = {
  type: "object",
  required: ["type", "payload"],
  properties: {
    type: { const: "presence_update" },
    payload: {
      type: "object",
      required: ["other_users", "pathname", "platform"],
      properties: {
        other_users: {
          type: "array",
          items: {
            type: "object",
            required: ["user_id", "role"],
            properties: {
              user_id: { type: "string", format: "email" },
              role: { enum: ["it_member", "it_admin"] }
            }
          }
        },
        pathname: { type: "string", maxLength: 2048 },
        platform: {
          enum: ["make", "retool", "gcp", "github", "notion", "unknown"]
        }
      }
    }
  }
};

// src/schemas/state_data.schema.ts
var stateDataSchema = {
  type: "object",
  required: ["type", "key"],
  properties: {
    type: { const: "state_data" },
    key: { type: "string", minLength: 1, maxLength: 100 },
    value: {}
  }
};

// src/schemas/state_get.schema.ts
var stateGetSchema = {
  type: "object",
  required: ["type", "key"],
  additionalProperties: false,
  properties: {
    type: { const: "state_get" },
    key: { type: "string", minLength: 1, maxLength: 100 }
  }
};

// src/schemas/state_set.schema.ts
var stateSetSchema = {
  type: "object",
  required: ["type", "key", "value"],
  additionalProperties: false,
  properties: {
    type: { const: "state_set" },
    key: { type: "string", minLength: 1, maxLength: 100 },
    value: {}
  }
};

// src/schemas/token_expired.schema.ts
var tokenExpiredSchema = {
  type: "object",
  required: ["type"],
  properties: {
    type: { const: "token_expired" },
    reason: { type: "string", maxLength: 200 }
  }
};

// src/schemas/index.ts
var messageSchemas = {
  // client → server
  auth: authSchema,
  context_update: contextUpdateSchema,
  context_get: contextGetSchema,
  state_set: stateSetSchema,
  state_get: stateGetSchema,
  forward: forwardSchema,
  action: actionSchema,
  inject_html: injectHtmlSchema,
  broadcast_user: broadcastUserSchema,
  broadcast_global: broadcastGlobalSchema,
  ping: pingSchema,
  // server → client
  auth_success: authSuccessSchema,
  auth_error: authErrorSchema,
  context_data: contextDataSchema,
  state_data: stateDataSchema,
  presence_update: presenceUpdateSchema,
  error: errorSchema,
  pong: pongSchema,
  token_expired: tokenExpiredSchema
};

// src/validate.ts
var ajvInstance = null;
var validators = /* @__PURE__ */ new Map();
function getOrCompile(type) {
  const cached = validators.get(type);
  if (cached) return cached;
  const schema = messageSchemas[type];
  if (!schema) return null;
  if (!ajvInstance) {
    ajvInstance = new Ajv({ strict: false, allErrors: true });
    addFormats(ajvInstance);
  }
  const compiled = ajvInstance.compile(schema);
  validators.set(type, compiled);
  return compiled;
}
function validateMessage(msg) {
  if (!msg || typeof msg !== "object") {
    return { valid: false, errors: ["message is not an object"] };
  }
  const type = msg.type;
  if (typeof type !== "string") {
    return { valid: false, errors: ['message is missing string "type"'] };
  }
  const validator = getOrCompile(type);
  if (!validator) {
    return { valid: true };
  }
  const ok = validator(msg);
  if (ok) return { valid: true };
  return {
    valid: false,
    errors: (validator.errors ?? []).map(
      (e) => `${e.instancePath} ${e.message ?? "invalid"}`
    )
  };
}
export {
  AppoWssClient,
  validateMessage
};
//# sourceMappingURL=index.mjs.map