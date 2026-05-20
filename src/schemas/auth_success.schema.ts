export const authSuccessSchema = {
  type: 'object',
  required: ['type', 'user_id', 'role'],
  properties: {
    type: { const: 'auth_success' },
    user_id: { type: 'string', format: 'email' },
    role: { enum: ['it_member', 'it_admin'] },
  },
} as const;
