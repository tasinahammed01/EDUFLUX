import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="auth-shell"><header><Logo /><Link href="/">Back to homepage</Link></header><div className="auth-orb" aria-hidden="true" /><section className="auth-frame"><div className="auth-intro"><p className="eyebrow">A calmer classroom starts here</p><h1>Teaching intelligence,<br />beautifully connected.</h1><p>Plan with clarity, guide every learner, and keep the human judgement that matters most.</p><ul><li>Secure, server-side sessions</li><li>Teacher-controlled learning workflows</li><li>A focused home for every class</li></ul></div>{children}</section></main>;
}
