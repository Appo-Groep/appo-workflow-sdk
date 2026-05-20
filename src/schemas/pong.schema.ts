export const pongSchema = {
  type: 'object',
  required: ['type'],
  additionalProperties: false,
  properties: {
    type: { const: 'pong' },
  },
} as const;
