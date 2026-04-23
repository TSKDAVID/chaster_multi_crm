🧠 Chaster CRM — Master Development Plan for Cursor AI

**Maintainers / Cursor:** Treat this file as the **canonical** product and phase checklist. A short **rewind + status** summary lives at [`plan.md`](../plan.md) in the repo root—keep it aligned with this document when phases advance; prefer updating this file when requirements change.

This document is a complete, ordered checklist of every feature, change, and behaviour that needs to be implemented to transform the default Atomic CRM template into the Chaster CRM platform. Read this entire document before starting. Each phase must be completed and verified before moving to the next.


📌 Context & Architecture Overview
What is Chaster?
Chaster is a multi-tenant B2B SaaS platform. The CRM is its management layer — it has two distinct sides:

Owner Side (Chaster HQ): Used by the Chaster team internally to manage all client companies.
Client Side (Business Portal): Used by each client company to manage their own team, their AI configuration, and their Chaster subscription usage.

Both sides live in the same application but show completely different interfaces based on the authenticated user's role and tenant.
Tech Stack (Atomic CRM baseline):

Frontend: React (likely Vite or Next.js — check the project root)
Backend/DB: Supabase (PostgreSQL with Row Level Security)
Auth: Supabase Auth
Current state: Default Atomic CRM, connected to Supabase, login/signup working only.

Golden Rules (never break these):

Company A can NEVER see Company B's data — enforce via Supabase RLS on every table.
Owners (Chaster team) can see company metadata but NEVER private messages or conversation content.
Passwords are never shown, set, or stored in plaintext — only magic links / reset emails.
Every database change must have a corresponding RLS policy update.


🗂️ PHASE 1 — Rebranding & White-Labelling
1.1 Global Rename

 Replace every instance of "Atomic CRM" in the codebase (titles, meta tags, alt text, comments, README) with "Chaster CRM".
 Update <title> tag and any manifest.json or site.webmanifest app name.
 Update the favicon placeholder to a generic Chaster logo (use a simple "C" lettermark placeholder for now).
 Update any package.json name field to chaster-crm.

1.2 Dynamic Client-Side Branding
Goal: When a client company logs in, they should see "[Their Company Name] CRM" in the title and header — not "Chaster CRM".

 Add a company_name field to the companies/tenants table in Supabase if it doesn't exist.
 After login, fetch the authenticated user's associated company name from the DB.
 Dynamically set the browser <title> to ${companyName} CRM for client-side users.
 Dynamically render the sidebar/header logo text as ${companyName} CRM for client-side users.
 For Owner-side users (Chaster team), always show "Chaster HQ" — never a company name.
 This switch must happen at the layout/context level so it propagates everywhere automatically.


🗂️ PHASE 2 — Database Schema & Multi-Tenancy Foundation

Do this before building any UI. Every feature depends on this being correct.

2.1 Core Tables to Create or Verify Exist
tenants table (each row = one client company)
sqlid uuid PRIMARY KEY DEFAULT gen_random_uuid()
company_name text NOT NULL
slug text UNIQUE NOT NULL  -- used in URLs e.g. /portal/acme-corp
status text DEFAULT 'trial' -- 'trial' | 'active' | 'suspended' | 'churned'
subscription_tier text DEFAULT 'starter' -- 'starter' | 'pro' | 'enterprise'
trial_ends_at timestamptz
created_at timestamptz DEFAULT now()
owner_user_id uuid REFERENCES auth.users(id) -- the Super Admin of this company
notes text -- internal Chaster-team notes only, never visible to client
tenant_members table (links users to tenants with roles)
sqlid uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE
user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
role text NOT NULL DEFAULT 'member' -- 'member' | 'admin' | 'super_admin'
invited_by uuid REFERENCES auth.users(id)
joined_at timestamptz DEFAULT now()
UNIQUE(tenant_id, user_id)
chaster_team table (marks users as internal Chaster/Owner team)
sqlid uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id uuid REFERENCES auth.users(id) UNIQUE
role text DEFAULT 'staff' -- 'staff' | 'admin' | 'super_admin'
added_at timestamptz DEFAULT now()
knowledge_base_documents table
sqlid uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE
file_name text NOT NULL
file_type text NOT NULL -- 'pdf' | 'txt' | 'faq' | 'url'
storage_path text NOT NULL -- Supabase Storage path
status text DEFAULT 'processing' -- 'processing' | 'ready' | 'error'
uploaded_by uuid REFERENCES auth.users(id)
uploaded_at timestamptz DEFAULT now()
file_size_bytes bigint
audit_logs table
sqlid uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id uuid REFERENCES tenants(id) -- null if it's a Chaster HQ action
actor_user_id uuid REFERENCES auth.users(id)
action text NOT NULL -- e.g. 'role_changed', 'document_uploaded', 'member_removed'
target_user_id uuid REFERENCES auth.users(id) -- if action was on a user
metadata jsonb -- any extra context
created_at timestamptz DEFAULT now()
tenant_settings table
sqlid uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id uuid REFERENCES tenants(id) UNIQUE ON DELETE CASCADE
ai_tone text DEFAULT 'professional' -- 'professional' | 'casual' | 'technical'
escalation_threshold float DEFAULT 0.6
business_hours_start time DEFAULT '09:00'
business_hours_end time DEFAULT '17:00'
timezone text DEFAULT 'UTC'
widget_primary_color text DEFAULT '#6366f1'
widget_welcome_message text DEFAULT 'Hi! How can I help you today?'
2.2 Row Level Security (RLS) Policies

 Enable RLS on ALL tables above.
 tenants: Chaster team can SELECT/UPDATE all rows. Client users can only SELECT their own tenant row.
 tenant_members: Users can only SELECT rows where tenant_id matches their own tenant. Only Super Admins of that tenant can INSERT/UPDATE/DELETE.
 knowledge_base_documents: Users can only SELECT/INSERT/DELETE where tenant_id = their tenant. Chaster team: support may confirm **that** KB rows exist (count / minimal policy); avoid exposing client content in HQ UI (no filenames, previews, or downloads from HQ).
 audit_logs: INSERT only (no one can delete audit logs). SELECT restricted to same tenant, plus full Chaster team access.
 chaster_team: Only accessible to users whose user_id is in this table.
 Create a Postgres function get_my_tenant_id() that returns the current user's tenant_id — use this in all RLS policies.
 Create a Postgres function is_chaster_staff() that returns true if current user is in chaster_team table.

2.3 Seed / Placeholder Data
Create a seed file (/supabase/seed.sql or /scripts/seed-dev.ts) with the following. All data must be functional — uploads, roles, and settings must actually work.

 1 Chaster owner account: owner@chaster.ai / password: ChasterDev2024!
 3 fake client companies:

Nexus Retail — status: active, tier: pro
Bluewave Finance — status: trial, trial ends in 14 days, tier: starter
Orion Logistics — status: suspended, tier: pro


 Each company gets 1 Super Admin, 1 Admin, and 2 Members with realistic fake emails.
 Each company gets 2–3 placeholder knowledge base documents uploaded to Supabase Storage under /knowledge-base/{tenant_id}/ (generate lorem ipsum PDFs at runtime if needed).
 1 FAQ entry per company as a text record.
 Each company gets a tenant_settings row with slightly varied settings.
 5–10 audit log entries per company showing realistic past actions.


🗂️ PHASE 3 — Role & Permission System
3.1 Role Definitions

**Client company roles** (enforced in RLS + `permissions.ts`; UI uses `PermissionGate`):

| Capability | Member | Admin | Super Admin |
|------------|--------|-------|-------------|
| Dashboard & stats | ✅ | ✅ | ✅ |
| Upload knowledge base (files / FAQ) | ✅ | ✅ | ✅ |
| Delete knowledge base | ❌ | ✅ | ✅ |
| Invite / remove members (rules apply) | ❌ | ✅ | ✅ |
| Promote to admin | ❌ | ❌ | ✅ |
| AI & widget settings | ❌ | ✅ | ✅ |
| Billing / subscription UI | ❌ | ❌ | ✅ |
| Transfer super admin | ❌ | ❌ | ✅ |

**Chaster team roles** (`chaster_team`):

| Capability | Staff | Admin | Super Admin |
|------------|-------|-------|-------------|
| View companies & directory stats | ✅ | ✅ | ✅ |
| Edit tenant overview (status, tier, trial, notes) | ❌ | ✅ | ✅ |
| Add/remove companies (provision) | ❌ | ✅ | ✅ |
| **Send password reset** for a user in a client tenant | ❌ | ✅ | ✅ |
| Manage Chaster team roster | ❌ | ❌ | ✅ |

Password reset from HQ uses Edge Function **`hq_tenant_actions`** (`send_member_password_reset`); staff cannot invoke it.
3.2 Implementation Requirements

 Create a useCurrentUserRole() React hook that reads the user's role from tenant_members or chaster_team and exposes: role, isOwnerSide, can(permission: string).
 Create a <PermissionGate permission="..."> component that renders children only if the user has the required permission.
 Use PermissionGate around every sensitive UI element — buttons, nav items, settings panels.
 Never rely on frontend-only permission checks for security — all mutations must be validated server-side via RLS.
 Super Admin role can only be held by one person per company at a time. Transferring must be atomic (Postgres transaction).

3.3 Owner vs. Client Side Routing

 On login, detect whether the authenticated user exists in chaster_team.

If YES → redirect to /hq
If NO → redirect to /portal


 Route groups: /hq/* for owner side, /portal/* for client side.
 If a non-Chaster user tries to access /hq/*, redirect to /portal with "Unauthorized" toast.
 Protect all /hq/* routes with a <ChasterHQGuard> component.
 Protect all /portal/* routes with a <TenantPortalGuard> component that injects the current tenant context.


🗂️ PHASE 4 — Owner Side (Chaster HQ) UI
4.1 HQ Dashboard (/hq)

 Stats bar: Total Companies, Total Users, AI Documents Indexed, New Signups This Week.
 Company Health Table — sortable, filterable — with columns:

Company Name
Status badge (green=active, yellow=trial, red=suspended, grey=churned)
Subscription Tier
Super Admin name + email
Trial Ends (red highlight if < 3 days)
Last Activity
Health Score (0–100, color-coded bar)
Actions: [View] [Edit] [Suspend] [Send Reset Link]


 Health Score Algorithm:

+30 pts: Active subscription
+20 pts: Logged in within last 7 days
+20 pts: Has at least 1 knowledge base document with status 'ready'
+15 pts: Has more than 1 team member
+15 pts: AI settings have been customized
0–40 = red, 41–70 = yellow, 71–100 = green


 Quick Actions Panel: Add New Company, Export All Companies CSV.

4.2 Company Detail Page (/hq/companies/[id])
Tabs:
Overview: Company details form, trial expiry picker with "Extend Trial", health score breakdown.
Team: All members with roles. "Send Password Reset" per user (triggers auth.resetPasswordForEmail() — never shows or sets passwords). "Remove Member", "Change Role" (cannot demote Super Admin). "Add Super Admin" transfer button.
Usage: Placeholder charts using mock data (line chart: messages/day last 30 days; donut: AI resolution rate; bar: documents uploaded). Charts must accept real data props later — do not hardcode values.
Knowledge Base (HQ): **Presence only** — show whether the client has any KB items and the **count** (e.g. for support triage). Do **not** list filenames, types, dates, FAQ text, or open/download Storage; that content stays in the Business Portal for privacy.
Settings (read-only for HQ): Display current tenant_settings. Chaster Super Admin can override subscription_tier and status only.
Audit Log: Chronological table — Date/Time, Actor, Action, Target, Details.
4.3 Add New Company Flow (/hq/companies/new)

 Form: Company Name, Super Admin Email, Subscription Tier, Trial End Date (optional).
 On submit:

Insert row into tenants
Send invite email via Supabase Auth
On signup: auto-insert into tenant_members as super_admin
Log action in audit_logs
Show success toast




🗂️ PHASE 5 — Client Side (Business Portal) UI
5.1 Portal Dashboard (/portal/dashboard)

 Welcome header: "Welcome back, [First Name] — [Company Name] CRM"
 Stats row: Total Conversations, AI Resolved Today, Team Members, Knowledge Base Documents.
 Quick Setup Checklist (disappears when all steps done):

Upload your first knowledge base document
Customize your AI settings
Invite a team member
Copy your widget embed code


 Subscription trial banner if applicable: "X days remaining. [Upgrade Now]"

5.2 Knowledge Base Manager (/portal/knowledge-base)
Must be fully functional with real Supabase Storage.

 Document list table: File name (clickable), Type badge, File size, Uploaded by, Upload date, Status badge, Actions: [Preview] [Delete].
 Upload flow:

Drag-and-drop + "Browse Files" button
Accept: .pdf, .txt, .md — max 10MB
On upload: store to knowledge-base/{tenant_id}/{uuid}-{filename}, insert DB row with status processing, show progress bar, update to ready on success, show success toast.
On error: descriptive toast (file too large, wrong type, etc.)


 Delete flow: Confirmation modal → delete from Storage + DB → log in audit_logs. Admins and Super Admins only (<PermissionGate>).
 Add FAQ: Button → modal with Question + Answer fields → saves as file_type = 'faq' row with content as JSON.

5.3 Team Management (/portal/team)

 Member list: Name, Email, Role badge, Joined date, Last seen, Actions.
 Invite member: Modal with Email + Role selector (Member or Admin only) → Supabase Auth invite. Pending invites section with "Resend" and "Cancel".
 Role management: Inline dropdown. Admins can change Member↔Admin but cannot touch other Admins. Super Admin can change any role. Every change logged in audit_logs.
 Remove member: Confirmation modal. Cannot remove yourself or the Super Admin. Logged.
 Transfer Super Admin: Button visible only to current Super Admin → modal to select new holder → atomic Postgres transaction to swap roles.

5.4 AI & Widget Settings (/portal/settings)

 AI Configuration:

Tone selector: Professional / Casual / Technical (radio buttons with descriptions)
Escalation threshold: Slider 0–100%
Business hours: Start + End time + Timezone dropdown
Save button → updates tenant_settings


 Widget Configuration:

Primary color picker (hex + swatch)
Welcome message text input
Position toggle: Bottom-left / Bottom-right
Live mini-preview that updates as settings change
"Copy Embed Code" button (placeholder script snippet for now)
Save button


 Sandbox Tester:

Simple chat UI on the page
Placeholder response: "AI testing will be available once your knowledge base is indexed."
UI must be fully built as a component — just the AI call is mocked for now



5.5 Subscription & Usage (/portal/subscription)

 Current plan display with features list and renewal date.
 Usage meters (all placeholder, must accept real data later):

AI Conversations this month: X / 500
Knowledge Base Storage: X MB / 100 MB
Team Members: X / 5


 Upgrade prompt if on Starter tier.
 Billing history table (placeholder rows — real billing via Stripe in a future phase).


🗂️ PHASE 6 — Shared UI & UX Requirements
6.1 Navigation
HQ Sidebar: Dashboard, Companies, Analytics (placeholder), Platform Settings (Super Admin only), Chaster Team, Notifications (placeholder).
Portal Sidebar: Dashboard, Knowledge Base, Team, Settings, Subscription & Usage, Conversations (placeholder — future phase).

 Active nav item highlighted.
 Sidebar collapsible on mobile.

6.2 Notifications & Toasts

 Success actions → green toast (top-right, auto-dismiss 4s).
 Errors → red toast with message.
 Destructive actions always require a confirmation modal first.
 Single global toast provider — no duplicate toasts.

6.3 Loading & Empty States
Every data-fetching component must have:

 Skeleton loader while loading
 Empty state with illustration + message when no data
 Error state with "Try Again" button if fetch fails

6.4 Audit Log Utility

 Create logAuditEvent(action, targetUserId?, metadata?) utility function.
 Call after EVERY significant action: role changes, uploads, deletes, invites, setting changes, logins.
 Automatically detects current user and tenant from auth context.


🗂️ PHASE 7 — Auth & Onboarding Flows
7.1 Login Page

 Rebrand with Chaster styling.
 "Forgot Password" → resetPasswordForEmail().
 After login → redirect based on user type (HQ vs Portal).
 Generic error message for wrong credentials (never reveal which field is wrong).

7.2 Invite Acceptance Flow

 New Super Admin invite link → "Complete Your Account" page (set name + password) → added to tenant_members as super_admin → redirect to portal.
 New Member/Admin invite → same page → added with their assigned role.

7.3 Password Reset Flow

 Forgot Password → email → Supabase reset link → "Set New Password" page → redirect to login with success message.


🗂️ PHASE 8 — Final Verification Checklist
As Chaster Owner (HQ):

 Login → land on /hq → see all 3 seed companies with correct data.
 Click company → all tabs show correct seeded data.
 **Team tab:** as **Chaster admin+**, “Send password reset” triggers recovery email (Edge `hq_tenant_actions`).
 **Overview:** health score breakdown matches directory; extend trial +7/+14 updates `trial_ends_at`.
 **Usage tab:** charts render (placeholder data until analytics exist).
 **Directory:** Chaster admin+ can **Suspend**, **Reactivate** (active or trial), and **Reset admin** password (owner).
 Change client subscription tier → reflects in client portal.
 Add new company → invite email sent.

As Client Super Admin:

 Login → land on /portal/dashboard → correct company name in title and header.
 Upload PDF → appears in knowledge base with status "Ready".
 Delete document → removed from Storage and DB.
 Invite member → email received.
 Promote member to Admin → role badge updates.
 Change AI tone → persists on page refresh.
 Copy widget embed code → clipboard works.

As Client Admin:

 Can invite members and promote them.
 Cannot access billing or subscription.
 Cannot touch other Admin accounts.

As Client Member:

 Can view dashboard and knowledge base; **can upload** files/FAQs; **cannot delete** KB items.
 Cannot invite or change roles.
 Cannot access Settings or Subscription pages.

Security checks:

 Navigating to /hq as a client user redirects away.
 Fetching another tenant's documents returns 0 rows (RLS working).
 Password reset never exposes a password anywhere in the UI or API response.


🧾 Checkout provisioning & client tenants (baseline)

- **Edge Function `provision_tenant`**: server-only `POST` to `/functions/v1/provision_tenant` with JSON `{ "email", "company_name", "first_name?", "last_name?", "subscription_tier?", "status?", "slug?", "notes?", "external_ref?" }` and header `Authorization: Bearer <CHASTER_PROVISIONING_SECRET>`. Creates a **tenant** + **tenant_settings**, sends **inviteUserByEmail** with `user_metadata.provisioned_tenant_id` so the purchaser sets their password from email and becomes **super_admin** of that company. Roll back tenant if the invite fails.
- **Landing / Stripe**: after successful payment, your backend calls `provision_tenant` with the checkout email and company name; optional `external_ref` (e.g. Stripe customer id) is appended to tenant `notes`.
- **Chaster staff manual path**: same **Users** invite as today; optional body fields **`tenant_id`** (UUID) + **`tenant_member_role`** (`super_admin` \| `admin` \| `member`) require the inviter to be in **`chaster_team`** and attach the invitee to that tenant via signup metadata (handled by `handle_new_user`).


📋 Outstanding vs shipped (high level)

- **Still open:** portal transfer super admin polish, §5.5 Stripe, §6.1 dedicated sidebars, §2.3 full seed script, real usage/conversation metrics everywhere marked placeholder.
- **Recently aligned with code:** §3.1 role tables, §4.2 HQ KB privacy, §8 member expectations, HQ password reset, HQ suspend/reactivate, KB upload progress, **§5.3 pending invites** (`tenant_invites`, portal resend/cancel, signup marks `accepted_at`).

📋 Notes for Cursor AI

Use Supabase JS v2 throughout. Do not use deprecated v1 APIs.
Use TypeScript for all new files. Define types for: Tenant, TenantMember, KnowledgeBaseDocument, AuditLog, TenantSettings.
Use the existing component library and styling system in Atomic CRM. Do not introduce a new UI library unless the existing one genuinely cannot support a required component.
Co-locate components with the pages that use them unless they are used in 3+ places.
Every Supabase query must handle errors explicitly — never silently fail.
Placeholder charts can use any charting library already in the project, or recharts if none exists.
All seed data must look realistic — use real-sounding names, emails, and dates.
Do not hardcode tenant IDs or user IDs anywhere in the frontend — always derive from auth context.