export const broadcastUserSchema = {
  type: 'object',
  required: ['type', 'user_id', 'message'],
  additionalProperties: false,
  properties: {
    type: { const: 'broadcast_user' },
    user_id: { type: 'string', format: 'email' },
    message: { type: 'object' },
  },
} as const;
