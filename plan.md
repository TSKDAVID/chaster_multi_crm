# Chaster CRM — plan rewind & status

**Canonical checklist (full detail):** [`atomic-crm/ideas.md`](atomic-crm/ideas.md) — read that file end-to-end before starting a large chunk of work. This document is a **short rewind** of intent plus a **living status** line so we do not lose track of the roadmap.

---

## HQ vs client responsibilities

- **Chaster HQ (`/hq`):** operate the platform—companies directory, provisioning, support. On a company profile, **KB tab shows only whether the client has items and how many** (no filenames, previews, or downloads). Settings/audit remain read-only snapshots where applicable. **No** uploading or editing KB from HQ.
- **Business portal (`/portal`):** the **client organization** manages KB (all members may add; admins delete), team, AI/widget settings (admins+), subscription UI (super admin).

## What we set out to build

- **Multi-tenant B2B SaaS**: one codebase, two experiences.
- **Owner side (Chaster HQ):** internal team manages all client companies; routes under `/hq` and `/hq/companies/*`.
- **Client side (business portal):** each company’s workspace; routes under `/portal` (and future `/portal/*` sub-routes).
- **Security:** row-level security on every tenant-bound table; permissions enforced in the DB, not only in the UI; no plaintext passwords (invites / reset links only).
- **Provisioning:** checkout / server calls `provision_tenant`; invites carry tenant metadata (`ideas.md` § Checkout provisioning).

---

## Phases at a glance

| Phase | Intent (from `ideas.md`) | Status (high level) |
|------|---------------------------|---------------------|
| **1** | Rebrand to Chaster; dynamic client branding (1.2) | **1.2 shipped:** header + `document.title` — clients get `{Company} CRM`, staff **Chaster HQ** (`ClientTenantBranding`). |
| **2** | Tenants schema, RLS, RPCs, `tenant_id` on CRM | **Largely in migrations** (e.g. `20260404140000_chaster_multitenancy.sql`); **apply latest migration** `20260405130000_hq_directory_and_stats.sql` locally/remote. Optional: seed strategy per ideas §2.3. |
| **3** | Roles, guards, HQ/portal routing | **Shipped** (see earlier notes + session race fix on access provider). |
| **4** | HQ dashboard, company detail, add company + invite + audit | **MVP shipped:** stats RPC + tenant directory RPC + health table, **Export CSV**, **`/hq/companies/new`**, **`/hq/companies/:id`**. **Dashboard directory:** **Suspend / Reactivate** (Chaster **admin+**), confirm dialog + audit `hq_tenant_status_changed`. Company detail: health breakdown, extend trial, Usage Nivo placeholders, team password reset (`hq_tenant_actions`), KB presence-only tab. **`hq_provision_tenant`**. Directory also: **Reset admin** (password reset to `owner_user_id`), **reactivate** as **active** or **trial**. **Still open:** HQ role edits, real usage metrics. |
| **5** | Portal dashboard, KB (Storage), team, settings | **5.1–5.4 + KB FAQ (5.2):** trial banner, checklist AI, KB drag-and-drop, upload progress. **§5.3:** **Pending invitations** card (list, **Resend** via `tenant_team` `resend_tenant_invite`, **Cancel** + audit). Pending: **Stripe** (5.5), hosted widget loader. |
| **6** | Sidebars, toasts, `logAuditEvent` | **`logAuditEvent`** on KB + settings saves. **Client portal sub-nav** in header (Dashboard, KB, Team, Settings, Subscription). Full sidebar split (ideas §6.1) / confirmation modals polish still open. |
| **7** | Login / invite / reset polish | Partially overlapped with current auth. |
| **8** | Verification + tests | Open. |

---

## Deploy / migrate checklist (when you pull this work)

1. **Database:** from `atomic-crm`, run **`npm run db:push`** (or `npx supabase db push --yes --linked`) so all migrations apply, including **`20260408150000_tenant_invites`** (`tenant_invites` table, RLS, and `handle_new_user` sets `accepted_at` when an invitee signs up). Also ensure earlier Chaster migrations are applied (KB FAQ `20260407180000_*`, member KB + Storage `20260407200000_*`, etc.).
2. **Edge functions:** deploy **`hq_provision_tenant`**, **`hq_tenant_actions`** (`npm run functions:deploy:hq_tenant_actions` — HQ member password reset). Deploy **`tenant_team`** for portal team actions (`npm run functions:deploy:tenant_team`). Redeploy **`provision_tenant`** if you want `primary_contact_email` backfilled on new checkouts only (existing rows stay `null` until updated).
3. **App:** `npm run build` (or `dev`) — no new env vars required for HQ create beyond existing Supabase + invite redirect.

---

## What to do next (suggested order)

1. **Phase 5 remaining:** Stripe-backed subscription (5.5), hosted widget loader when ready.
2. **Phase 4 refinements:** HQ team tab actions (reset password, suspend, role edits) via edge/RPC where needed.
3. **Phase 6:** Dedicated HQ vs portal sidebars per `ideas.md` §6.1; destructive confirm patterns everywhere.
4. **Phase 8:** Run the role/RLS checklist in `ideas.md` §8; add e2e where feasible.

Update this table when a phase materially advances so it stays a truthful “rewind.”
