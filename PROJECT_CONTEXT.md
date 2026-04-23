# Chaster Multi CRM - Context For Future Chats

This file is a high-signal orientation note for anyone (human or AI) opening this workspace without prior context.

## What this repository is

- Root folder: `chaster_multi_crm/`
- Main runnable app: `atomic-crm/`
- This root acts as a wrapper/workspace around the app and planning docs.

In short: this is a multi-tenant CRM platform for **Chaster**, built on top of the Atomic CRM stack and customized heavily for Chaster's business model.

## What "Chaster" means in this project

Chaster has two sides inside one product:

- **HQ side (internal staff):**
  - Runs platform operations.
  - Manages companies/tenants.
  - Handles platform-level support and administration.
  - Routes are mainly under `"/hq"` and related pages.

- **Client side (tenant portal):**
  - Each company uses its own workspace.
  - Manages team members, settings, and tenant data.
  - Routes are mainly under `"/portal"` and tenant-facing areas.

The core idea is: one codebase, two operational experiences, strict tenant separation.

## Core architecture

- Frontend: React + TypeScript + Vite
- UI base: shadcn-admin-kit/Atomic CRM style stack
- Backend/data/auth: Supabase
- Authorization model: row-level security (RLS) in Postgres
- Multi-tenant data model: tenant-aware tables and membership mappings

The project assumes database-level security is the source of truth. UI checks are helpful but not trusted alone.

## Auth and invite model (important)

- Supabase invite/reset links validate token server-side, then redirect with auth data in URL hash.
- The app now distinguishes:
  - **Success hash payloads** -> continue set-password/session flows
  - **Error hash payloads** (like `otp_expired`) -> go to `/auth/invite-error`
- There is dedicated UX for expired/invalid links to avoid blank or confusing pages.

Why this matters: invite/recovery bugs are usually URL/hash parsing + routing timing issues, not just UI bugs.

## Realtime model (important)

Unread counters in messaging/support use Supabase Realtime subscriptions.

Known pitfall that was fixed:
- Do not reuse a single static channel name across mounted hook instances.
- Reused names can cause callback registration after `subscribe()` and crash with errors similar to:
  - "cannot add `postgres_changes` callbacks ... after `subscribe()`"
- Current fix pattern: generate unique channel names per hook instance and clean up on unmount.

## Current project intent/status (high level)

This codebase is in an active "build out Chaster-specific features" phase:

- Multi-tenancy foundation and routing split are in place.
- HQ directory/company operations are implemented at MVP level.
- Portal features (KB/team/settings) are partially shipped.
- Realtime + auth hardening is ongoing as issues appear in real usage.

For roadmap-level detail, read:
- `atomic-crm/ideas.md` (canonical checklist)
- `plan.md` (rewind/status summary)

## How to run locally

From `atomic-crm/`:

1. Install Node LTS (Node must work in PATH: `node -v`, `npm -v`)
2. `npm install`
3. Configure `.env` with Supabase URL + publishable key
4. Link Supabase project via CLI when needed
5. Apply migrations (`npm run db:push`)
6. Start app (`npm run dev`)

If dev server fails with platform-specific `esbuild` errors, do a clean reinstall of `node_modules` on the current OS.

## Operational rules for future changes

1. Treat `atomic-crm/` as the main app boundary unless explicitly asked otherwise.
2. Preserve tenant isolation assumptions (RLS first, UI second).
3. For auth URLs, always handle both success and error hash paths.
4. For realtime subscriptions, avoid static shared channel names when hooks can mount more than once.
5. When touching routing/auth, test both desktop and mobile route blocks if both exist.
6. Keep user-visible failure states explicit (no blank shells on auth/realtime failures).

## Where to start when debugging

- Auth/invite redirects:
  - `atomic-crm/src/components/atomic-crm/auth/`
  - `supabaseAuthUrl.ts`, `SupabaseAuthHashRedirect.tsx`, invite error route/page
- App route registration:
  - `atomic-crm/src/components/atomic-crm/root/CRM.tsx`
- Supabase auth provider behavior:
  - `atomic-crm/src/components/atomic-crm/providers/supabase/authProvider.ts`
- Messaging/support realtime unread hooks:
  - `atomic-crm/src/modules/messaging/hooks/`
  - `atomic-crm/src/modules/support/hooks/`

## One-line mental model

This is a Supabase-backed, multi-tenant CRM where Chaster HQ and client portals share one frontend codebase, and correctness depends heavily on careful auth URL handling, route guards, RLS, and clean realtime subscription lifecycle management.

## Chaster Brain subproject (important, separate service)

There is now a separate service under `chaster-brain/` that is intentionally outside the main `atomic-crm/` app runtime.

### First 5 checks (fast handoff)

1. Is the stack running via `.\start-chaster-dev.ps1` and are both API/dashboard reachable?
2. Is `GROQ_API_KEY` present and `GROQ_MODEL` set (recommended `llama-3.3-70b-versatile`) in `chaster-brain/.env`?
3. Is `CHASTER_BRAIN_DEV_GATEWAY_SECRET` set (if using simulator without JWT) and matching dashboard dev secret input/env?
4. Were Supabase migrations applied, especially `20260421140000_chaster_brain_faq_trgm.sql`?
5. Does the tenant actually have rows in `knowledge_chunks` after indexing?

### What it is

- Purpose: AI support gateway + orchestration layer + dashboard simulator/control plane.
- Stack:
  - Backend: FastAPI + LangGraph-like node flow
  - LLM generation: Groq chat completion API
  - Data/control plane: Supabase (REST + SQL migrations)
  - Dashboard: Vite + React + TypeScript

### Key directories/files

- Backend entry: `chaster-brain/app/main.py`
- Security checks: `chaster-brain/app/gateway/service.py`
- Orchestration graph: `chaster-brain/app/orchestrator/graph.py`
- Orchestration nodes: `chaster-brain/app/orchestrator/nodes.py`
- LLM call/fallback: `chaster-brain/app/orchestrator/llm.py`
- FAQ retrieval: `chaster-brain/app/rag/retriever.py`
- Indexing pipeline: `chaster-brain/app/indexing/pipeline.py`
- DB REST client: `chaster-brain/app/db/client.py`
- Dashboard app: `chaster-brain/dashboard/src/App.tsx`
- Dashboard API client: `chaster-brain/dashboard/src/api.ts`
- Architecture doc: `chaster-brain/ARCHITECTURE_MAP.md`

### Current runtime flow (factual)

1. Dashboard simulator (or widget-like client) calls `/v1/gateway/message`.
2. API validates security:
   - JWT OR local dev secret bypass (`X-Chaster-Dev-Secret`)
   - signature/timestamp/nonce/origin checks
3. Request enters orchestrator:
   - intent classifier
   - FAQ path or personal path
   - confidence node
4. FAQ path retrieves context from `knowledge_chunks` (tenant-scoped) and calls Groq for final wording.
5. Personal path uses MCP stub data source and calls Groq.
6. Final response returned with `intent`, `confidence`, `used_sources`.

### Important behavior decisions already made

- JWT tenant matching:
  - If JWT lacks `tenant_id`, gateway can validate membership via `tenant_members`.
- Dev bypass:
  - If `CHASTER_BRAIN_DEV_GATEWAY_SECRET` is set and request header matches, JWT is skipped.
  - HMAC/origin/replay checks still apply.
- Confidence override:
  - Low-confidence "please provide identifier" override is only for personal/account-like intent, not FAQ/general greetings.
- FAQ retrieval currently uses Postgres trigram search (`pg_trgm`) rather than paid embedding APIs.

### Migrations added for Chaster Brain

Located under `atomic-crm/supabase/migrations/`:

- `20260420130000_chaster_brain_knowledge_chunks.sql`
- `20260420140000_chaster_brain_app_configurations.sql`
- `20260420150000_chaster_brain_control_plane.sql`
- `20260421120000_chaster_brain_match_knowledge_chunks.sql` (older vector match function)
- `20260421140000_chaster_brain_faq_trgm.sql` (current trigram FAQ matching path; embedding nullable)

Note: `20260421140000...` reflects the current retrieval approach and should be applied for current behavior.

### Environment variables for this subproject

In `chaster-brain/.env`:

- Required:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_JWT_ISSUER`
  - `SUPABASE_JWKS_URL`
  - `GROQ_API_KEY`
- Common:
  - `GROQ_MODEL` (recommended: `llama-3.3-70b-versatile`)
  - `GROQ_API_BASE_URL` (default `https://api.groq.com/openai/v1`)
  - `SIGNATURE_MAX_AGE_SECONDS`
  - `CHASTER_BRAIN_DEV_GATEWAY_SECRET` (local dev only)

In `chaster-brain/dashboard/.env`:

- `VITE_API_BASE_URL` (usually `http://127.0.0.1:8010`)
- Optional: `VITE_CHASTER_DEV_GATEWAY_SECRET` (local simulator convenience)

### How to run Chaster Brain quickly

- One-command launcher from repo root:
  - `.\start-chaster-dev.ps1`
- Under the hood:
  - `chaster-brain/scripts/dev_stack.py` starts API + dashboard in one terminal with prefixed logs.
- Stop both:
  - `Ctrl+C` in the launcher terminal.

### Known pitfalls to remember

- If simulator says it cannot reach LLM:
  - validate `GROQ_API_KEY` and `GROQ_MODEL`.
- If simulator says missing bearer token while using dev secret:
  - ensure `CHASTER_BRAIN_DEV_GATEWAY_SECRET` on API matches dashboard header exactly.
- If FAQ answers seem static or off:
  - verify chunks exist for that tenant in `knowledge_chunks`.
  - verify trigram migration `20260421140000...` is applied.
- If indexing succeeds but answers do not improve:
  - check intent routing; some terms (order/refund/account/status) route to personal path by design.

### Public widget sprint (new)

- Widget package lives at `chaster-widget/` as a standalone Preact + TypeScript library bundle.
- Widget UI runs fully in Shadow DOM (`window.ChasterWidget.init`) for host-page CSS isolation.
- Compatibility endpoints now exist in `chaster-brain`:
  - `POST /v1/handshake`
  - `POST /v1/process`
- These endpoints preserve existing tenant/app/origin/HMAC security checks while adding short-lived widget session JWTs.
- Widget supports optional Supabase Realtime subscription for observer-only handover updates (`ai_handling`) and inbound message events.

### Public widget sprint (latest session update)

- Scope executed in this session:
  - Upgraded `chaster-widget` from basic demo UI to a production-style widget UX.
  - Added compatibility handshake/process behavior for browser embedding and security hardening in `chaster-brain`.
  - Added plain-English docs for non-coder orientation.

- New/updated major artifacts:
  - `chaster-widget/` created and actively used as standalone embeddable package.
  - `WIDGET_SYSTEM_GUIDE.md` added at repo root with plain-English architecture, runbook, troubleshooting, and diagram.
  - `chaster-brain/tests/test_gateway_api.py` expanded to cover handshake/process compatibility and guest-intake validation.

- Widget frontend architecture (current):
  - Entrypoint: `chaster-widget/src/index.tsx`
    - Exposes `window.ChasterWidget.init(...)`.
    - Supports script-tag auto-bootstrap via data attributes (`data-app-id`, `data-tenant-id`, `data-gateway-url`).
    - Requires `window.ChasterWidgetSigner` for secure request signatures in auto-bootstrap mode.
  - Core UI: `chaster-widget/src/App.tsx`
    - Premium dark enterprise-like design.
    - Minimize/open controls with motion transitions.
    - Guest intake step (name + email required in anonymous mode).
    - Message composer with typing states and clear sender role rendering.
    - Attachment picker support (up to 3 files, removable chips).
  - Security transport: `chaster-widget/src/securityClient.ts`
    - Handshake + process API calls.
    - Session token storage + expiry handling.
  - Styling: `chaster-widget/src/styles.ts`
    - Fully bundled CSS in Shadow DOM; no external CDN style dependencies.
  - Build output:
    - `dist/chaster-widget.iife.js` (embeddable script target)
    - `dist/chaster-widget.es.js`

- Widget attachment behavior (current):
  - Attachments are included in `metadata.attachments`.
  - Files <= 300KB include base64 payload (`content_base64`).
  - Larger files include metadata with `skipped_reason`.
  - Message can be sent with attachments only (fallback text used).
  - Note: backend currently receives attachment metadata but does not yet perform full document ingestion from this route.

- Backend compatibility/security changes (current):
  - `chaster-brain/app/models.py`
    - `WidgetHandshakeRequest` now includes `guest_name` and `guest_email`.
  - `chaster-brain/app/main.py`
    - `/v1/handshake` validates anonymous intake fields.
    - Zero-history intent implemented: each guest handshake attempts creating a fresh conversation session ID.
    - Session token claims include conversation and guest intake metadata.
    - `/v1/process` decodes session token and returns session conversation ID when available.
    - Fail-safe behavior added: if conversation insert fails (schema/env mismatch), handshake still succeeds so local UX testing can continue.
  - `chaster-brain/app/gateway/service.py`
    - Signature/origin/tenant validation is reusable via `validate_app_request_signature`.
  - Security model still enforces:
    - tenant/app binding
    - allowed origin check
    - HMAC signature check
    - replay guard (`timestamp` + `nonce`)

- Critical local run details learned in-session:
  - Python package install must run from `chaster-brain/`, not repo root:
    - `python -m pip install -e .[dev]`
  - Setuptools package discovery needed explicit config to avoid `['app', 'dashboard']` flat-layout error.
  - Use `python -m uvicorn ...` (not bare `uvicorn`) on this Windows environment.
  - Static server path depends on current directory:
    - If serving from repo root -> open `/chaster-widget/widget.html`
    - If serving from `chaster-widget` -> open `/widget.html`

- Environment/config updates needed for local widget flow:
  - `chaster-brain/.env` now requires/uses:
    - `CORS_ALLOW_ORIGINS` including `http://localhost:8080` and `http://127.0.0.1:8080`
    - `WIDGET_SESSION_SECRET`
    - `WIDGET_SESSION_TTL_SECONDS`
  - `public.app_configurations` must contain:
    - valid `app_id`
    - matching `tenant_id`
    - `hmac_secret` used by signer
    - `allowed_origins` including local page origin(s)

- Errors encountered and root causes:
  - `Replay guard rejected request` -> timestamp generation mismatch/expired timestamp.
  - `Unknown app_id` -> missing app row in `app_configurations`.
  - `Origin not allowed` -> origin missing in `app_configurations.allowed_origins`.
  - Browser `Failed to fetch` during intake -> backend conversation insert 400; now fail-safe patched for local continuity.
  - `404` when opening widget page -> wrong path for chosen `npx serve` working directory.

- Local end-to-end test status (session):
  - Handshake API succeeded and returned session token.
  - Process API succeeded and returned intent/confidence/response.
  - Widget UI rendered and interacted in browser with intake + send.
  - Backend tests and widget build passed after changes.

- Current known gap/follow-up:
  - Strict zero-history persistence should eventually be completed without fail-safe fallback by aligning conversation insert payload with actual production conversation schema/constraints in this Supabase project.

### Latest full-session update (landing flow + indexing + sandbox + auth/settings)

- Scope completed in this session:
  - Implemented a full public test acquisition flow (landing -> simulated checkout -> invite-first onboarding) with no real payments.
  - Added standalone runnable test app at repo root and mirrored CRM no-layout routes for in-app testing.
  - Implemented tenant module flags (CRM/widget) and surfaced them in portal subscription/settings.
  - Implemented auto-indexing for KB uploads from CRM:
    - txt/md indexing (upload -> control index -> chunks)
    - pdf indexing (upload -> backend extract text -> chunks)
  - Switched portal sandbox from mock reply mode to real `chaster-brain` retrieval path.
  - Fixed multiple auth/invite/session edge cases and profile password-reset behavior.
  - Applied reliability fixes around long-running processing and stuck local backend listeners.

- New standalone test app:
  - Path: `test-landing-flow/`
  - Purpose: independent local runner for simulated subscription onboarding against existing Supabase/edge functions.
  - Main files:
    - `test-landing-flow/src/App.tsx`
    - `test-landing-flow/src/api.ts`
    - `test-landing-flow/.env.example`
    - `test-landing-flow/README.md`
  - Runtime: Vite frontend calling `provision_tenant` directly with `VITE_CHASTER_PROVISIONING_SECRET`.

- Public CRM test routes added:
  - Registered in desktop + mobile no-layout route blocks in `atomic-crm/src/components/atomic-crm/root/CRM.tsx`:
    - `/landing-test`
    - `/checkout/test`
    - `/checkout/test/success`
  - Route components:
    - `atomic-crm/src/components/atomic-crm/public-test/LandingTestPage.tsx`
    - `atomic-crm/src/components/atomic-crm/public-test/CheckoutTestPage.tsx`
    - `atomic-crm/src/components/atomic-crm/public-test/CheckoutSuccessPage.tsx`
    - `atomic-crm/src/components/atomic-crm/public-test/provisioningClient.ts`
    - `atomic-crm/src/components/atomic-crm/public-test/types.ts`

- Provisioning + module access changes:
  - Edge function updated: `atomic-crm/supabase/functions/provision_tenant/index.ts`
    - Accepts module flags:
      - `enable_crm_module`
      - `enable_widget_module`
    - Persists into `tenant_settings`.
  - Migration added:
    - `atomic-crm/supabase/migrations/20260422120000_tenant_settings_module_flags.sql`
  - Schema snapshot updated:
    - `atomic-crm/supabase/schemas/01_tables.sql`
    - Added `tenant_settings.crm_module_enabled` and `tenant_settings.widget_module_enabled`.

- Portal UX updates for module flags:
  - `atomic-crm/src/components/atomic-crm/portal/PortalSubscriptionPage.tsx`
    - Shows CRM/widget module enabled/disabled status.
  - `atomic-crm/src/components/atomic-crm/portal/PortalTenantSettingsPage.tsx`
    - Widget controls/embed area now conditional on `widget_module_enabled`.
    - Shows explicit message when widget module is disabled.

- Invite/auth flow hardening and behavior updates:
  - `atomic-crm/src/components/atomic-crm/auth/SupabaseAuthHashRedirect.tsx`
    - Error redirects now use query params for `/auth/invite-error` instead of hash mutation patterns that conflicted with hash routing.
  - `atomic-crm/src/components/atomic-crm/auth/AuthInviteErrorPage.tsx`
    - Reads params from search first, hash second.
    - Removed history rewrite that caused malformed URLs (`.../invite-error#/settings`) and navigation breakage.
  - Set-password flow already requires:
    - password + confirm password match before continuation (`set-password-page.tsx`).

- Profile/change-password fix:
  - `atomic-crm/src/components/atomic-crm/providers/supabase/dataProvider.ts`
    - `updatePassword` switched from failing edge function path to direct Supabase auth reset:
      - `supabase.auth.getUser()`
      - `supabase.auth.resetPasswordForEmail(user.email, { redirectTo: <#/set-password> })`
    - Improved error surfacing.

- Settings page stability fix:
  - Runtime crash seen: `Cannot read properties of undefined (reading 'mount')`.
  - Immediate reliability workaround applied:
    - `atomic-crm/src/components/atomic-crm/settings/SettingsPage.tsx`
    - Replaced image editor widgets with plain logo URL inputs (`lightModeLogo.src`, `darkModeLogo.src`).
  - Additional precaution:
    - `ImageEditorField` dialog now mounts only when opened.

- Sandbox (Portal Settings) switched from mock to real backend:
  - Frontend:
    - `atomic-crm/src/components/atomic-crm/portal/PortalSettingsSandbox.tsx`
    - Calls `POST /v1/control/sandbox/message` with `{ tenant_id, message }`.
  - Backend endpoint added:
    - `chaster-brain/app/main.py`
    - `POST /v1/control/sandbox/message`
  - Models added:
    - `SandboxMessageRequest`, `SandboxMessageResponse` in `chaster-brain/app/models.py`
  - Note: this endpoint is control-plane style and should be hardened further with explicit auth/tenant-membership checks before production exposure.

- KB upload indexing from CRM (major):
  - Frontend trigger:
    - `atomic-crm/src/components/atomic-crm/portal/PortalKnowledgeBasePage.tsx`
  - Behavior:
    - txt/md upload:
      - stores doc row as `processing`
      - sends `source_type: "text"` with content and `source_ref` doc id
      - marks `ready`/`failed`
    - pdf upload:
      - stores doc row as `processing`
      - sends `source_type: "document"` with `source_ref` doc id
      - backend extracts+chunks text
      - marks `ready`/`failed`
  - Added client-side request timeout (~45s) to avoid indefinite spinner/hang; failed requests move doc to `failed`.

- Backend indexing pipeline upgrades for document support:
  - `chaster-brain/app/indexing/pipeline.py`
    - Refactor shared chunk insert helper.
    - Added `process_document_index_job`.
    - Added Supabase Storage download by `storage_path` (service-role request).
    - Added PDF extraction via `pypdf`.
    - Supports txt/text/md storage decode path too.
  - `chaster-brain/app/main.py`
    - `/v1/control/index` now supports both `source_type: "text"` and `source_type: "document"`.
  - Dependency added:
    - `pypdf>=5.4.0` in `chaster-brain/pyproject.toml`.
  - Local env install performed:
    - `python -m pip install pypdf`

- Tenant isolation status (important):
  - Retrieval path is tenant-scoped:
    - `retrieve_faq_context(...)` passes tenant id to trigram RPC and fallback table query.
    - `knowledge_chunks` queries are filtered by `tenant_id`.
  - Operational caveat:
    - Sandbox control endpoint currently trusts provided tenant id and does not enforce gateway-grade tenant auth checks yet.
    - Gateway/widget paths retain stronger signature/JWT/tenant checks.

- Env/config updates in this session:
  - `atomic-crm/.env.development` and `.env.e2e` now include:
    - `VITE_CHASTER_PROVISIONING_SECRET`
  - `test-landing-flow/.env`/`.env.example` use:
    - `VITE_SUPABASE_URL`
    - `VITE_CHASTER_PROVISIONING_SECRET`
  - `chaster-brain/.env` updated CORS allowlist to include CRM dev origin:
    - `http://localhost:5173`
    - `http://127.0.0.1:5173`

- Critical local runtime pitfalls learned this session:
  - PowerShell does not support `&&` in older shell mode used here; use `;` or conditional blocks.
  - Supabase CLI in this environment did not accept `--linked` on `secrets set`; use `--project-ref <ref>`.
  - Multiple `uvicorn`/python listeners can coexist on `127.0.0.1:8010` and cause requests to hit stale process with misleading logs.
    - Always verify single listener via `netstat -ano | Select-String 8010`.
  - If backend appears to receive nothing while UI shows `processing`, check:
    - stale backend process on same port,
    - CORS preflight for `http://localhost:5173`,
    - frontend hard refresh (ensure latest bundle).

- Session-level result summary:
  - Simulated onboarding flow implemented and locally runnable.
  - Invite-first credential delivery kept (no plaintext password).
  - CRM text/pdf KB indexing path implemented end-to-end.
  - Sandbox now tests real retrieval behavior against tenant KB.
  - Remaining recommended hardening: add auth+tenant membership validation to control-plane sandbox endpoint before production.
