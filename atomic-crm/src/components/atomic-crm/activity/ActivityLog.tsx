import { InfiniteListBase } from "ra-core";
import type { Identifier } from "ra-core";

import { ActivityLogContext } from "./ActivityLogContext";
import { ActivityLogIterator } from "./ActivityLogIterator";

type ActivityLogProps = {
  companyId?: Identifier;
  /** When set, only activity for this tenant (matches activity_log.tenant_id). */
  tenantId?: string;
  pageSize?: number;
  context?: "company" | "contact" | "deal" | "all";
};

export function ActivityLog({
  companyId,
  tenantId,
  pageSize = 20,
  context = "all",
}: ActivityLogProps) {
  const filter = {
    ...(companyId ? { company_id: companyId } : {}),
    ...(tenantId ? { tenant_id: tenantId } : {}),
  };
  return (
    <ActivityLogContext.Provider value={context}>
      <InfiniteListBase
        resource="activity_log"
        filter={filter}
        sort={{ field: "date", order: "DESC" }}
        perPage={pageSize}
        disableSyncWithLocation
      >
        <ActivityLogIterator />
      </InfiniteListBase>
    </ActivityLogContext.Provider>
  );
}
