/**
 * Full page load to a path. Used for pages still served by Express (like
 * /login) where next/router client navigation does not apply.
 */
export function hardNavigate(path: string) {
  if (typeof window !== "undefined") window.location.href = path;
}
