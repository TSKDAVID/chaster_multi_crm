import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate } from "ra-core";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SlaPolicyRow } from "@/modules/support/supportTypes";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "billing",
  "technical",
  "account",
  "ai_kb",
  "widget",
  "other",
] as const;

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hrs = Math.round(minutes / 60);
    return hrs === 1 ? "1 hr" : `${hrs} hrs`;
  }
  const days = Math.round(minutes / 1440);
  return days === 1 ? "1 day" : `${days} days`;
}

function priorityVariant(
  priority: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (priority) {
    case "urgent":
      return "destructive";
    case "high":
      return "default";
    case "medium":
      return "secondary";
    default:
      return "outline";
  }
}

type FormState = {
  tenant_id: string;
  category: string;
  priority: string;
  first_response_minutes: string;
  resolution_minutes: string;
  escalation_1_after_minutes: string;
  escalation_2_after_minutes: string;
};

const emptyForm: FormState = {
  tenant_id: "",
  category: "technical",
  priority: "medium",
  first_response_minutes: "",
  resolution_minutes: "",
  escalation_1_after_minutes: "",
  escalation_2_after_minutes: "",
};

export function HqSlaPoliciesPage() {
  const translate = useTranslate();
  const notify = useNotify();
  const qc = useQueryClient();

  const [dialogMode, setDialogMode] = useState<"add" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const policiesQ = useQuery({
    queryKey: ["sla-policies-hq"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("sla_policies")
        .select("*")
        .order("category", { ascending: true })
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SlaPolicyRow[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      const payload = {
        tenant_id: form.tenant_id.trim() || null,
        category: form.category,
        priority: form.priority,
        first_response_minutes: Number(form.first_response_minutes),
        resolution_minutes: Number(form.resolution_minutes),
        escalation_1_after_minutes: Number(form.escalation_1_after_minutes),
        escalation_2_after_minutes: Number(form.escalation_2_after_minutes),
      };

      if (dialogMode === "add") {
        const { error } = await supabase
          .from("sla_policies")
          .insert(payload);
        if (error) throw error;
      } else if (dialogMode === "edit" && editId) {
        const { error } = await supabase
          .from("sla_policies")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      notify("SLA policy saved.", { type: "success" });
      closeDialog();
      void qc.invalidateQueries({ queryKey: ["sla-policies-hq"] });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabaseClient()
        .from("sla_policies")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      notify("SLA policy deleted.", { type: "success" });
      void qc.invalidateQueries({ queryKey: ["sla-policies-hq"] });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  function openAdd() {
    setForm(emptyForm);
    setEditId(null);
    setDialogMode("add");
  }

  function openEdit(row: SlaPolicyRow) {
    setForm({
      tenant_id: row.tenant_id ?? "",
      category: row.category,
      priority: row.priority,
      first_response_minutes: String(row.first_response_minutes),
      resolution_minutes: String(row.resolution_minutes),
      escalation_1_after_minutes: String(row.escalation_1_after_minutes),
      escalation_2_after_minutes: String(row.escalation_2_after_minutes),
    });
    setEditId(row.id);
    setDialogMode("edit");
  }

  function closeDialog() {
    setDialogMode(null);
    setEditId(null);
    setForm(emptyForm);
  }

  const isFormValid =
    form.category &&
    form.priority &&
    Number(form.first_response_minutes) > 0 &&
    Number(form.resolution_minutes) > 0 &&
    Number(form.escalation_1_after_minutes) > 0 &&
    Number(form.escalation_2_after_minutes) > 0;

  return (
    <div className="max-w-screen-lg mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">SLA Policies</h1>
          <p className="text-muted-foreground mt-1">
            Configure response and resolution time targets by category and
            priority.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add Policy
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Policies</CardTitle>
          <CardDescription>
            SLA targets applied globally or per tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {policiesQ.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (policiesQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No SLA policies configured yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>First Response</TableHead>
                  <TableHead>Resolution Target</TableHead>
                  <TableHead>Escalation L1</TableHead>
                  <TableHead>Escalation L2</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(policiesQ.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {row.tenant_id ? (
                        <span className="text-xs font-mono">
                          {row.tenant_id.slice(0, 8)}...
                        </span>
                      ) : (
                        <Badge variant="outline">Global</Badge>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">
                      {row.category.replace("_", " ")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={priorityVariant(row.priority)}>
                        {row.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDuration(row.first_response_minutes)}
                    </TableCell>
                    <TableCell>
                      {formatDuration(row.resolution_minutes)}
                    </TableCell>
                    <TableCell>
                      {formatDuration(row.escalation_1_after_minutes)}
                    </TableCell>
                    <TableCell>
                      {formatDuration(row.escalation_2_after_minutes)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => deleteMut.mutate(row.id)}
                          disabled={deleteMut.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogMode !== null}
        onOpenChange={(o) => {
          if (!o) closeDialog();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "add" ? "Add Policy" : "Edit Policy"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Scope</Label>
              <Input
                placeholder="Leave empty for Global, or enter tenant ID"
                value={form.tenant_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tenant_id: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for a global policy.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category: v }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, priority: v }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>First Response (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.first_response_minutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      first_response_minutes: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Resolution Target (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.resolution_minutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      resolution_minutes: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Escalation L1 After (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.escalation_1_after_minutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      escalation_1_after_minutes: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Escalation L2 After (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.escalation_2_after_minutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      escalation_2_after_minutes: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveMut.isPending || !isFormValid}
              onClick={() => saveMut.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

HqSlaPoliciesPage.path = "/hq/support/sla-policies";
