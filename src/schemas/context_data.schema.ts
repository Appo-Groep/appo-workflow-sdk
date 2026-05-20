export const contextDataSchema = {
  type: 'object',
  required: ['type', 'payload'],
  properties: {
    type: { const: 'context_data' },
    payload: {
      oneOf: [{ type: 'null' }, { type: 'object' }],
    },
  },
} as const;
