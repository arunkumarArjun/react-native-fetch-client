import { describe, it, expect, vi } from 'vitest';
import {
  validateData,
  createClient,
  ValidationError,
  isValidationError,
  type StandardSchemaV1,
  type ZodLikeSchema,
} from '../src/index.js';

describe('Schema Validation (Duck-Typing & Standard Schema)', () => {
  it('validates and returns data with Standard Schema v1 (~standard)', async () => {
    const mockStandardSchema: StandardSchemaV1<{ id: number; name: string }> = {
      '~standard': {
        version: 1,
        vendor: 'custom-valibot',
        validate: (input: unknown) => {
          const obj = input as Record<string, unknown>;
          if (typeof obj?.id === 'number' && typeof obj?.name === 'string') {
            return { value: { id: obj.id, name: obj.name } };
          }
          return { issues: [{ message: 'Expected object with id number and name string' }] };
        },
      },
    };

    const validData = { id: 10, name: 'Alice' };
    const res = await validateData(mockStandardSchema, validData);
    expect(res).toEqual({ id: 10, name: 'Alice' });

    // Invalid data throws ValidationError
    const invalidData = { id: 'not-a-number', name: 123 };
    await expect(validateData(mockStandardSchema, invalidData)).rejects.toThrow(ValidationError);

    try {
      await validateData(mockStandardSchema, invalidData);
    } catch (err) {
      expect(isValidationError(err)).toBe(true);
      if (isValidationError(err)) {
        expect(err.code).toBe('VALIDATION_ERROR');
        expect(err.data).toEqual(invalidData);
        expect(err.issues).toBeDefined();
      }
    }
  });

  it('validates with Zod-like .parse() method', async () => {
    const mockZodSchema: ZodLikeSchema<{ count: number }> = {
      parse: (val: unknown) => {
        const obj = val as { count?: unknown };
        if (typeof obj?.count !== 'number') {
          const err = new Error('Invalid count');
          (err as unknown as { issues: unknown }).issues = [{ message: 'Expected number' }];
          throw err;
        }

        return { count: obj.count };
      },
    };

    const valid = await validateData(mockZodSchema, { count: 42 });
    expect(valid).toEqual({ count: 42 });

    await expect(validateData(mockZodSchema, { count: 'abc' })).rejects.toThrow(ValidationError);
  });

  it('validates with Zod-like .safeParse() method', async () => {
    const mockSafeParseSchema: ZodLikeSchema<{ status: string }> = {
      safeParse: (val: unknown) => {
        const obj = val as { status?: unknown };
        if (typeof obj?.status === 'string') {
          return { success: true, data: { status: obj.status } };
        }
        return {
          success: false,
          error: {
            message: 'Invalid status',
            issues: [{ message: 'Expected string status' }],
          },
        };
      },
    };

    const valid = await validateData(mockSafeParseSchema, { status: 'active' });
    expect(valid).toEqual({ status: 'active' });

    await expect(validateData(mockSafeParseSchema, { status: 123 })).rejects.toThrow(
      ValidationError,
    );
  });

  it('validates with a functional validator', async () => {
    const validatorFn = (data: unknown): { email: string } => {
      const obj = data as { email?: string };
      if (!obj?.email?.includes('@')) {
        throw new Error('Invalid email address');
      }
      return { email: obj.email };
    };

    const valid = await validateData(validatorFn, { email: 'team@example.com' });
    expect(valid).toEqual({ email: 'team@example.com' });

    await expect(validateData(validatorFn, { email: 'invalid-email' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('integrates seamlessly with client.get() and schema config option', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1, role: 'admin' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = createClient({ fetchImpl: mockFetch });

    const roleValidator = (data: unknown) => {
      const obj = data as { role?: string; id?: number };
      if (obj.role !== 'admin') {
        throw new Error('Only admins allowed');
      }
      return { id: obj.id, role: obj.role as 'admin' };
    };

    const res = await client.get<{ id: number; role: 'admin' }>('https://api.test/profile', {
      schema: roleValidator,
    });

    expect(res.data).toEqual({ id: 1, role: 'admin' });
  });
});
