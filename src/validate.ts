import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { messageSchemas } from './schemas';

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

const validators = new Map<string, ValidateFunction>();
for (const [type, schema] of Object.entries(messageSchemas)) {
  validators.set(type, ajv.compile(schema));
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validateMessage(msg: unknown): ValidationResult {
  if (!msg || typeof msg !== 'object') {
    return { valid: false, errors: ['message is not an object'] };
  }
  const type = (msg as Record<string, unknown>).type;
  if (typeof type !== 'string') {
    return { valid: false, errors: ['message is missing string "type"'] };
  }

  const validator = validators.get(type);
  if (!validator) {
    return { valid: true };
  }

  const ok = validator(msg);
  if (ok) return { valid: true };
  return {
    valid: false,
    errors: (validator.errors ?? []).map(
      (e) => `${e.instancePath} ${e.message ?? 'invalid'}`,
    ),
  };
}
