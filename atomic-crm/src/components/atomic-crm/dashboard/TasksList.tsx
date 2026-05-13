import { AlertCircle, Calendar, CheckSquare, Send, ListTodo } from "lucide-react";
import { useTranslate, useGetList } from "ra-core";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { AddTask } from "../tasks/AddTask";
import { TasksListContent } from "../tasks/TasksListContent";
import type { Task } from "../types";

type TaskView = "today" | "overdue" | "delegated" | "all";

export const TasksList = ({
  tenantScopeId,
}: {
  tenantScopeId?: string;
}) => {
  const translate = useTranslate();
  const [view, setView] = useState<TaskView>("today");
  const filter = tenantScopeId ? { tenant_id: tenantScopeId } : {};

  const { data: tasks = [] } = useGetList<Task>("tasks", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "due_date", order: "ASC" },
    filter,
  });

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const todayTasks = tasks.filter(
    (t) => !t.done_date && t.due_date?.slice(0, 10) === todayStr,
  );
  const overdueTasks = tasks.filter(
    (t) => !t.done_date && t.due_date && t.due_date < todayStr,
  );
  const delegatedTasks = tasks.filter(
    (t) => !t.done_date && t.delegated_by,
  );
  const allPending = tasks.filter((t) => !t.done_date);

  const cards: {
    id: TaskView;
    label: string;
    count: number;
    icon: typeof CheckSquare;
    color: string;
  }[] = [
    {
      id: "today",
      label: "Today",
      count: todayTasks.length,
      icon: Calendar,
      color: "text-blue-600",
    },
    {
      id: "overdue",
      label: "Overdue",
      count: overdueTasks.length,
      icon: AlertCircle,
      color: "text-red-600",
    },
    {
      id: "delegated",
      label: "Delegated",
      count: delegatedTasks.length,
      icon: Send,
      color: "text-violet-600",
    },
    {
      id: "all",
      label: "All Open",
      count: allPending.length,
      icon: ListTodo,
      color: "text-muted-foreground",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center">
        <div className="mr-3 flex">
          <CheckSquare className="text-muted-foreground w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-muted-foreground flex-1">
          {translate("crm.dashboard.upcoming_tasks", {
            _: "Upcoming Tasks",
          })}
        </h2>
        <AddTask display="icon" selectContact tenantScopeId={tenantScopeId} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setView(c.id)}
              className={cn(
                "text-left rounded-lg border p-2.5 transition-colors",
                view === c.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4", c.color)} />
                <span className="text-xs text-muted-foreground">{c.label}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-lg font-bold">{c.count}</span>
                {c.id === "overdue" && c.count > 0 ? (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    !
                  </Badge>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <Card className="p-4 mb-2">
        <TasksListContent tenantScopeId={tenantScopeId} />
      </Card>
    </div>
  );
};
