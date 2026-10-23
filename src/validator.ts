/**
 * Zero-dependency Duck-Typing Schema Validation.
 *
 * Supports:
 * 1. Standard Schema v1 (`~standard`) — supported by Zod 3.24+, Valibot, ArkType
 * 2. Zod-like schemas (`.parse()` or `.safeParse()`)
 * 3. Plain synchronous or asynchronous functions `(data: unknown) => T`
 *
 * Keeps `react-native-fetch-client` runtime dependencies strictly at zero (`dependencies: {}`)
 * while providing compile-time type inference and runtime validation.
 *
 * @module validator
 */

import { ValidationError } from './errors.js';
import type { ResolvedRequestConfig, SchemaValidator } from './types.js';

function buildValidationOptions(
  data: unknown,
  config?: ResolvedRequestConfig,
  issues?: unknown,
  cause?: unknown,
) {
  const opts: {
    data?: unknown;
    issues?: unknown;
    config?: ResolvedRequestConfig;
    cause?: unknown;
  } = { data };

  if (config !== undefined) opts.config = config;
  if (issues !== undefined) opts.issues = issues;
  if (cause !== undefined) opts.cause = cause;
  return opts;
}

/**
 * Validates parsed HTTP response data against an arbitrary schema validator.
 *
 * @template T The validated data type.
 * @param schema The schema validator to execute (Standard Schema, Zod-like, or function).
 * @param data The raw parsed response data to validate.
 * @param config Optional resolved request configuration for error context.
 * @returns A promise resolving to the validated (and potentially transformed) data of type `T`.
 * @throws {ValidationError} When the data does not conform to the schema.
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * const UserSchema = z.object({ id: z.number(), name: z.string() });
 * const user = await validateData(UserSchema, { id: 1, name: 'Alice' });
 * ```
 */
export async function validateData<T>(
  schema: SchemaValidator<T> | undefined,
  data: unknown,
  config?: ResolvedRequestConfig,
): Promise<T> {
  if (!schema) {
    return data as T;
  }

  // 1. Standard Schema v1 specification (~standard property)
  if (
    typeof schema === 'object' &&
    schema !== null &&
    '~standard' in schema &&
    typeof schema['~standard']?.validate === 'function'
  ) {
    try {
      const standard = schema['~standard'];
      const result = await standard.validate(data);

      if ('issues' in result && result.issues && result.issues.length > 0) {
        const firstIssue = result.issues[0];
        const message = firstIssue?.message
          ? `Schema validation failed: ${firstIssue.message}`
          : 'Schema validation failed';

        throw new ValidationError(message, buildValidationOptions(data, config, result.issues));
      }

      if ('value' in result) {
        return result.value;
      }
    } catch (err: unknown) {
      if (err instanceof ValidationError) throw err;
      const msg = err instanceof Error ? err.message : 'Schema validation failed';
      throw new ValidationError(msg, buildValidationOptions(data, config, undefined, err));
    }
  }

  // 2. Zod-like schema with .safeParse() or .safeParseAsync()
  if (
    typeof schema === 'object' &&
    schema !== null &&
    (('safeParseAsync' in schema && typeof schema.safeParseAsync === 'function') ||
      ('safeParse' in schema && typeof schema.safeParse === 'function'))
  ) {
    try {
      const res =
        typeof schema.safeParseAsync === 'function'
          ? await schema.safeParseAsync(data)
          : typeof schema.safeParse === 'function'
            ? schema.safeParse(data)
            : { success: true as const, data: data as T };
      if (!res.success) {
        const issues = res.error && 'issues' in res.error ? res.error.issues : undefined;
        throw new ValidationError(
          res.error?.message ?? 'Schema validation failed',
          buildValidationOptions(data, config, issues, res.error),
        );
      }
      return res.data;
    } catch (err: unknown) {
      if (err instanceof ValidationError) throw err;
      const msg = err instanceof Error ? err.message : 'Schema validation failed';
      throw new ValidationError(msg, buildValidationOptions(data, config, undefined, err));
    }
  }

  // 3. Zod-like schema with .parse() or .parseAsync()
  if (
    typeof schema === 'object' &&
    schema !== null &&
    (('parseAsync' in schema && typeof schema.parseAsync === 'function') ||
      ('parse' in schema && typeof schema.parse === 'function'))
  ) {
    try {
      if (typeof schema.parseAsync === 'function') {
        return await schema.parseAsync(data);
      }
      if (typeof schema.parse === 'function') {
        return schema.parse(data);
      }
      return data as T;
    } catch (err: unknown) {
      const issues =
        err !== null && typeof err === 'object' && 'issues' in err ? err.issues : undefined;

      const msg = err instanceof Error ? err.message : 'Schema validation failed';
      throw new ValidationError(msg, buildValidationOptions(data, config, issues, err));
    }
  }

  // 4. Functional validator: (data: unknown) => T | Promise<T>
  if (typeof schema === 'function') {
    try {
      return await schema(data);
    } catch (err: unknown) {
      if (err instanceof ValidationError) throw err;
      const msg = err instanceof Error ? err.message : 'Schema validation failed';
      throw new ValidationError(msg, buildValidationOptions(data, config, undefined, err));
    }
  }

  return data as T;
}
