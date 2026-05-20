export const actionSchema = {
  type: 'object',
  required: ['type', 'action', 'target'],
  properties: {
    type: { const: 'action' },
    action: { type: 'string', minLength: 1, maxLength: 100 },
    target: { enum: ['retool_client', 'extension', 'broadcast'] },
    payload: { type: 'object' },
  },
} as const;
