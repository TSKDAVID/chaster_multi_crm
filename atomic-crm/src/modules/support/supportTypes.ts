export type SupportCaseStatus =
  | "open"
  | "in_progress"
  | "pending_client"
  | "resolved";

export type SupportCaseCategory =
  | "billing"
  | "technical"
  | "account"
  | "ai_kb"
  | "widget"
  | "other";

export type SupportCasePriority = "low" | "medium" | "high" | "urgent";

export type SupportCaseSource =
  | "portal"
  | "phone"
  | "email"
  | "hq"
  | "other"
  | "prospect";

export type SupportAttachmentMeta = {
  storage_path: string;
  file_name: string;
  mime_type: string;
  size: number;
};

export type SupportRequesterRow = {
  id: string;
  created_at: string;
  organization_name: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  source_detail: string | null;
};

export type SupportCaseRow = {
  id: string;
  tenant_id: string | null;
  support_requester_id: string | null;
  case_number: string;
  subject: string;
  description?: string;
  category: SupportCaseCategory;
  status: SupportCaseStatus;
  created_by: string | null;
  assigned_to: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  priority: SupportCasePriority;
  source: SupportCaseSource;
  // SLA fields
  first_response_due_at?: string | null;
  resolution_due_at?: string | null;
  first_responded_at?: string | null;
  sla_response_breached?: boolean;
  sla_resolution_breached?: boolean;
  escalation_level?: number;
  escalated_at?: string | null;
  // Email-to-case fields
  source_email?: string | null;
  email_thread_id?: string | null;
  possible_duplicate_of?: string | null;
  duplicate_confidence?: number | null;
  merged_into_case_id?: string | null;
  merged_at?: string | null;
  merged_by?: string | null;
  // Enrichment fields
  tags?: string[];
  follow_up_at?: string | null;
  related_case_id?: string | null;
};

export type SupportCaseMessageRow = {
  id: string;
  case_id: string;
  sender_id: string | null;
  body: string;
  is_system: boolean;
  metadata: Record<string, unknown>;
  attachments: SupportAttachmentMeta[];
  created_at: string;
  edited_at?: string | null;
  email_message_id?: string | null;
  original_case_id?: string | null;
};

export type SupportFaqRow = {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  archived_at: string | null;
  tenant_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type SlaPolicyRow = {
  id: string;
  tenant_id: string | null;
  category: SupportCaseCategory;
  priority: SupportCasePriority;
  first_response_minutes: number;
  resolution_minutes: number;
  escalation_1_after_minutes: number;
  escalation_2_after_minutes: number;
  created_at: string;
  updated_at: string;
};

export type SlaEscalationLogRow = {
  id: string;
  case_id: string;
  from_level: number;
  to_level: number;
  reason: string;
  created_at: string;
};

export type CaseMergeLogRow = {
  id: string;
  source_case_id: string;
  target_case_id: string;
  action: "auto_merge" | "manual_merge" | "unmerge";
  performed_by: string | null;
  reason: string | null;
  messages_moved: string[];
  created_at: string;
};

export type UserRiskFlagRow = {
  id: string;
  user_id: string;
  tenant_id: string | null;
  flag_type: string;
  severity: "warning" | "high" | "critical";
  details: Record<string, unknown>;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
};

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
