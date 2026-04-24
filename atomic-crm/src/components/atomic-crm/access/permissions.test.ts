import { describe, expect, it } from "vitest";
import {
  canPermission,
  normalizeHqRole,
  normalizeWorkspaceRole,
  type ChasterAccessSnapshot,
} from "./permissions";

describe("role normalization", () => {
  it("maps legacy HQ roles to new HQ roles", () => {
    expect(normalizeHqRole("super_admin")).toBe("hq_owner");
    expect(normalizeHqRole("admin")).toBe("hq_ops_admin");
    expect(normalizeHqRole("staff")).toBe("hq_support_agent");
  });

  it("maps legacy workspace roles to new workspace roles", () => {
    expect(normalizeWorkspaceRole("super_admin")).toBe("workspace_owner");
    expect(normalizeWorkspaceRole("admin")).toBe("workspace_admin");
    expect(normalizeWorkspaceRole("member")).toBe("workspace_member");
  });
});

describe("permission boundaries", () => {
  const base: ChasterAccessSnapshot = {
    isOwnerSide: false,
    chasterTeamRole: null,
    tenantId: "tenant-1",
    tenantMemberRole: "workspace_member",
  };

  it("workspace manager cannot access HQ admin permission", () => {
    const ctx: ChasterAccessSnapshot = {
      ...base,
      tenantMemberRole: "workspace_manager",
    };
    expect(canPermission(ctx, "hq.companies.write")).toBe(false);
  });

  it("hq support role cannot perform ops admin actions", () => {
    const ctx: ChasterAccessSnapshot = {
      isOwnerSide: true,
      chasterTeamRole: "hq_support_agent",
      tenantId: null,
      tenantMemberRole: null,
    };
    expect(canPermission(ctx, "hq.companies.write")).toBe(false);
    expect(canPermission(ctx, "hq.support.cases.read")).toBe(true);
  });
});
