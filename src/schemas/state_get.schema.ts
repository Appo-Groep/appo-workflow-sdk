export const stateGetSchema = {
  type: 'object',
  required: ['type', 'key'],
  additionalProperties: false,
  properties: {
    type: { const: 'state_get' },
    key: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const;
