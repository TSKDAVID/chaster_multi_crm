const MAX_TEXT_LENGTH = 2000;

export function sanitizeOutgoingMessage(input: string): string {
  const withoutControls = input.replace(/[\u0000-\u001F\u007F]/g, " ");
  return withoutControls.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}
