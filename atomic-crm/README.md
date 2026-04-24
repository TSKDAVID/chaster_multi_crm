# Chaster CRM

Multi-tenant B2B CRM platform built with React, shadcn-admin-kit, and Supabase. This project extends the [Atomic CRM](https://github.com/marmelab/atomic-crm) template toward **Chaster** — HQ + client portal, strict tenant isolation (RLS), and white-label branding.

## Features

- **CRM core**: Contacts, companies, tasks, notes, deals (Kanban), activity, import/export
- **Auth**: Supabase Auth (email, SSO providers as configured)
- **Branding**: Default “Chaster CRM” title and lettermark logos; per-tenant titles planned in later phases

## Requirements

- Node 22 LTS (≥ 22.12 recommended for tooling)
- npm
- Docker (only if you run Supabase locally)
- Supabase CLI (for migrations / remote link)

## Quick start

```sh
cd atomic-crm
npm install
cp .env.development .env.development.local   # then add your Supabase URL + publishable key
npx supabase login
npx supabase link --project-ref <your-ref>
npm run db:push
npm run dev
```

### Database migrations (when you pull new code)

Whenever a teammate or Cursor adds a file under `supabase/migrations/`, your remote database will not pick it up until you apply it.

| Command | What it does |
|--------|----------------|
| **`npm run db:push`** | Push pending migration files to your **linked** Supabase project (non-interactive). |
| **`npm run db:push:preview`** | Dry-run: list migrations that would run, without applying. |
| **`npm run db:push:local`** | Apply to **local** Postgres (when using `supabase start` + Docker). |

**HQ “Add company”** calls the Edge Function **`hq_provision_tenant`**. Migrations do **not** deploy functions — after pulling new function code, run:

| Command | What it does |
|--------|----------------|
| **`npm run functions:deploy:hq`** | Deploy **`hq_provision_tenant`** to the linked Supabase project (`supabase login` + `supabase link` required). |
| **`npx supabase functions deploy users`** | Deploy the **`users`** Edge Function (invite/update/**delete** CRM users; delete requires `chaster_team.role = super_admin`). |

If the UI shows *“Failed to send a request to the Edge Function”*, the function was usually missing on the project or the browser blocked the network call; deploy the function and retry.

First-time or full reset on remote (roles + seed) can still use:

`npx supabase db push --include-roles --include-seed --yes --linked`

There is no safe way for the app or a repo script to migrate **your** cloud database without the Supabase CLI and your login — migrations must run against Postgres with sufficient privileges, which the CLI handles after `supabase login` + `supabase link`.

### Chaster multi-tenancy (migration `20260404140000_chaster_multitenancy.sql`)

This migration adds `tenants`, `tenant_members`, `tenant_settings`, knowledge-base tables, **tenant-scoped RLS** on CRM tables, and a seed tenant **`default-chaster`**. Existing data is backfilled onto that tenant; new auth users are linked via `handle_new_user`.

- **HQ / internal users:** insert their `auth.users.id` into `chaster_team` (SQL or Dashboard) so `is_chaster_staff()` is true and they can manage all tenants. In the app, **HQ dashboard → HQ platform team** (`/hq/platform-team`) lists Chaster staff and lets **HQ super admins** add users (must already have a CRM login) and change HQ roles. That is separate from **CRM user accounts** (`/sales`, everyone who can sign in) and **CRM workspace team** (`/hq/workspace/team`, `tenant_members` on your internal tenant). Migration `20260420120000_chaster_team_super_admin_rls.sql` restricts edits to `chaster_team` to HQ super admins only.

  ```sql
  update public.chaster_team
  set role = 'super_admin'
  where user_id = (select id from auth.users where lower(email) = lower('you@example.com') limit 1);
  ```
- **Knowledge base files:** use bucket `knowledge-base` with paths `{tenant_uuid}/filename`.

Open [http://localhost:5173](http://localhost:5173). Configure **Authentication → URL configuration** in Supabase (Site URL `http://localhost:5173`).

## GitHub Pages hosting (live CRM)

This repository includes a workflow at `.github/workflows/github-pages-crm.yml` that builds `atomic-crm` and deploys `dist/` to GitHub Pages.

### 1) GitHub repository settings

In your GitHub repo:

1. Go to **Settings -> Pages**.
2. Set **Source** to **GitHub Actions**.
3. Make sure pushes to `main` are enabled (or run the workflow manually from Actions).

### 2) Required GitHub secrets and variables

Set these in **Settings -> Secrets and variables -> Actions**:

- **Repository secrets**:
  - `VITE_SUPABASE_URL`
  - `VITE_SB_PUBLISHABLE_KEY`
- **Repository variables** (optional, only if used in your setup):
  - `VITE_INBOUND_EMAIL`
  - `VITE_ATTACHMENTS_BUCKET`
  - `VITE_GOOGLE_WORKPLACE_DOMAIN`
  - `VITE_DISABLE_EMAIL_PASSWORD_AUTHENTICATION`

After the workflow runs successfully, the app will be available at:

- `https://<github-username>.github.io/<repository-name>/`

### 3) Supabase auth URL configuration for Pages

In Supabase Dashboard -> **Authentication -> URL Configuration**:

- Set **Site URL** to your GitHub Pages URL, for example:
  - `https://<github-username>.github.io/<repository-name>/`
- Add **Redirect URLs** for:
  - `https://<github-username>.github.io/<repository-name>/`
  - `https://<github-username>.github.io/<repository-name>/set-password`
  - Any other auth callback paths you actively use

If redirect URLs are missing, invite/reset links will fail or bounce with errors.

### Invite & password reset (Supabase email links)

Recovery and invite emails open `https://<project>.supabase.co/auth/v1/verify?token=…&redirect_to=…` first; **Supabase validates the token on the server**, then redirects the browser to `redirect_to` with session material (typically in the URL **hash**).

**Redirect URL allowlist** (Dashboard → Authentication → URL configuration) must include every origin/path you use, for example:

- `http://localhost:5173`, `http://localhost:5173/`, `http://localhost:5173/set-password`
- Production: `https://yourdomain.com`, `https://yourdomain.com/set-password`
- GitHub Pages: `https://<github-username>.github.io/<repository-name>/`, `https://<github-username>.github.io/<repository-name>/set-password`

**Recommended:** set `redirect_to` in templates / APIs to **`http://localhost:5173/set-password`** (and the production equivalent) instead of only the site root, so users land directly on the password screen. The app also redirects from `/`, `/login`, or `/sign-up` to `/set-password` when the hash still contains Supabase auth parameters.

**Security (unchanged model):** Password is never set without **Supabase-issued** `access_token` / `refresh_token` from that verified redirect. The `/set-password` UI does not accept “reset by email address” alone; `invalidateCrmAuthIdentityCache` + navigation after success refresh CRM identity. If another user is already signed in on the same browser, the app offers **sign out and continue** before applying the invite/recovery session.

## Docs

See `doc/` for detailed guides and `AGENTS.md` for maintainer commands and architecture notes.

### HQ vs workspace RBAC rollout checklist

When deploying the HQ/workspace role split:

1. Apply latest migrations (`npm run db:push`) so role normalization functions and role backfill run.
2. Deploy edge functions that enforce new role model:
   - `npx supabase functions deploy tenant_team`
   - `npx supabase functions deploy hq_tenant_actions`
   - `npx supabase functions deploy users`
   - `npx supabase functions deploy hq_provision_tenant`
   - `npx supabase functions deploy provision_tenant`
3. Verify boundaries:
   - HQ support roles can read support queues but cannot run company write actions.
   - Workspace manager/admin can add workspace members, but cannot grant workspace owner directly.
   - Existing legacy roles still resolve correctly through compatibility mapping.

## License

Inherited from the upstream Atomic CRM stack; verify licenses of bundled dependencies for production use.
