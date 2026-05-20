export const forwardSchema = {
  type: 'object',
  required: ['type', 'target', 'message'],
  additionalProperties: false,
  properties: {
    type: { const: 'forward' },
    target: { enum: ['extension', 'retool'] },
    message: { type: 'object' },
  },
} as const;
