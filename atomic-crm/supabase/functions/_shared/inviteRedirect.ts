/**
 * `redirectTo` for `inviteUserByEmail` / password recovery (must match Supabase Auth allow list).
 *
 * Set Edge secrets:
 * - `INVITE_REDIRECT_URL` — full URL, e.g. `https://app.example.com/auth-callback.html`
 * - or `APP_SITE_URL` — origin only; we append `/auth-callback.html`
 *
 * Local dev example:
 * `npx supabase secrets set INVITE_REDIRECT_URL=http://localhost:5173/auth-callback.html`
 */
export function inviteRedirectTo(): string | undefined {
  const explicit = (Deno.env.get("INVITE_REDIRECT_URL") ?? "").trim();
  if (explicit) return explicit;
  const base = (Deno.env.get("APP_SITE_URL") ?? "").trim().replace(/\/$/, "");
  if (base) return `${base}/auth-callback.html`;
  return undefined;
}
