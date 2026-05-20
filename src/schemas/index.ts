import { authSchema } from './auth.schema';
import { contextUpdateSchema } from './context_update.schema';

export const messageSchemas: Record<string, object> = {
  auth: authSchema,
  context_update: contextUpdateSchema,
};

export { authSchema, contextUpdateSchema };
