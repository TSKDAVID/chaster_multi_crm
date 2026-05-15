/** Radix Select requires value to match a SelectItem; never pass "" or unknown values. */
export function safeSelectValue<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}
