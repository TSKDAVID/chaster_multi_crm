import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { useTranslate } from "ra-core";
import { Layout } from "@/components/supabase/layout";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "../providers/supabase/supabase";

/**
 * Shown when Supabase redirects with #error=… (e.g. otp_expired after an old invite link).
 */
export function AuthInviteErrorPage() {
  const translate = useTranslate();
  const location = useLocation();
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  const params = useMemo(() => {
    const fromSearch = location.search.startsWith("?")
      ? location.search.slice(1)
      : location.search;
    if (fromSearch) return new URLSearchParams(fromSearch);
    const fromHash = location.hash.startsWith("#")
      ? location.hash.slice(1)
      : location.hash;
    return new URLSearchParams(fromHash);
  }, [location.search, location.hash]);

  const errorCode = params.get("error_code") ?? "";
  const errorDescription = params.get("error_description") ?? "";

  const friendlyDescription = useMemo(() => {
    try {
      return errorDescription
        ? decodeURIComponent(errorDescription.replace(/\+/g, " "))
        : "";
    } catch {
      return errorDescription;
    }
  }, [errorDescription]);

  useEffect(() => {
    let cancelled = false;
    void getSupabaseClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setHasSession(!!data.session);
      })
      .catch(() => {
        if (!cancelled) setHasSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const body =
    errorCode === "otp_expired"
      ? translate("crm.auth.invite_error_otp_expired")
      : friendlyDescription ||
        translate("crm.auth.invite_error_generic_detail");

  return (
    <Layout>
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          {translate("crm.auth.invite_error_title")}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
        <p className="text-muted-foreground text-xs">
          {translate("crm.auth.invite_error_hint")}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          {hasSession ? (
            <Button type="button" variant="default" asChild>
              <Link to="/">{translate("crm.auth.invite_error_continue_app")}</Link>
            </Button>
          ) : null}
          <Button type="button" variant={hasSession ? "outline" : "default"} asChild>
            <Link to="/login">{translate("crm.auth.invite_error_back_login")}</Link>
          </Button>
        </div>
      </div>
    </Layout>
  );
}

export const authInviteErrorPath = "/auth/invite-error";
