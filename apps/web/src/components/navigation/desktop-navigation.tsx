import Link from "next/link";

export const navigation = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#workflow" },
  { label: "Outcomes", href: "#outcomes" },
  { label: "Stories", href: "#stories" }
];

export function DesktopNavigation() {
  return <><nav className="desktop-nav" aria-label="Primary">{navigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav><div className="desktop-actions"><Link className="text-link" href="/login">Sign in</Link><Link className="button button-small button-primary magnetic" href="/register"><span>Start teaching</span></Link></div></>;
}
