export const authSchema = {
  type: 'object',
  required: ['type', 'token', 'shared_id', 'client_type'],
  additionalProperties: false,
  properties: {
    type: { const: 'auth' },
    token: { type: 'string', minLength: 1 },
    shared_id: { type: 'string', format: 'uuid' },
    client_type: { enum: ['extension', 'retool'] },
  },
} as const;
