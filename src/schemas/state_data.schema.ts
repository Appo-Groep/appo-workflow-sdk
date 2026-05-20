export const stateDataSchema = {
  type: 'object',
  required: ['type', 'key'],
  properties: {
    type: { const: 'state_data' },
    key: { type: 'string', minLength: 1, maxLength: 100 },
    value: {},
  },
} as const;
