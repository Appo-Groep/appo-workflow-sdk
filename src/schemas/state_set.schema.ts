export const stateSetSchema = {
  type: 'object',
  required: ['type', 'key', 'value'],
  additionalProperties: false,
  properties: {
    type: { const: 'state_set' },
    key: { type: 'string', minLength: 1, maxLength: 100 },
    value: {},
  },
} as const;
