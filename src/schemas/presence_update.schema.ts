export const presenceUpdateSchema = {
  type: 'object',
  required: ['type', 'payload'],
  properties: {
    type: { const: 'presence_update' },
    payload: {
      type: 'object',
      required: ['other_users', 'pathname', 'platform'],
      properties: {
        other_users: {
          type: 'array',
          items: {
            type: 'object',
            required: ['user_id', 'role'],
            properties: {
              user_id: { type: 'string', format: 'email' },
              role: { enum: ['it_member', 'it_admin'] },
            },
          },
        },
        pathname: { type: 'string', maxLength: 2048 },
        platform: {
          enum: ['make', 'retool', 'gcp', 'github', 'notion', 'unknown'],
        },
      },
    },
  },
} as const;
