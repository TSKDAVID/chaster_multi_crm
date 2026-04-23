import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useListContext,
  useRecordContext,
  useTranslate,
} from "ra-core";
import { Link } from "react-router";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { DeleteButton } from "@/components/admin/delete-button";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { PermissionGate } from "../access/PermissionGate";
import { TopToolbar } from "../layout/TopToolbar";
import { getSupabaseClient } from "../providers/supabase/supabase";
import type { Sale } from "../types";

type TenantRole = "super_admin" | "admin" | "member";

/** Internal CRM workspace; roles here must not be shown as “client org” super admin. */
const DEFAULT_CHASTER_SLUG = "default-chaster";

function tenantRoleRank(r: string): number {
  if (r === "super_admin") return 3;
  if (r === "admin") return 2;
  return 1;
}

function normalizeTenantRole(raw: string): TenantRole {
  if (raw === "super_admin" || raw === "admin" || raw === "member") return raw;
  return "member";
}

function mergeRole(
  map: Record<string, TenantRole>,
  uid: string,
  role: TenantRole,
) {
  const prev = map[uid];
  if (!prev || tenantRoleRank(role) > tenantRoleRank(prev)) {
    map[uid] = role;
  }
}

type HqTenantRoleMaps = {
  /** Client companies only (excludes `default-chaster`). */
  clientRoleByUserId: Record<string, TenantRole>;
  /** Same user’s role on the internal default workspace, when relevant. */
  internalRoleByUserId: Record<string, TenantRole>;
};

const emptyMaps: HqTenantRoleMaps = {
  clientRoleByUserId: {},
  internalRoleByUserId: {},
};

const HqTenantRoleMapsContext = createContext<HqTenantRoleMaps>(emptyMaps);

function SalesListRolesProvider({ children }: { children: ReactNode }) {
  const { data: records = [] } = useListContext();
  const userIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of records as Sale[]) {
      if (r.user_id) s.add(r.user_id);
    }
    return [...s];
  }, [records]);

  const sortedKey = userIds.slice().sort().join(",");

  const { data: maps = emptyMaps } = useQuery({
    queryKey: ["hq-sales-tenant-roles", "v2-client-split", sortedKey],
    queryFn: async (): Promise<HqTenantRoleMaps> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from("tenant_members").select(`
          user_id,
          role,
          tenants ( slug )
        `).in("user_id", userIds);
      if (error) throw error;

      const clientRoleByUserId: Record<string, TenantRole> = {};
      const internalRoleByUserId: Record<string, TenantRole> = {};

      for (const row of data ?? []) {
        const uid = row.user_id as string;
        const role = normalizeTenantRole(String(row.role ?? ""));
        const tenant = row.tenants as { slug?: string } | null | undefined;
        const slug = tenant?.slug ?? "";
        if (slug === DEFAULT_CHASTER_SLUG) {
          mergeRole(internalRoleByUserId, uid, role);
        } else {
          mergeRole(clientRoleByUserId, uid, role);
        }
      }

      return { clientRoleByUserId, internalRoleByUserId };
    },
    enabled: userIds.length > 0,
  });

  return (
    <HqTenantRoleMapsContext.Provider value={maps}>
      {children}
    </HqTenantRoleMapsContext.Provider>
  );
}

const SalesListActions = () => (
  <TopToolbar>
    <ExportButton />
    <CreateButton label="resources.sales.action.new" />
  </TopToolbar>
);

const filters = [<SearchInput source="q" alwaysOn />];

const OptionsField = (_props: { label?: string | boolean }) => {
  const record = useRecordContext<Sale>();
  const translate = useTranslate();
  const { clientRoleByUserId, internalRoleByUserId } = useContext(
    HqTenantRoleMapsContext,
  );
  if (!record) return null;

  const uid = record.user_id;
  const clientRole = uid ? clientRoleByUserId[uid] : undefined;
  const internalRole = uid ? internalRoleByUserId[uid] : undefined;

  return (
    <div className="flex flex-row flex-wrap gap-1">
      {record.administrator ? (
        <Badge
          variant="outline"
          className="border-blue-300 dark:border-blue-700"
        >
          {translate("resources.sales.fields.administrator")}
        </Badge>
      ) : null}

      {clientRole === "super_admin" ? (
        <Badge
          variant="outline"
          className="border-violet-400 dark:border-violet-600"
        >
          {translate("resources.sales.fields.tenant_super_admin")}
        </Badge>
      ) : null}
      {clientRole === "admin" ? (
        <Badge
          variant="outline"
          className="border-teal-400 dark:border-teal-700"
        >
          {translate("resources.sales.fields.tenant_admin")}
        </Badge>
      ) : null}
      {clientRole === "member" ? (
        <Badge variant="outline" className="text-muted-foreground">
          {translate("resources.sales.fields.tenant_member")}
        </Badge>
      ) : null}

      {!clientRole && internalRole ? (
        <>
          <Badge
            variant="outline"
            className="text-muted-foreground border-muted-foreground/35"
            title={translate("resources.sales.fields.tenant_internal_prefix")}
          >
            {translate("resources.sales.fields.tenant_internal_short")}
          </Badge>
          {internalRole === "super_admin" ? (
            <Badge
              variant="outline"
              className="border-slate-400 dark:border-slate-500"
              title={translate("resources.sales.fields.tenant_internal_prefix")}
            >
              {translate("resources.sales.fields.tenant_super_admin")}
            </Badge>
          ) : null}
          {internalRole === "admin" ? (
            <Badge
              variant="outline"
              className="border-slate-400 dark:border-slate-500"
              title={translate("resources.sales.fields.tenant_internal_prefix")}
            >
              {translate("resources.sales.fields.tenant_admin")}
            </Badge>
          ) : null}
          {internalRole === "member" ? (
            <Badge
              variant="outline"
              className="border-slate-400 dark:border-slate-500 text-muted-foreground"
              title={translate("resources.sales.fields.tenant_internal_prefix")}
            >
              {translate("resources.sales.fields.tenant_member")}
            </Badge>
          ) : null}
        </>
      ) : null}

      {record.disabled ? (
        <Badge
          variant="outline"
          className="border-orange-300 dark:border-orange-700"
        >
          {translate("resources.sales.fields.disabled")}
        </Badge>
      ) : null}
    </div>
  );
};

const SalesDeleteAction = () => (
  <PermissionGate permission="crm.users.delete">
    <DeleteButton
      resource="sales"
      size="icon"
      variant="ghost"
      className="h-8 w-8 text-destructive hover:bg-destructive/10"
      label="ra.action.delete"
      redirect={false}
      mutationMode="pessimistic"
    />
  </PermissionGate>
);

function SalesListHqIntro() {
  const translate = useTranslate();
  const { isOwnerSide } = useCurrentUserRole();
  if (!isOwnerSide) return null;
  return (
    <Alert className="mb-4 border-primary/25 bg-primary/5">
      <AlertDescription className="space-y-3 text-sm">
        <p>{translate("chaster.hq.sales_list_intro")}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link to="/hq/platform-team">
              {translate("chaster.hq.menu_platform_team")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/hq/workspace/team">
              {translate("chaster.hq.card_people_workspace_team")}
            </Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function SalesList() {
  return (
    <List
      filters={filters}
      actions={<SalesListActions />}
      sort={{ field: "first_name", order: "ASC" }}
    >
      <SalesListHqIntro />
      <SalesListRolesProvider>
        <DataTable>
          <DataTable.Col source="first_name" />
          <DataTable.Col source="last_name" />
          <DataTable.Col source="email" />
          <DataTable.Col label="resources.sales.fields.roles">
            <OptionsField />
          </DataTable.Col>
          <DataTable.Col label="resources.sales.action.delete_user">
            <SalesDeleteAction />
          </DataTable.Col>
        </DataTable>
      </SalesListRolesProvider>
    </List>
  );
}
