/**
 * Pages the Next app serves itself. Every other path is still an Express (EJS)
 * page, so links to it must be a plain <a> (full page load), not next/link.
 *
 * When you migrate a page: add its path here, and add it to `matcher` in
 * src/proxy.ts if it needs a signed-in user.
 */
export const NEXT_ROUTES = new Set<string>(["/status"]);

export function isNextRoute(href: string): boolean {
  return NEXT_ROUTES.has(href.split(/[?#]/)[0]);
}
