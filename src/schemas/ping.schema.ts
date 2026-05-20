export const pingSchema = {
  type: 'object',
  required: ['type'],
  additionalProperties: false,
  properties: {
    type: { const: 'ping' },
  },
} as const;
