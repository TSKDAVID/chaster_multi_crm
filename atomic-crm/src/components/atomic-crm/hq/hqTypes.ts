export type HqDashboardStats = {
  total_tenants: number;
  total_team_members: number;
  distinct_users: number;
  kb_documents_ready: number;
  new_tenants_7d: number;
};

export type HqTenantDirectoryRow = {
  id: string;
  company_name: string;
  slug: string;
  status: string;
  subscription_tier: string;
  trial_ends_at: string | null;
  owner_user_id: string | null;
  primary_contact_email: string | null;
  created_at: string;
  member_count: number;
  kb_ready_count: number;
  last_activity_at: string;
  ai_customized: boolean;
  health_score: number;
};
