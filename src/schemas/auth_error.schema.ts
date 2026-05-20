export const authErrorSchema = {
  type: 'object',
  required: ['type', 'reason'],
  properties: {
    type: { const: 'auth_error' },
    reason: { type: 'string', maxLength: 200 },
  },
} as const;
