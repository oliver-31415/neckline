/*
 * The small slice of JSON Schema the assistant's tools use, and a validator for it.
 * Every tool input is checked here before the tool runs, whichever provider sent it:
 * models can send malformed or truncated input, and it's untrusted either way.
 */

export type Schema =
  | { type: 'object'; properties: Record<string, Schema>; required?: string[]; description?: string }
  | { type: 'string'; enum?: string[]; pattern?: string; maxLength?: number; description?: string }
  | { type: 'integer' | 'number'; minimum?: number; maximum?: number; description?: string }
  | { type: 'boolean'; description?: string }
  | { type: 'array'; items: Schema; maxItems?: number; description?: string };

export type ObjectSchema = Extract<Schema, { type: 'object' }>;

/** Returns a list of problems; empty means valid. Unknown properties are rejected. */
export function validate(schema: Schema, value: unknown, path = 'input'): string[] {
  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path} must be an object`];
      const v = value as Record<string, unknown>;
      const errs: string[] = [];
      for (const k of schema.required ?? []) if (v[k] === undefined) errs.push(`${path}.${k} is required`);
      for (const [k, x] of Object.entries(v)) {
        const sub = schema.properties[k];
        if (!sub) errs.push(`${path}.${k} is not a known field (expected: ${Object.keys(schema.properties).join(', ') || 'none'})`);
        else if (x !== undefined && x !== null) errs.push(...validate(sub, x, `${path}.${k}`));
      }
      return errs;
    }
    case 'string':
      if (typeof value !== 'string') return [`${path} must be a string`];
      if (schema.enum && !schema.enum.includes(value)) return [`${path} must be one of: ${schema.enum.join(', ')}`];
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) return [`${path} has the wrong format`];
      if (schema.maxLength != null && value.length > schema.maxLength) return [`${path} is longer than ${schema.maxLength} characters`];
      return [];
    case 'integer':
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return [`${path} must be a number`];
      if (schema.type === 'integer' && !Number.isInteger(value)) return [`${path} must be a whole number`];
      if (schema.minimum != null && value < schema.minimum) return [`${path} must be at least ${schema.minimum}`];
      if (schema.maximum != null && value > schema.maximum) return [`${path} must be at most ${schema.maximum}`];
      return [];
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${path} must be true or false`];
    case 'array':
      if (!Array.isArray(value)) return [`${path} must be a list`];
      if (schema.maxItems != null && value.length > schema.maxItems) return [`${path} has more than ${schema.maxItems} items`];
      return value.flatMap((x, i) => validate(schema.items, x, `${path}[${i}]`));
  }
}

export const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Date as YYYY-MM-DD (local time).' } as const;
