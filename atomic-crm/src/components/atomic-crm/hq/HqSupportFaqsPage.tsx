import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate } from "ra-core";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { GripVertical, Pencil, Plus } from "lucide-react";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { ChasterHQGuard } from "../access/ChasterHQGuard";
import { PermissionGate } from "../access/PermissionGate";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { SupportFaqRow } from "@/modules/support/supportTypes";
import { cn } from "@/lib/utils";

export function HqSupportFaqsPage() {
  const translate = useTranslate();
  const notify = useNotify();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<SupportFaqRow | "new" | null>(null);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");

  const faqsQ = useQuery({
    queryKey: ["support-faqs-hq"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("support_faq_entries")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SupportFaqRow[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      if (edit === "new") {
        const maxSort = Math.max(
          0,
          ...((faqsQ.data ?? []).map((f) => f.sort_order) ?? [0]),
        );
        const { error } = await supabase.from("support_faq_entries").insert({
          question: q.trim(),
          answer: a.trim(),
          sort_order: maxSort + 1,
        });
        if (error) throw error;
        return;
      }
      if (edit?.id) {
        const { error } = await supabase
          .from("support_faq_entries")
          .update({
            question: q.trim(),
            answer: a.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", edit.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      notify(translate("chaster.hq.support.saved"), { type: "success" });
      setEdit(null);
      setQ("");
      setA("");
      void qc.invalidateQueries({ queryKey: ["support-faqs-hq"] });
      void qc.invalidateQueries({ queryKey: ["support-faqs-active"] });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const archiveMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabaseClient()
        .from("support_faq_entries")
        .update({
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support-faqs-hq"] });
      void qc.invalidateQueries({ queryKey: ["support-faqs-active"] });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const reorderMut = useMutation({
    mutationFn: async (ordered: SupportFaqRow[]) => {
      const supabase = getSupabaseClient();
      await Promise.all(
        ordered.map((row, index) =>
          supabase
            .from("support_faq_entries")
            .update({
              sort_order: index,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id),
        ),
      );
    },
    onSuccess: () => {
      notify(translate("chaster.hq.support.faq_sort_saved"), {
        type: "success",
      });
      void qc.invalidateQueries({ queryKey: ["support-faqs-hq"] });
      void qc.invalidateQueries({ queryKey: ["support-faqs-active"] });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || !faqsQ.data) return;
    const activeOnly = faqsQ.data.filter((f) => !f.archived_at);
    const items = Array.from(activeOnly);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    reorderMut.mutate(items);
  };

  const openNew = () => {
    setEdit("new");
    setQ("");
    setA("");
  };

  const openEdit = (row: SupportFaqRow) => {
    setEdit(row);
    setQ(row.question);
    setA(row.answer);
  };

  const activeRows = (faqsQ.data ?? []).filter((f) => !f.archived_at);
  const archivedRows = (faqsQ.data ?? []).filter((f) => f.archived_at);

  return (
    <ChasterHQGuard>
      <PermissionGate permission="hq.support.faqs.manage">
        <div className="max-w-screen-md mx-auto p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">
                {translate("chaster.hq.support.faqs_title")}
              </h1>
              <p className="text-muted-foreground mt-1">
                {translate("chaster.hq.support.faqs_subtitle")}
              </p>
            </div>
            <Button type="button" size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />
              {translate("chaster.hq.support.faq_new")}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {translate("chaster.hq.support.faqs_title")}
              </CardTitle>
              <CardDescription>
                {translate("chaster.hq.support.faq_drag_hint")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {faqsQ.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : activeRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {translate("chaster.hq.support.faq_empty")}
                </p>
              ) : (
                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="support-faqs">
                    {(provided) => (
                      <ul
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="space-y-2"
                      >
                        {activeRows.map((row, index) => (
                          <Draggable
                            key={row.id}
                            draggableId={row.id}
                            index={index}
                          >
                            {(dragProvided, snapshot) => (
                              <li
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                className={cn(
                                  "flex items-start gap-2 rounded-lg border p-3 bg-card",
                                  snapshot.isDragging && "shadow-md",
                                )}
                              >
                                <button
                                  type="button"
                                  className="mt-1 text-muted-foreground cursor-grab"
                                  aria-label="Reorder"
                                  {...dragProvided.dragHandleProps}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </button>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm">
                                    {row.question}
                                  </p>
                                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                    {row.answer}
                                  </p>
                                </div>
                                <div className="flex shrink-0 gap-1">
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
                                    size="sm"
                                    variant="outline"
                                    onClick={() => archiveMut.mutate(row.id)}
                                    disabled={archiveMut.isPending}
                                  >
                                    {translate("chaster.hq.support.faq_archive")}
                                  </Button>
                                </div>
                              </li>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </ul>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
            </CardContent>
          </Card>

          {archivedRows.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {translate("chaster.hq.support.faq_archived")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {archivedRows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded border px-3 py-2 text-sm opacity-70"
                  >
                    <span className="truncate">{row.question}</span>
                    <Badge variant="outline">
                      {translate("chaster.hq.support.faq_archived")}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Dialog
            open={edit !== null}
            onOpenChange={(o) => {
              if (!o) setEdit(null);
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {edit === "new"
                    ? translate("chaster.hq.support.faq_new")
                    : translate("chaster.hq.support.faq_edit")}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>{translate("chaster.hq.support.faq_question")}</Label>
                  <Input value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{translate("chaster.hq.support.faq_answer")}</Label>
                  <Textarea
                    rows={6}
                    value={a}
                    onChange={(e) => setA(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEdit(null)}
                >
                  {translate("chaster.hq.support.faq_cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={
                    saveMut.isPending || !q.trim() || !a.trim()
                  }
                  onClick={() => saveMut.mutate()}
                >
                  {translate("chaster.hq.support.faq_save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </PermissionGate>
    </ChasterHQGuard>
  );
}
