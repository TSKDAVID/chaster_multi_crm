# AGENTS.md

## Project Overview

**Chaster CRM** is a multi-tenant B2B platform evolving from the Atomic CRM template: React, shadcn-admin-kit, and Supabase. It provides contact management, task tracking, notes, email capture, and deal management with a Kanban board. It now includes a full HQ admin console, tenant client portal, Salesforce-grade support system, AI brain integration, and strict RLS.

**Note:** Application source still lives under `src/components/atomic-crm/` (import path); renaming that folder is a separate refactor.

---

## CRITICAL: How to Connect & Resume Work

### Supabase Connection

The project uses a **remote Supabase** instance (not local Docker). All connection details are in `.env.development`:

```
Supabase URL: https://fhzpjuumzlsuenqpglbj.supabase.co
Publishable Key: (in .env.development)
```

The Supabase CLI is already linked. To verify or re-link:

```bash
cd atomic-crm
npx supabase login
npx supabase link --project-ref fhzpjuumzlsuenqpglbj
```

### Applying Database Migrations

Whenever you create a new migration file under `supabase/migrations/`:

```bash
cd atomic-crm
npx supabase db push     # interactive Y/n prompt, pushes to remote
```

**IMPORTANT:** PowerShell does NOT support `&&` or bash heredocs. Use separate commands or `;` separators.

### Git Repository

```
Repo root:     c:\Users\Lenovo\Desktop\chaster\chaster_multi_crm
Git remote:    https://github.com/TSKDAVID/chaster_multi_crm.git
Branch:        main
CRM app root:  c:\Users\Lenovo\Desktop\chaster\chaster_multi_crm\atomic-crm
```

### Brain API

The Chaster Brain (AI backend) is hosted at `https://brain-vd2i.onrender.com`. The separate brain codebase lives at `c:\Users\Lenovo\Desktop\chaster\brain` (also mirrored in `chaster_multi_crm/chaster-brain`). It uses FastAPI + Groq LLM + Supabase for knowledge retrieval.

---

## Full Feature Inventory (Current State)

### CRM Core (Atomic CRM base)
- Contacts, companies, tasks, notes, deals (Kanban board), activity logs
- CSV import/export for contacts
- Tags, deal pipeline with stages, email capture
- Supabase Auth (email, SSO)

### Multi-Tenancy & Access Control
- `tenants`, `tenant_members`, `tenant_settings` tables with full RLS
- `chaster_team` table for HQ/internal staff with roles: `member`, `admin`, `super_admin`
- `is_chaster_staff()`, `is_hq_support_role()`, `has_tenant_role()` helper functions
- HQ vs Portal role separation (migration `20260424220000_hq_workspace_rbac_roles.sql`)
- Tenant provisioning via Edge Function `hq_provision_tenant`

### HQ Admin Console (`/hq/...`)
- **Company Directory** (`/hq/companies`) — tenant list with stats, detail pages, member management
- **Support Cases** (`/hq/support/cases`) — Salesforce-grade case queue with:
  - 10 KPI cards with icons and color-coded borders (Open, In Progress, Pending Client, Resolved, Unassigned, Unread, New 7d, SLA Breached, Escalated, Avg First Response)
  - 3 view modes: Table, Card grid, Compact list (persisted to localStorage)
  - Quick-view filters (All, My Open, Unassigned, Unread)
  - Status/tenant/assignee/unread filters + search
  - **Rich case creation form** with 5 sections, 14+ fields:
    - Section 1: Tenant picker + prospect toggle
    - Section 2: Subject, description, category, priority, source selector, tags, related case
    - Section 3: Contact/requester search
    - Section 4: Initial message, attachments, internal note
    - Section 5: Assignment (self/agent), follow-up date
  - Pagination with 25 per page
- **Case Detail** (`/hq/support/cases/:id`) — Full case management:
  - SLA timer chips (response + resolution, color-coded urgency)
  - Duplicate detection banner with merge/dismiss actions
  - Merged case banner with undo action
  - Tags display + inline tag management
  - Related case card with link
  - Follow-up date display/editor with overdue highlighting
  - Status/priority/source management
  - Staff assignment (self or pick from list)
  - Internal notes (real-time via Supabase channel)
  - Conversation thread with message editing indicator
  - Prospect requester editing + tenant provisioning from case
- **FAQ Management** (`/hq/support/faqs`)
- **SLA Policies** (`/hq/support/sla-policies`) — CRUD for SLA policies with duration formatting
- **Risk Alerts** (`/hq/risk-alerts`) — Risky user flagging dashboard with KPIs, filters, timeline
- **Platform Team** (`/hq/platform-team`) — Chaster staff management
- **Brain Sandbox** — AI testing tab for HQ staff

### Portal (Tenant Client) (`/portal/...`)
- **Dashboard** with activity, metrics
- **Support Page** (`/portal/support`) — Portal-side support:
  - Hero section with gradient, "How can we help?" heading, quick actions
  - Case creation with priority selector (color dots), tags input, category, attachments
  - Case list with status-colored left borders
  - FAQ section with category grouping
  - Better empty states
- **Case Detail** (`/portal/support/cases/:id`)
- **Settings** with email auto-merge toggle
- **Quick Nav** component

### Support System (Database Layer)
- **Tables:** `support_cases`, `support_case_messages`, `support_case_internal_notes`, `support_requesters`, `support_faq_entries`, `support_case_read_state`, `support_case_staff_read_state`
- **SLA:** `sla_policies`, `sla_escalation_log` with auto-deadline assignment triggers and cron-based breach detection (`sla_check_breaches_and_escalate`)
- **Email-to-Case:** `email_subject_aliases`, `case_merge_log` with 4-tier threading (exact header match, subject alias, fuzzy duplicate, new case)
- **Security:** `user_risk_flags` table, `check_support_case_rate_limit()` (5/hr hard cap, flags at 3+), `check_message_rate_limit()` (30/5min)
- **RPCs:** `create_support_case` (portal), `hq_create_support_case` (HQ, enriched with 15 params), `hq_create_support_prospect_case`, `merge_support_cases`, `unmerge_support_case`
- **Enrichment columns:** `tags text[]`, `follow_up_at timestamptz`, `related_case_id uuid`

### Task System
- Tasks linked to cases (`case_id`) and deals (`deal_id`)
- Assignment, delegation, priority, status tracking
- Recurring task rules with `generate_recurring_task_instances()` function
- Dashboard widget with Today's/Overdue/Delegated/All Open cards

### Messaging
- Direct messages between users
- Staff DMs and HQ internal channels
- Unread tracking with read state tables

### Edge Functions (Supabase)
| Function | Purpose |
|----------|---------|
| `hq_provision_tenant` | Create new tenant with admin user, CRM company |
| `provision_tenant` | Self-serve tenant creation |
| `tenant_team` | Manage workspace members |
| `hq_tenant_actions` | HQ admin actions on tenants |
| `users` | Invite/update/delete CRM users |
| `email_to_case` | Inbound email → support case (4-tier threading) |
| `send_case_reply` | Outbound staff email replies (via Resend API) |
| `postmark` | Inbound email webhook |
| `merge_contacts` | Contact deduplication |
| `mcp` | MCP server for Brain |
| `delete_note_attachments` | Storage cleanup |
| `update_password` | Password update helper |

---

## Database Migrations (chronological, all applied)

| Migration | What it does |
|-----------|-------------|
| `20240730075029_init_db.sql` | Initial schema: contacts, companies, deals, tasks, notes, sales, tags |
| `20260404140000_chaster_multitenancy.sql` | Tenants, tenant_members, tenant_settings, tenant-scoped RLS, seed tenant |
| `20260404200000_provisioned_tenant_signup.sql` | Auto-assign provisioned users to their tenant on signup |
| `20260405130000_hq_directory_and_stats.sql` | HQ directory views and tenant statistics |
| `20260410120000_messaging.sql` | DM messaging system |
| `20260415120000_support_portal.sql` | Portal support: cases, messages, FAQs, read state |
| `20260416120000_support_hq_case_console.sql` | HQ case console: staff read state, internal notes, HQ RPC |
| `20260418120000_support_prospect_cases.sql` | Prospect/requester support cases |
| `20260420130000_chaster_brain_knowledge_chunks.sql` | Brain knowledge base tables |
| `20260420140000_chaster_brain_app_configurations.sql` | Brain app configs |
| `20260420150000_chaster_brain_control_plane.sql` | Brain runtime control, parameters, metrics |
| `20260424220000_hq_workspace_rbac_roles.sql` | HQ/workspace role split RBAC |
| `20260516120000_security_critical_sales_tenant_isolation.sql` | Sales table tenant isolation, edited_at on messages |
| `20260516130000_security_high_rpc_roles_audit_messages.sql` | Tightened HQ RPC access, audit log policy |
| `20260516140000_security_rate_limiting_risk_flags.sql` | Rate limiting, risk flags, injected into create_support_case |
| `20260516150000_sla_tracking_escalation.sql` | SLA policies, deadlines, breach detection, escalation |
| `20260516160000_tasks_overhaul.sql` | Tasks: case/deal linking, delegation, recurring, priority/status |
| `20260516170000_email_to_case.sql` | Email threading, subject aliases, merge/unmerge RPCs |
| `20260517120000_support_enrichment.sql` | Tags[], follow_up_at, related_case_id + enriched RPCs |

---

## Technology Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Routing**: React Router v7
- **Data Fetching**: React Query (TanStack Query)
- **UI Components**: Shadcn UI + Radix UI (mutable dependencies in `src/components/ui/`)
- **Styling**: Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + REST API + Auth + Storage + Edge Functions + Realtime)
- **AI Backend**: FastAPI + Groq LLM + LangGraph + Redis (deployed on Render)
- **Testing**: Vitest
- **Translations**: ra-core (react-admin headless) `useTranslate()`

---

## Directory Structure

```
chaster_multi_crm/                  # Git repo root
├── atomic-crm/                     # Main CRM application
│   ├── src/
│   │   ├── components/
│   │   │   ├── atomic-crm/         # Main CRM code
│   │   │   │   ├── access/         # Auth guards, RBAC, permissions
│   │   │   │   ├── hq/             # HQ admin pages (cases, risk alerts, SLA policies, etc.)
│   │   │   │   ├── portal/         # Tenant portal pages (support, settings, dashboard)
│   │   │   │   ├── brain/          # Brain sandbox UI
│   │   │   │   ├── root/           # Root CRM component + routing
│   │   │   │   ├── layout/         # Header, navigation, theme
│   │   │   │   ├── dashboard/      # Dashboard widgets
│   │   │   │   ├── companies/      # Company management
│   │   │   │   ├── contacts/       # Contacts + CSV import/export
│   │   │   │   ├── deals/          # Deal pipeline (Kanban)
│   │   │   │   ├── tasks/          # Task management
│   │   │   │   ├── notes/          # Note management
│   │   │   │   ├── sales/          # Sales team management
│   │   │   │   ├── providers/      # Supabase + FakeRest data providers
│   │   │   │   └── ...
│   │   │   ├── ui/                 # Shadcn UI components (mutable)
│   │   │   └── admin/              # Shadcn Admin Kit (mutable)
│   │   ├── modules/
│   │   │   ├── support/            # Support types, hooks, components
│   │   │   │   ├── supportTypes.ts # All support-related TypeScript types
│   │   │   │   ├── hooks/          # useSupportUnread, etc.
│   │   │   │   └── components/     # SupportCaseThread, etc.
│   │   │   └── messaging/          # Messaging types, hooks, components
│   │   ├── lib/                    # Utility functions (cn, etc.)
│   │   └── App.tsx                 # Entry point
│   ├── supabase/
│   │   ├── migrations/             # 55+ migration files (all applied)
│   │   ├── functions/              # 12 Edge Functions
│   │   ├── schemas/                # Declarative schema (source of truth)
│   │   └── config.toml             # project_id = "atomic-crm-demo"
│   ├── .env.development            # Supabase URL + key (committed, safe to read)
│   └── package.json
├── chaster-brain/                  # Brain backend (mirrored from ../brain)
│   ├── app/
│   │   ├── main.py                 # FastAPI entrypoint
│   │   ├── gateway/service.py      # Security validation
│   │   ├── orchestrator/           # LangGraph: graph.py, nodes.py, llm.py
│   │   ├── rag/retriever.py        # FAQ chunk retrieval
│   │   ├── memory/manager.py       # Conversation memory (Redis + Supabase)
│   │   └── db/client.py            # Supabase REST helper
│   ├── dashboard/                  # TypeScript dashboard for Brain control
│   └── .env.example                # Brain env vars template
└── README.md
```

---

## Development Commands

### Setup & Run

```bash
cd atomic-crm
npm install
npm run dev                        # Start Vite dev server at localhost:5173
```

### Database

```bash
npx supabase db push               # Push pending migrations to remote (interactive)
npx supabase db push --yes         # Non-interactive push
```

### Deploy Edge Functions

```bash
npx supabase functions deploy hq_provision_tenant
npx supabase functions deploy email_to_case
npx supabase functions deploy send_case_reply
npx supabase functions deploy users
npx supabase functions deploy tenant_team
npx supabase functions deploy hq_tenant_actions
```

### Testing

```bash
make test                          # Vitest
make typecheck                     # TypeScript
make lint                          # ESLint + Prettier
```

---

## Key Patterns & Conventions

### Supabase Client Usage (Frontend)

```typescript
import { getSupabaseClient } from "../providers/supabase/supabase";

// Direct table query
const { data, error } = await getSupabaseClient()
  .from("support_cases")
  .select("*, tenants(company_name), support_requesters(*)")
  .order("updated_at", { ascending: false });

// RPC call
const { data, error } = await getSupabaseClient().rpc("hq_create_support_case", {
  p_tenant_id: tenantId,
  p_subject: subject,
  // ... params
});
```

### Access Control Guards

```tsx
<ChasterHQGuard>           {/* Redirects non-HQ staff */}
  <PermissionGate permission="hq.support.cases.read">
    {/* Content */}
  </PermissionGate>
</ChasterHQGuard>

<TenantPortalGuard>         {/* Redirects non-tenant users */}
  <PermissionGate permission="portal.support.view">
    {/* Content */}
  </PermissionGate>
</TenantPortalGuard>
```

### Data Fetching Pattern

All pages use `@tanstack/react-query` with Supabase:

```typescript
const casesQ = useQuery({
  queryKey: ["hq-support-cases"],
  enabled: can("hq.support.cases.read"),
  queryFn: async () => { /* supabase query */ },
});
```

### Routing

Routes are defined in `src/components/atomic-crm/root/CRM.tsx`. HQ routes are under `/hq/...`, portal under `/portal/...`.

### Translations

Uses ra-core `useTranslate()`. Translation keys follow pattern `chaster.hq.support.*` and `chaster.portal.support.*`.

### Component Library

All UI uses shadcn/ui components from `@/components/ui/`:
- `Card`, `Badge`, `Button`, `Input`, `Textarea`, `Select`, `Dialog`, `ToggleGroup`, `Table`, `Skeleton`, `Accordion`, `Breadcrumb`, `Separator`, `Checkbox`, `Label`
- Icons from `lucide-react`
- Utility: `cn()` from `@/lib/utils`

### State Persistence

View preferences use `localStorage`:
```typescript
const [viewMode, setViewMode] = useState<ViewMode>(() => {
  try { return (localStorage.getItem("hq-support-view-mode") as ViewMode) || "table"; } catch { return "table"; }
});
```

---

## TypeScript Types (Support Module)

Key types in `src/modules/support/supportTypes.ts`:

```typescript
type SupportCaseRow = {
  id: string; tenant_id: string | null; support_requester_id: string | null;
  case_number: string; subject: string; description?: string;
  category: SupportCaseCategory; status: SupportCaseStatus;
  created_by: string | null; assigned_to: string | null;
  priority: SupportCasePriority; source: SupportCaseSource;
  // SLA
  first_response_due_at?: string | null; resolution_due_at?: string | null;
  sla_response_breached?: boolean; sla_resolution_breached?: boolean;
  escalation_level?: number;
  // Email-to-case
  source_email?: string | null; email_thread_id?: string | null;
  possible_duplicate_of?: string | null; merged_into_case_id?: string | null;
  // Enrichment
  tags?: string[]; follow_up_at?: string | null; related_case_id?: string | null;
};

type SupportCaseStatus = "open" | "in_progress" | "pending_client" | "resolved";
type SupportCasePriority = "low" | "medium" | "high" | "urgent";
type SupportCaseSource = "portal" | "phone" | "email" | "hq" | "other" | "prospect";
type SupportCaseCategory = "billing" | "technical" | "account" | "ai_kb" | "widget" | "other";
```

---

## Known Issues & Gotchas

1. **PowerShell syntax**: This is a Windows project. PowerShell does NOT support `&&`, heredocs (`<<'EOF'`), or `wc`. Use `;` to chain commands, simple `-m "message"` for git commits.
2. **`hq_create_support_prospect_case` RPC**: This RPC has NOT been enriched with the new params (tags, follow_up, etc.). Only the standard `hq_create_support_case` and `create_support_case` RPCs have the full parameter set.
3. **Edge Functions deployment**: Migrations don't deploy functions. After modifying Edge Function code, deploy manually with `npx supabase functions deploy <name>`.
4. **Supabase types**: The project does NOT use auto-generated Supabase types. Types are manually maintained in `supportTypes.ts` and `types.ts`.
5. **`support_case_internal_notes`**: Already exists from migration `20260416120000`. Used for staff-only notes on cases.
6. **Existing `description` column**: `support_cases.description` already existed before enrichment. The enrichment migration added `tags`, `follow_up_at`, and `related_case_id`.

---

## What's Next (Potential Future Work)

Based on the conversation history, these areas have been discussed or are natural next steps:

- **Widget integration**: The Brain has a public widget API (`/v1/handshake`, `/v1/process`) ready for embedding
- **Sortable table headers**: Mentioned in the plan but not yet implemented for the table view
- **Row hover quick actions**: Mentioned for table view (assign, change status) but not yet implemented
- **`PortalSupportCasePage.tsx` polish**: Plan mentions tags display and related case note for the portal case detail page — not yet done
- **Collapsible form sections**: The HQ creation form has section headers but sections are not collapsible yet
- **Email reply from HQ**: The `send_case_reply` Edge Function exists but may need UI integration
- **Recurring task cron**: `generate_recurring_task_instances()` exists but needs a pg_cron schedule
- **Additional SLA cron setup**: `sla_check_breaches_and_escalate()` needs pg_cron to run periodically
