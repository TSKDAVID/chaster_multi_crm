import type { ReactNode } from "react";
import { useTranslate } from "ra-core";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { SupportCaseSortDir, SupportCaseSortField } from "../lib/sortSupportCases";

export function HqSupportFilterSheet({
  open,
  onOpenChange,
  statusFilter,
  onStatusFilter,
  tenantFilter,
  onTenantFilter,
  assigneeFilter,
  onAssigneeFilter,
  priorityFilter,
  onPriorityFilter,
  sortField,
  sortDir,
  onSortChange,
  assigneeOptions,
  tenantOptions,
  sortLabel,
  activeFilterCount,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  tenantFilter: string;
  onTenantFilter: (v: string) => void;
  assigneeFilter: string;
  onAssigneeFilter: (v: string) => void;
  priorityFilter: string;
  onPriorityFilter: (v: string) => void;
  sortField: SupportCaseSortField;
  sortDir: SupportCaseSortDir;
  onSortChange: (field: SupportCaseSortField, dir: SupportCaseSortDir) => void;
  assigneeOptions: { id: string; label: string }[];
  tenantOptions: { id: string; label: string }[];
  sortLabel: (field: SupportCaseSortField) => string;
  activeFilterCount: number;
  onClear: () => void;
}) {
  const translate = useTranslate();

  const sortFields: SupportCaseSortField[] = [
    "updated_at",
    "created_at",
    "case_number",
    "subject",
    "tenant",
    "priority",
    "status",
    "assigned",
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {translate("chaster.hq.support.filters")}
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{translate("chaster.hq.support.filters_title")}</SheetTitle>
          <SheetDescription>
            {translate("chaster.hq.support.filters_desc")}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <FilterField label={translate("chaster.hq.support.filter_status")}>
            <Select value={statusFilter} onValueChange={onStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{translate("chaster.hq.support.filter_all")}</SelectItem>
                <SelectItem value="open">{translate("chaster.portal.support.case_open")}</SelectItem>
                <SelectItem value="in_progress">
                  {translate("chaster.portal.support.case_in_progress")}
                </SelectItem>
                <SelectItem value="pending_client">
                  {translate("chaster.portal.support.case_pending_client")}
                </SelectItem>
                <SelectItem value="resolved">
                  {translate("chaster.portal.support.case_resolved")}
                </SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={translate("chaster.hq.support.filter_priority")}>
            <Select value={priorityFilter} onValueChange={onPriorityFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{translate("chaster.hq.support.filter_all")}</SelectItem>
                <SelectItem value="low">{translate("chaster.hq.support.priority_low")}</SelectItem>
                <SelectItem value="medium">
                  {translate("chaster.hq.support.priority_medium")}
                </SelectItem>
                <SelectItem value="high">{translate("chaster.hq.support.priority_high")}</SelectItem>
                <SelectItem value="urgent">
                  {translate("chaster.hq.support.priority_urgent")}
                </SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={translate("chaster.hq.support.filter_tenant")}>
            <Select value={tenantFilter} onValueChange={onTenantFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {translate("chaster.hq.support.filter_tenant_all")}
                </SelectItem>
                <SelectItem value="__prospect__">
                  {translate("chaster.hq.support.filter_tenant_prospects")}
                </SelectItem>
                {tenantOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={translate("chaster.hq.support.filter_assignee")}>
            <Select value={assigneeFilter} onValueChange={onAssigneeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assigneeOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={translate("chaster.hq.support.sort_label")}>
            <Select
              value={`${sortField}:${sortDir}`}
              onValueChange={(v) => {
                const [field, dir] = v.split(":") as [SupportCaseSortField, SupportCaseSortDir];
                onSortChange(field, dir);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortFields.flatMap((field) =>
                  (["asc", "desc"] as SupportCaseSortDir[]).map((dir) => (
                    <SelectItem key={`${field}:${dir}`} value={`${field}:${dir}`}>
                      {sortLabel(field)} (
                      {dir === "asc"
                        ? translate("chaster.hq.support.sort_asc_short")
                        : translate("chaster.hq.support.sort_desc_short")}
                      )
                    </SelectItem>
                  )),
                )}
              </SelectContent>
            </Select>
          </FilterField>
          {activeFilterCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              {translate("chaster.hq.support.clear_filters")}
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
