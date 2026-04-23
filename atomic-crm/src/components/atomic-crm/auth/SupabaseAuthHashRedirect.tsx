import { useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  getWindowAuthParams,
  getSetPasswordUrlSuffix,
  hasSupabaseAuthErrorInUrl,
  hasSupabaseAuthSuccessUrlPayload,
} from "./supabaseAuthUrl";

const REDIRECT_PREFIX_PATHS = new Set(["/", "/login", "/sign-up"]);

/**
 * After Supabase /auth/v1/verify:
 * - Errors (expired link, etc.) → /auth/invite-error with the same hash so we can show copy.
 * - Success → /set-password with tokens in the hash/query.
 */
export function SupabaseAuthHashRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    const path = location.pathname === "" ? "/" : location.pathname;

    if (path === "/auth/invite-error" || path === "/set-password") return;

    if (hasSupabaseAuthErrorInUrl()) {
      const errorParams = getWindowAuthParams().toString();
      navigate(
        errorParams
          ? `/auth/invite-error?${errorParams}`
          : "/auth/invite-error",
        { replace: true },
      );
      return;
    }

    if (!REDIRECT_PREFIX_PATHS.has(path)) return;
    if (!hasSupabaseAuthSuccessUrlPayload()) return;

    const suffix = getSetPasswordUrlSuffix();
    if (!suffix) return;

    navigate(`/set-password${suffix}`, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}
