-- Expose tenant_id on activity_log so portal / workspace dashboards can filter
-- out other tenants without relying on ambiguous client-side filters alone.

create or replace view "public"."activity_log"
    with (security_invoker=on)
    as
SELECT
    'company.' || c.id || '.created' as id,
    'company.created' as type,
    c.created_at as date,
    c.id as company_id,
    c.sales_id,
    c.tenant_id as tenant_id,
    to_json(c.*) as company,
    NULL::json as contact,
    NULL::json as deal,
    NULL::json as contact_note,
    NULL::json as deal_note
FROM companies c
UNION ALL
SELECT
    'contact.' || co.id || '.created',
    'contact.created',
    co.first_seen,
    co.company_id,
    co.sales_id,
    c_co.tenant_id as tenant_id,
    NULL::json,
    to_json(co.*),
    NULL::json,
    NULL::json,
    NULL::json
FROM contacts co
JOIN companies c_co ON c_co.id = co.company_id
UNION ALL
SELECT
    'contactNote.' || cn.id || '.created',
    'contactNote.created',
    cn.date,
    co.company_id,
    cn.sales_id,
    c_cn.tenant_id as tenant_id,
    NULL::json,
    NULL::json,
    NULL::json,
    to_json(cn.*),
    NULL::json
FROM contact_notes cn
LEFT JOIN contacts co ON co.id = cn.contact_id
LEFT JOIN companies c_cn ON c_cn.id = co.company_id
UNION ALL
SELECT
    'deal.' || d.id || '.created',
    'deal.created',
    d.created_at,
    d.company_id,
    d.sales_id,
    c_d.tenant_id as tenant_id,
    NULL::json,
    NULL::json,
    to_json(d.*),
    NULL::json,
    NULL::json
FROM deals d
JOIN companies c_d ON c_d.id = d.company_id
UNION ALL
SELECT
    'dealNote.' || dn.id || '.created',
    'dealNote.created',
    dn.date,
    d.company_id,
    dn.sales_id,
    c_dn.tenant_id as tenant_id,
    NULL::json,
    NULL::json,
    NULL::json,
    NULL::json,
    to_json(dn.*)
FROM deal_notes dn
LEFT JOIN deals d ON d.id = dn.deal_id
LEFT JOIN companies c_dn ON c_dn.id = d.company_id;
