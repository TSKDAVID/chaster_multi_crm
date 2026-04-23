const DEFAULT_WELCOME = "Hi! How can I help you today?";

/** Same rules as `hq_get_tenant_directory` → `ai_customized`. */
export function isTenantAiCustomized(row: {
  ai_tone: string;
  escalation_threshold: number;
  widget_primary_color: string | null;
  widget_welcome_message: string | null;
} | null): boolean {
  if (!row) return false;
  return (
    row.ai_tone !== "professional" ||
    row.escalation_threshold !== 0.6 ||
    !["", "#6366f1"].includes(row.widget_primary_color ?? "") ||
    (row.widget_welcome_message ?? "") !== DEFAULT_WELCOME
  );
}
