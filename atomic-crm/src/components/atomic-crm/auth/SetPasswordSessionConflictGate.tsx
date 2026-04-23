import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useSupabaseAccessToken } from "ra-supabase-core";
import { useTranslate } from "ra-core";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/supabase/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { jwtSubject } from "./supabaseAuthUrl";

type Phase = "checking" | "conflict" | "ok";

/**
 * Invite/recovery links carry a new user's tokens while the browser may still hold
 * another session. Offer sign-out + reload so Supabase can apply the URL session.
 */
export function SetPasswordSessionConflictGate({
  children,
}: {
  children: ReactNode;
}) {
  const translate = useTranslate();
  const navigate = useNavigate();
  const access_token = useSupabaseAccessToken({ redirectTo: false });
  const refresh_token = useSupabaseAccessToken({
    parameterName: "refresh_token",
    redirectTo: false,
  });
  const [phase, setPhase] = useState<Phase>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!access_token || !refresh_token) {
        if (!cancelled) setPhase("ok");
        return;
      }
      const {
        data: { session },
      } = await getSupabaseClient().auth.getSession();
      if (!session?.user) {
        if (!cancelled) setPhase("ok");
        return;
      }
      const incomingSub = jwtSubject(access_token);
      if (!incomingSub || incomingSub === session.user.id) {
        if (!cancelled) setPhase("ok");
        return;
      }
      if (!cancelled) setPhase("conflict");
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [access_token, refresh_token]);

  const signOutAndContinue = async () => {
    setBusy(true);
    try {
      await getSupabaseClient().auth.signOut();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    const { pathname, search } = window.location;
    window.history.replaceState(null, "", `${pathname}${search}`);
    navigate("/login", { replace: true });
  };

  if (phase === "checking") {
    return (
      <Layout>
        <div className="flex flex-col items-center gap-4 py-12">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </Layout>
    );
  }

  if (phase === "conflict") {
    return (
      <Layout>
        <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            {translate("crm.auth.session_conflict_title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {translate("crm.auth.session_conflict_desc")}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              type="button"
              variant="default"
              disabled={busy}
              onClick={() => void signOutAndContinue()}
            >
              {translate("crm.auth.session_conflict_sign_out")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={cancel}
            >
              {translate("crm.auth.session_conflict_cancel")}
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return <>{children}</>;
}
