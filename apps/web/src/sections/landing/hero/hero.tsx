import { ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import { HeroExperience } from "./hero-experience";

export function Hero() {
  return <section className="hero"><div data-header-marker className="header-marker" /><div className="hero-aurora" aria-hidden="true" /><div className="hero-layout"><div className="hero-copy"><p className="hero-kicker">A clearer view of learning</p><h1><span className="hero-line"><span>Teach with clarity.</span></span><span className="hero-line"><span>Help every mind</span></span><span className="hero-line serif"><span>move forward.</span></span></h1><p className="hero-lead">Planning, feedback, and progress in one calm workspace—so you can spend less time managing work and more time understanding students.</p><div className="hero-actions"><Link className="button button-primary magnetic" href="/register"><span>Join Now</span><ArrowRight aria-hidden="true" /></Link><Link className="button button-secondary" href="#workflow"><Play aria-hidden="true" /> Explore EduFlux</Link></div><div className="hero-proof"><span>Built around teachers</span><i /><span>Human judgement stays in control</span></div></div><HeroExperience /></div></section>;
}
