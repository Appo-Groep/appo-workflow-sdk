export const contextUpdateSchema = {
  type: 'object',
  required: ['type', 'payload'],
  additionalProperties: false,
  properties: {
    type: { const: 'context_update' },
    payload: {
      type: 'object',
      required: ['host', 'pathname', 'platform'],
      additionalProperties: false,
      properties: {
        host: { type: 'string', maxLength: 253 },
        pathname: { type: 'string', maxLength: 2048 },
        title: { type: 'string', maxLength: 500 },
        platform: {
          enum: ['make', 'retool', 'gcp', 'github', 'notion', 'unknown'],
        },
        detectedEntityType: { type: 'string', maxLength: 100 },
        detectedEntityId: { type: 'string', maxLength: 100 },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  },
} as const;
