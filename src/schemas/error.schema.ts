export const errorSchema = {
  type: 'object',
  required: ['type', 'reason'],
  properties: {
    type: { const: 'error' },
    reason: { type: 'string', maxLength: 200 },
    in_response_to: { type: 'string', maxLength: 100 },
    details: {},
  },
} as const;
