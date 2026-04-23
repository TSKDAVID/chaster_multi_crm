import type { Db } from "./types";

/** Fixed UUID for FakeRest demo data (mirrors single-tenant dev). */
export const FAKE_REST_DEMO_TENANT_ID = "00000000-0000-4000-8000-000000000001";

export const finalize = (db: Db) => {
  for (const c of db.companies) {
    c.tenant_id = FAKE_REST_DEMO_TENANT_ID;
  }
  for (const co of db.contacts) {
    co.tenant_id = FAKE_REST_DEMO_TENANT_ID;
  }
  for (const n of db.contact_notes) {
    n.tenant_id = FAKE_REST_DEMO_TENANT_ID;
  }
  for (const d of db.deals) {
    d.tenant_id = FAKE_REST_DEMO_TENANT_ID;
  }
  for (const dn of db.deal_notes) {
    dn.tenant_id = FAKE_REST_DEMO_TENANT_ID;
  }
  for (const t of db.tasks) {
    t.tenant_id = FAKE_REST_DEMO_TENANT_ID;
  }
  for (const g of db.tags) {
    g.tenant_id = FAKE_REST_DEMO_TENANT_ID;
  }

  // set contact status according to the latest note
  db.contact_notes
    .sort((a, b) => new Date(a.date).valueOf() - new Date(b.date).valueOf())
    .forEach((note) => {
      db.contacts[note.contact_id as number].status = note.status;
    });
};
