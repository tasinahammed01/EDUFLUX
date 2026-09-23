import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const navigation = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#workflow" },
  { label: "Outcomes", href: "#outcomes" },
  { label: "Stories", href: "#stories" }
];

export function DesktopNavigation() {
  return <><nav className="desktop-nav" aria-label="Primary">{navigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav><div className="desktop-actions"><ThemeToggle compact /><Link className="text-link" href="/login">Sign in</Link><Link className="button button-small button-primary magnetic" href="/register"><span>Join Now</span></Link></div></>;
}
