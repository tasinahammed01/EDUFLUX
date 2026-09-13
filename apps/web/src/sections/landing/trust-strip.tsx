import { ShieldCheck, Sparkles, TimerReset } from "lucide-react";
import { Container } from "@/components/ui/container";

export function TrustStrip() {
  return <section className="trust-strip" aria-label="Product principles"><Container><p>Built for the rhythm of real classrooms</p><div>{[[Sparkles,"Thoughtful AI"],[ShieldCheck,"Privacy-minded"],[TimerReset,"Teacher time, returned"]].map(([Icon,label]) => { const Mark = Icon as typeof Sparkles; return <span key={label as string}><Mark aria-hidden="true" />{label as string}</span>; })}</div></Container></section>;
}
