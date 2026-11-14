import Link from "next/link";
import { isNextRoute } from "@/lib/routes";

type Props = Omit<React.ComponentProps<"a">, "href"> & { href: string };

/**
 * Link that works during the migration: pages Next serves use client-side
 * navigation, pages still served by Express use a normal full page load.
 */
export function AppLink({ href, children, ...rest }: Props) {
  if (isNextRoute(href)) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
