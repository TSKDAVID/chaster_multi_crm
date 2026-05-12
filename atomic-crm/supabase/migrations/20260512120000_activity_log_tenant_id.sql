-- Expose tenant_id on activity_log so portal / workspace dashboards can filter
-- out other tenants. tenant_id MUST be the last column per branch so
-- CREATE OR REPLACE VIEW does not reorder existing columns (PG rejects that).

CREATE OR REPLACE VIEW "public"."activity_log"
    WITH (SECURITY_INVOKER=ON)
    AS
SELECT
    'company.' || c.id || '.created' AS id,
    'company.created' AS type,
    c.created_at AS date,
    c.id AS company_id,
    c.sales_id,
    to_json(c.*) AS company,
    NULL::json AS contact,
    NULL::json AS deal,
    NULL::json AS contact_note,
    NULL::json AS deal_note,
    c.tenant_id AS tenant_id
FROM companies c
UNION ALL
SELECT
    'contact.' || co.id || '.created',
    'contact.created',
    co.first_seen,
    co.company_id,
    co.sales_id,
    NULL::json,
    to_json(co.*),
    NULL::json,
    NULL::json,
    NULL::json,
    c_co.tenant_id AS tenant_id
FROM contacts co
JOIN companies c_co ON c_co.id = co.company_id
UNION ALL
SELECT
    'contactNote.' || cn.id || '.created',
    'contactNote.created',
    cn.date,
    co.company_id,
    cn.sales_id,
    NULL::json,
    NULL::json,
    NULL::json,
    to_json(cn.*),
    NULL::json,
    c_cn.tenant_id AS tenant_id
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
    NULL::json,
    NULL::json,
    to_json(d.*),
    NULL::json,
    NULL::json,
    c_d.tenant_id AS tenant_id
FROM deals d
JOIN companies c_d ON c_d.id = d.company_id
UNION ALL
SELECT
    'dealNote.' || dn.id || '.created',
    'dealNote.created',
    dn.date,
    d.company_id,
    dn.sales_id,
    NULL::json,
    NULL::json,
    NULL::json,
    NULL::json,
    to_json(dn.*),
    c_dn.tenant_id AS tenant_id
FROM deal_notes dn
LEFT JOIN deals d ON d.id = dn.deal_id
LEFT JOIN companies c_dn ON c_dn.id = d.company_id;
