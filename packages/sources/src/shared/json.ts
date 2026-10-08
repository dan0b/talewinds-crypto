/**
 * Parse provider JSON without losing precision. JSON numbers above 2^53 (lamport and wei
 * balances, token supplies) would silently round in `JSON.parse`; this keeps their exact digits
 * as strings instead. Schemas for amounts therefore accept `number | string`.
 */
export function parseProviderJson(text: string): unknown {
  return JSON.parse(text, (_key, value: unknown, context?: { source?: string }) => {
    if (
      typeof value === 'number' &&
      !Number.isSafeInteger(value) &&
      context?.source !== undefined &&
      /^-?\d+$/.test(context.source)
    ) {
      return context.source;
    }
    return value;
  });
}
