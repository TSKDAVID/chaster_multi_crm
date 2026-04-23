import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  canPermission,
  type ChasterAccessSnapshot,
} from "./permissions";

export type ChasterAccessContextValue = ChasterAccessSnapshot & {
  isLoading: boolean;
  refetch: () => void;
  can: (permission: string) => boolean;
};

const defaultSnapshot: ChasterAccessSnapshot = {
  isOwnerSide: false,
  chasterTeamRole: null,
  tenantId: null,
  tenantMemberRole: null,
};

const ChasterAccessContext = createContext<ChasterAccessContextValue | null>(
  null,
);

async function fetchChasterAccess(userId: string): Promise<ChasterAccessSnapshot> {
  const supabase = getSupabaseClient();

  const { data: staffRaw, error: staffErr } = await supabase.rpc(
    "is_chaster_staff",
  );
  if (staffErr) throw staffErr;
  // PostgREST usually returns a boolean; tolerate stringly JSON edge cases.
  const isStaff = staffRaw === true || staffRaw === "true";

  let chasterTeamRole: ChasterAccessSnapshot["chasterTeamRole"] = null;
  if (isStaff) {
    const { data: row } = await supabase
      .from("chaster_team")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    const rr = row?.role;
    chasterTeamRole =
      rr === "staff" || rr === "admin" || rr === "super_admin" ? rr : "staff";
  }

  const { data: tenantIdRaw, error: tidErr } =
    await supabase.rpc("get_my_tenant_id");
  if (tidErr) throw tidErr;
  const tenantId =
    typeof tenantIdRaw === "string" ? tenantIdRaw : (tenantIdRaw as string | null) ?? null;

  let tenantMemberRole: ChasterAccessSnapshot["tenantMemberRole"] = null;
  if (tenantId) {
    const { data: tm } = await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle();
    const tr = tm?.role;
    tenantMemberRole =
      tr === "member" || tr === "admin" || tr === "super_admin" ? tr : null;
  }

  return {
    isOwnerSide: isStaff,
    chasterTeamRole,
    tenantId,
    tenantMemberRole,
  };
}

export function ChasterAccessProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  /** False until first getSession / auth event — avoids treating "unknown" user as non-staff. */
  const [sessionResolved, setSessionResolved] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
      setSessionResolved(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setSessionResolved(true);
      if (!session?.user) {
        queryClient.removeQueries({ queryKey: ["chaster-access"] });
      }
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["chaster-access", userId],
    queryFn: () => fetchChasterAccess(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const snapshot = data ?? defaultSnapshot;
  const loading =
    !sessionResolved || (!!userId && isPending);

  const can = useCallback(
    (permission: string) => canPermission(snapshot, permission),
    [snapshot],
  );

  const value = useMemo<ChasterAccessContextValue>(
    () => ({
      ...snapshot,
      isLoading: loading,
      refetch: () => {
        void refetch();
      },
      can,
    }),
    [snapshot, loading, refetch, can],
  );

  if (error) {
    console.error("chaster-access", error);
  }

  return (
    <ChasterAccessContext.Provider value={value}>
      {children}
    </ChasterAccessContext.Provider>
  );
}

export function useChasterAccess(): ChasterAccessContextValue {
  const ctx = useContext(ChasterAccessContext);
  if (!ctx) {
    throw new Error("useChasterAccess must be used within ChasterAccessProvider");
  }
  return ctx;
}
