import { z } from "zod";
/**
 * Coerce a value that might be a JSON string into a string array.
 * LLMs sometimes pass arrays as stringified JSON (e.g. '["a","b"]' instead of ["a","b"]).
 */
export declare function coerceStringArray(): z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodArray<z.ZodString>>;
/**
 * Coerce a value that might be a numeric string into a number.
 * LLMs sometimes pass numbers as strings (e.g. "30" instead of 30).
 */
export declare function coerceNumber(): z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodNumber>;
//# sourceMappingURL=zod-coerce.d.ts.map