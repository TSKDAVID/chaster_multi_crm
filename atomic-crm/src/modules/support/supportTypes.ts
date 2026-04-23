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
};

export type SupportFaqRow = {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
