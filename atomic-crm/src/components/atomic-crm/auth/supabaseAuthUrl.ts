/**
 * Detect Supabase auth redirect fragments (success vs error) after /auth/v1/verify.
 * Tokens and errors are issued/validated server-side; this only inspects the URL for routing UX.
 */

export function getWindowAuthParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const { hash, search } = window.location;
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  if (h) return new URLSearchParams(h);
  const s = search.startsWith("?") ? search.slice(1) : search;
  if (s) return new URLSearchParams(s);
  return new URLSearchParams();
}

/** Supabase redirects failed verify (expired OTP, etc.) with error* in the hash. */
export function hasSupabaseAuthErrorInUrl(): boolean {
  const q = getWindowAuthParams();
  return Boolean(
    q.get("error") || q.get("error_code") || q.get("error_description"),
  );
}

/**
 * Success payload: tokens or PKCE code from a completed verify redirect.
 * Mutually exclusive with {@link hasSupabaseAuthErrorInUrl} in normal Supabase responses.
 */
export function hasSupabaseAuthSuccessUrlPayload(): boolean {
  if (hasSupabaseAuthErrorInUrl()) return false;
  const q = getWindowAuthParams();
  if (q.get("access_token")) return true;
  if (q.get("code")) return true;
  const t = q.get("type");
  if (t === "invite" || t === "recovery" || t === "signup") return true;
  return false;
}

/** @deprecated Use hasSupabaseAuthSuccessUrlPayload or hasSupabaseAuthErrorInUrl */
export function hasSupabaseAuthUrlPayload(): boolean {
  return hasSupabaseAuthSuccessUrlPayload() || hasSupabaseAuthErrorInUrl();
}

/** True if fragment/query string alone matches success shape (used when building URLs). */
export function hasSupabaseSuccessParamsInString(fragmentOrQuery: string): boolean {
  if (!fragmentOrQuery) return false;
  const raw = fragmentOrQuery.startsWith("?")
    ? fragmentOrQuery.slice(1)
    : fragmentOrQuery;
  const q = new URLSearchParams(raw);
  if (q.get("error") || q.get("error_code")) return false;
  if (q.get("access_token")) return true;
  if (q.get("code")) return true;
  const t = q.get("type");
  return t === "invite" || t === "recovery" || t === "signup";
}

/**
 * Build suffix for /set-password route: `#...` or `?...` (success flows only).
 */
export function getSetPasswordUrlSuffix(): string {
  if (typeof window === "undefined") return "";
  if (hasSupabaseAuthErrorInUrl()) return "";
  const { hash, search } = window.location;
  if (hash && hasSupabaseSuccessParamsInString(hash.slice(1))) {
    return hash;
  }
  if (search && hasSupabaseSuccessParamsInString(search.slice(1))) {
    return search;
  }
  return "";
}

/** JWT `sub` claim (client-side decode only for UX; not cryptographic verification). */
export function jwtSubject(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = payload.length % 4;
    if (pad) payload += "=".repeat(4 - pad);
    const json = JSON.parse(atob(payload)) as { sub?: string };
    return json.sub ?? null;
  } catch {
    return null;
  }
}
