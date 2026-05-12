import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "ra-core";
import { useWatch } from "react-hook-form";
import { SelectInput } from "@/components/admin/select-input";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Radix Select forbids `SelectItem value=""`; use this for "none" rows in choice lists. */
export const CHASTER_SELECT_NONE = "__chaster_select_none__";

/**
 * Optional HQ-only fields on user create: client tenant invite and/or platform team role.
 */
export function SalesProvisioningInputs() {
  const translate = useTranslate();
  const { isOwnerSide, can } = useCurrentUserRole();
  const tenantId = useWatch({ name: "tenant_id" }) as string | undefined;
  const hasTenant = Boolean(
    tenantId &&
      String(tenantId).trim() !== "" &&
      tenantId !== CHASTER_SELECT_NONE,
  );
  const tenantsQuery = useQuery({
    queryKey: ["hq-tenant-choices-for-sales-create"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("tenants")
        .select("id, company_name, slug")
        .order("company_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; company_name: string | null; slug: string | null }[];
    },
    enabled: isOwnerSide,
  });

  const tenantChoices = useMemo(() => {
    const rows = tenantsQuery.data ?? [];
    return [
      { id: CHASTER_SELECT_NONE, name: translate("chaster.sales.create.tenant_none") },
      ...rows.map((t) => ({
        id: t.id,
        name: `${t.company_name ?? t.slug ?? t.id}${t.slug ? ` (${t.slug})` : ""}`,
      })),
    ];
  }, [tenantsQuery.data, translate]);

  const memberRoleChoices = useMemo(
    () => [
      { id: "workspace_member", name: translate("chaster.sales.create.role_workspace_member") },
      { id: "workspace_viewer", name: translate("chaster.sales.create.role_workspace_viewer") },
      { id: "workspace_manager", name: translate("chaster.sales.create.role_workspace_manager") },
      { id: "workspace_admin", name: translate("chaster.sales.create.role_workspace_admin") },
      { id: "workspace_owner", name: translate("chaster.sales.create.role_workspace_owner") },
    ],
    [translate],
  );

  const hqRoleChoices = useMemo(
    () => [
      { id: CHASTER_SELECT_NONE, name: translate("chaster.sales.create.hq_role_none") },
      { id: "hq_support_agent", name: translate("chaster.hq.platform_team_role_staff") },
      { id: "hq_support_lead", name: translate("chaster.sales.create.hq_support_lead") },
      { id: "hq_ops_admin", name: translate("chaster.hq.platform_team_role_admin") },
      { id: "hq_developer", name: translate("chaster.sales.create.hq_developer") },
      { id: "hq_analyst", name: translate("chaster.sales.create.hq_analyst") },
      { id: "hq_owner", name: translate("chaster.hq.platform_team_role_super_admin") },
    ],
    [translate],
  );

  if (!isOwnerSide) return null;

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {translate("chaster.sales.create.provision_title")}
        </CardTitle>
        <CardDescription>{translate("chaster.sales.create.provision_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {can("hq.team.manage") ? (
          <SelectInput
            source="chaster_team_role"
            label={translate("chaster.sales.create.hq_role_label")}
            choices={hqRoleChoices}
            helperText={false}
          />
        ) : null}
        <SelectInput
          source="tenant_id"
          label={translate("chaster.sales.create.client_tenant_label")}
          choices={tenantChoices}
          disabled={tenantsQuery.isPending}
          helperText={false}
        />
        <SelectInput
          source="tenant_member_role"
          label={translate("chaster.sales.create.client_role_label")}
          choices={memberRoleChoices}
          disabled={!hasTenant}
          helperText={false}
        />
      </CardContent>
    </Card>
  );
}

