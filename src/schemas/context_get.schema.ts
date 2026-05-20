export const contextGetSchema = {
  type: 'object',
  required: ['type'],
  additionalProperties: false,
  properties: {
    type: { const: 'context_get' },
  },
} as const;
