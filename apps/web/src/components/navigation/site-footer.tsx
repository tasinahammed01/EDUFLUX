import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";

const groups = [
  { title: "Product", links: ["Features", "Pricing", "What's new"] },
  { title: "Solutions", links: ["Teachers", "Schools", "Students"] },
  { title: "Resources", links: ["Help center", "Guides", "Journal"] },
  { title: "Company", links: ["About", "Contact", "Careers"] }
];

export function SiteFooter() {
  return <footer className="site-footer"><Container><div className="footer-main"><div className="footer-brand"><Logo /><p>Calmer teaching workflows. Clearer student growth.</p><div className="socials"><Link href="#contact" aria-label="EduFlux social updates"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></Link><Link href="#contact" aria-label="EduFlux professional network"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9v9M6 6v.01M10 18v-5a4 4 0 018 0v5M10 9v9" /></svg></Link></div></div>{groups.map((group) => <nav key={group.title} aria-label={group.title}><h2>{group.title}</h2>{group.links.map((label) => <Link key={label} href="#contact">{label}</Link>)}</nav>)}</div><div className="footer-bottom"><p>© {new Date().getFullYear()} EduFlux. Demo experience.</p><div><Link href="#contact">Privacy</Link><Link href="#contact">Terms</Link><Link href="#contact">Cookies</Link></div></div></Container></footer>;
}
