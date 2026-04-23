/**
 * Placeholder install snippet for the future hosted widget loader.
 * Values mirror current portal form state so teams can paste into static sites for dry-runs.
 */
export function buildChasterEmbedSnippet(params: {
  tenantId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  primaryColor: string;
  welcomeMessage: string;
  position: string;
}): string {
  const cfg = {
    tenantId: params.tenantId,
    supabaseUrl: params.supabaseUrl,
    supabaseAnonKey: params.supabaseAnonKey,
    appearance: {
      primaryColor: params.primaryColor,
      welcomeMessage: params.welcomeMessage,
      position: params.position,
    },
  };
  return [
    "<!-- Chaster chat widget (preview). Hosted loader script URL will ship separately. -->",
    "<script>",
    `window.__CHASTER_WIDGET__ = ${JSON.stringify(cfg)};`,
    "</script>",
  ].join("\n");
}
