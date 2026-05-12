import { useGetList } from "ra-core";

import type { Contact, ContactNote } from "../types";
import { DashboardActivityLog } from "./DashboardActivityLog";
import { DashboardStepper } from "./DashboardStepper";
import { DealsChart } from "./DealsChart";
import { HotContacts } from "./HotContacts";
import { TasksList } from "./TasksList";
import { Welcome } from "./Welcome";

type DashboardProps = {
  /**
   * Limit dashboard CRM widgets to one tenant (portal preview / HQ workspace card).
   * Omit on the global HQ CRM home so owners see aggregated data where allowed.
   */
  tenantScopeId?: string;
};

export const Dashboard = ({ tenantScopeId }: DashboardProps) => {
  const tenantFilter =
    tenantScopeId != null && tenantScopeId !== ""
      ? { tenant_id: tenantScopeId }
      : {};

  const {
    data: dataContact,
    total: totalContact,
    isPending: isPendingContact,
  } = useGetList<Contact>("contacts", {
    pagination: { page: 1, perPage: 1 },
    filter: tenantFilter,
  });

  const { total: totalContactNotes, isPending: isPendingContactNotes } =
    useGetList<ContactNote>("contact_notes", {
      pagination: { page: 1, perPage: 1 },
      filter: tenantFilter,
    });

  const { total: totalDeal, isPending: isPendingDeal } = useGetList<Contact>(
    "deals",
    {
      pagination: { page: 1, perPage: 1 },
      filter: tenantFilter,
    },
  );

  const isPending = isPendingContact || isPendingContactNotes || isPendingDeal;

  if (isPending) {
    return null;
  }

  if (!totalContact) {
    return <DashboardStepper step={1} />;
  }

  if (!totalContactNotes) {
    return <DashboardStepper step={2} contactId={dataContact?.[0]?.id} />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mt-1">
      <div className="md:col-span-3">
        <div className="flex flex-col gap-4">
          {import.meta.env.VITE_IS_DEMO === "true" ? <Welcome /> : null}
          <HotContacts tenantScopeId={tenantScopeId} />
        </div>
      </div>
      <div className="md:col-span-6">
        <div className="flex flex-col gap-6">
          {totalDeal ? <DealsChart tenantScopeId={tenantScopeId} /> : null}
          <DashboardActivityLog tenantScopeId={tenantScopeId} />
        </div>
      </div>

      <div className="md:col-span-3">
        <TasksList tenantScopeId={tenantScopeId} />
      </div>
    </div>
  );
};
