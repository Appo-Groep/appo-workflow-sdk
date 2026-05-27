/**
 * Two auth-message shapes are valid:
 *
 *   1. Token path  — `{ type:'auth', token, shared_id, client_type }`
 *      Used by the chrome extension. The WSS verifies the Google token
 *      server-side via Google's tokeninfo endpoint.
 *
 *   2. Ticket path — `{ type:'auth', ticket, shared_id, client_type, retool_user_id? }`
 *      Used by the Retool app. The ticket is a single-use HS256 JWT minted
 *      by `POST /channel-ticket` from the extension's authenticated Google
 *      token. `retool_user_id` lets the server cross-check the email via
 *      the Retool API.
 *
 * Both shapes are unioned with `oneOf`; the type-discriminant lives in
 * which credential field is present.
 */

const tokenAuthSchema = {
  type: 'object',
  required: ['type', 'token', 'shared_id', 'client_type'],
  additionalProperties: false,
  properties: {
    type: { const: 'auth' },
    token: { type: 'string', minLength: 1 },
    shared_id: { type: 'string', format: 'uuid' },
    client_type: { enum: ['extension', 'retool'] },
    client_version: { type: 'string', maxLength: 50 },
  },
} as const;

const ticketAuthSchema = {
  type: 'object',
  required: ['type', 'ticket', 'shared_id', 'client_type'],
  additionalProperties: false,
  properties: {
    type: { const: 'auth' },
    ticket: { type: 'string', minLength: 1 },
    shared_id: { type: 'string', format: 'uuid' },
    client_type: { enum: ['extension', 'retool'] },
    retool_user_id: { type: 'string', minLength: 1, maxLength: 100 },
    client_version: { type: 'string', maxLength: 50 },
  },
} as const;

export const authSchema = {
  oneOf: [tokenAuthSchema, ticketAuthSchema],
} as const;
