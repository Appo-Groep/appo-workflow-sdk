import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { messageSchemas } from './schemas';

/**
 * AJV is *lazy-initialized* by design. AJV compiles each schema into JS code
 * at runtime via `new Function()`, which violates the strict CSP shipped with
 * Manifest V3 Chrome extensions (no `unsafe-eval`). Keeping the compile step
 * inside `validateMessage()` means:
 *
 *   - Importing the SDK never triggers any code generation. The module is
 *     side-effect-free; bundlers (Vite, Rollup, esbuild) tree-shake it out
 *     entirely if `validateMessage` is never called by the consumer.
 *   - Callers that do invoke `validateMessage` (e.g. the Retool app) accept
 *     the eval — Retool's CSP allows it.
 *   - The Chrome extension's content-script does its own inline validation
 *     in `injection.ts` rather than calling `validateMessage`, so it never
 *     triggers the AJV compile path and never hits CSP.
 *
 * If `validateMessage` is ever needed in a CSP-strict environment, switch
 * the SDK to AJV's standalone mode (pre-compiled validators at build time).
 */
let ajvInstance: Ajv | null = null;
const validators = new Map<string, ValidateFunction>();

function getOrCompile(type: string): ValidateFunction | null {
  const cached = validators.get(type);
  if (cached) return cached;
  const schema = messageSchemas[type];
  if (!schema) return null;

  if (!ajvInstance) {
    ajvInstance = new Ajv({ strict: false, allErrors: true });
    addFormats(ajvInstance);
  }
  const compiled = ajvInstance.compile(schema);
  validators.set(type, compiled);
  return compiled;
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

  const validator = getOrCompile(type);
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
