export type SandboxActivity = {
  id: string;
  body: string;
  detail?: string;
  occurredAt: string;
};

export type SandboxHotContact = {
  id: string;
  name: string;
  subtitle?: string;
};

export type SandboxTask = {
  id: string;
  text: string;
  dueAt?: string;
};

export type PortalSandboxPayload = {
  activities: SandboxActivity[];
  hotContacts: SandboxHotContact[];
  tasks: SandboxTask[];
};

export function defaultPortalSandboxPayload(): PortalSandboxPayload {
  return {
    activities: [],
    hotContacts: [],
    tasks: [],
  };
}

const MAX_EACH = 50;

export function coercePortalSandboxPayload(raw: unknown): PortalSandboxPayload {
  const defaults = defaultPortalSandboxPayload();
  if (raw === null || typeof raw !== "object") return defaults;
  const o = raw as Record<string, unknown>;

  const activities: SandboxActivity[] = Array.isArray(o.activities)
    ? (o.activities as unknown[])
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const id = typeof row.id === "string" ? row.id : crypto.randomUUID();
          const body = typeof row.body === "string" ? row.body : "";
          const detail =
            typeof row.detail === "string"
              ? row.detail
              : typeof row.note === "string"
                ? row.note
                : undefined;
          const occurredAt =
            typeof row.occurredAt === "string"
              ? row.occurredAt
              : typeof row.date === "string"
                ? row.date
                : new Date().toISOString();
          if (!body) return null;
          return { id, body, detail, occurredAt } satisfies SandboxActivity;
        })
        .filter(Boolean) as SandboxActivity[]
    : [];

  const hotContacts: SandboxHotContact[] = Array.isArray(o.hotContacts)
    ? (o.hotContacts as unknown[])
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const id = typeof row.id === "string" ? row.id : crypto.randomUUID();
          const name = typeof row.name === "string" ? row.name : "";
          const subtitle =
            typeof row.subtitle === "string" ? row.subtitle : undefined;
          if (!name) return null;
          return { id, name, subtitle } satisfies SandboxHotContact;
        })
        .filter(Boolean) as SandboxHotContact[]
    : [];

  const tasks: SandboxTask[] = Array.isArray(o.tasks)
    ? (o.tasks as unknown[])
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const id = typeof row.id === "string" ? row.id : crypto.randomUUID();
          const text = typeof row.text === "string" ? row.text : "";
          const dueAt = typeof row.dueAt === "string" ? row.dueAt : undefined;
          if (!text) return null;
          return { id, text, dueAt } satisfies SandboxTask;
        })
        .filter(Boolean) as SandboxTask[]
    : [];

  return {
    activities: activities.slice(0, MAX_EACH),
    hotContacts: hotContacts.slice(0, MAX_EACH),
    tasks: tasks.slice(0, MAX_EACH),
  };
}
