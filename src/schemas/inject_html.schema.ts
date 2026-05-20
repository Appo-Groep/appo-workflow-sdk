const safeElementSchema = {
  type: 'object',
  required: ['tag'],
  additionalProperties: false,
  properties: {
    tag: { enum: ['button', 'div', 'span', 'li', 'label', 'a'] },
    textContent: { type: 'string', maxLength: 200 },
    classes: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string', pattern: '^appo-[a-z0-9-]+$' },
    },
    dataAttributes: {
      type: 'object',
      maxProperties: 10,
      propertyNames: { pattern: '^appo-[a-z0-9-]+$' },
      additionalProperties: { type: 'string', maxLength: 200 },
    },
    children: {
      type: 'array',
      maxItems: 10,
      items: { $ref: '#/definitions/SafeElement' },
    },
  },
} as const;

const wssCommandSchema = {
  type: 'object',
  required: ['type', 'action', 'target'],
  properties: {
    type: { const: 'action' },
    action: { type: 'string', maxLength: 100 },
    target: { enum: ['retool_client', 'extension', 'broadcast'] },
    payload: { type: 'object' },
  },
} as const;

export const injectHtmlSchema = {
  type: 'object',
  required: ['type', 'payload'],
  properties: {
    type: { const: 'inject_html' },
    payload: {
      type: 'object',
      required: ['injections'],
      properties: {
        injections: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            required: ['id', 'selector', 'strategy', 'element'],
            additionalProperties: false,
            properties: {
              id: { type: 'string', pattern: '^appo-[a-z0-9-]+$' },
              selector: { type: 'string', maxLength: 500 },
              strategy: {
                enum: ['append', 'prepend', 'before', 'after', 'clone-child'],
              },
              cloneChildIndex: { type: ['integer', 'null'], minimum: 0 },
              element: { $ref: '#/definitions/SafeElement' },
              events: {
                type: 'array',
                maxItems: 5,
                items: {
                  type: 'object',
                  required: ['event', 'wssCommand'],
                  additionalProperties: false,
                  properties: {
                    event: { enum: ['click', 'change', 'input'] },
                    wssCommand: wssCommandSchema,
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  definitions: {
    SafeElement: safeElementSchema,
  },
} as const;
