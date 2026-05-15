-- Case closure reason (Salesforce-style) for HQ agents.

alter table public.support_cases
    add column if not exists closure_reason text,
    add column if not exists closure_note text;

alter table public.support_cases
    drop constraint if exists support_cases_closure_reason_check;

alter table public.support_cases
    add constraint support_cases_closure_reason_check
    check (
        closure_reason is null
        or closure_reason in (
            'resolved',
            'pending_customer',
            'duplicate',
            'cannot_resolve',
            'spam',
            'cancelled'
        )
    );

comment on column public.support_cases.closure_reason is
    'Why the case was closed; drives reopen UX and reporting.';
comment on column public.support_cases.closure_note is
    'Optional agent note when closing the case.';
