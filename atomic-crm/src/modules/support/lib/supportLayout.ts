/** Vertical space below the global app header (HQ nav). */
export const CHASTER_HEADER_OFFSET = "7.5rem";

export const SUPPORT_VIEWPORT_HEIGHT = `calc(100dvh - ${CHASTER_HEADER_OFFSET})`;

export function isSupportViewportRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/hq/support") || pathname.startsWith("/portal/support")
  );
}
