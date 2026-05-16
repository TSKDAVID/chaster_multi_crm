export function isSupportViewportRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/hq/support") || pathname.startsWith("/portal/support")
  );
}
