export const broadcastGlobalSchema = {
  type: 'object',
  required: ['type', 'message'],
  additionalProperties: false,
  properties: {
    type: { const: 'broadcast_global' },
    message: { type: 'object' },
  },
} as const;
