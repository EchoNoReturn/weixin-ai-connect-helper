const cache = new Map<string, string>();
const DEFAULT = "default";

export function normalizeAccountId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT;
  const cached = cache.get(trimmed);
  if (cached) return cached;
  const normalized = trimmed.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase() || DEFAULT;
  cache.set(trimmed, normalized);
  return normalized;
}

export function normalizeOptionalAccountId(value: string | undefined | null): string | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  return normalizeAccountId(trimmed);
}

export const DEFAULT_ACCOUNT_ID = DEFAULT;
