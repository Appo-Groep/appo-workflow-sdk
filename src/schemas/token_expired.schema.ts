export const tokenExpiredSchema = {
  type: 'object',
  required: ['type'],
  properties: {
    type: { const: 'token_expired' },
    reason: { type: 'string', maxLength: 200 },
  },
} as const;
