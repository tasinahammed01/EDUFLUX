import { AnalyticsShowcase } from "@/sections/landing/analytics-showcase";
import { Features } from "@/sections/landing/features";
import { FinalCta } from "@/sections/landing/final-cta";
import { Hero } from "@/sections/landing/hero/hero";
import { Testimonials } from "@/sections/landing/testimonials";
import { TrustStrip } from "@/sections/landing/trust-strip";
import { Workflow } from "@/sections/landing/workflow";
import { EditorialStory } from "@/sections/landing/editorial-story";
import { LandingMotion } from "@/animations/landing-motion";

export default function HomePage() {
  return <main><LandingMotion><Hero /><TrustStrip /><Features /><Workflow /><AnalyticsShowcase /><EditorialStory /><Testimonials /><FinalCta /></LandingMotion></main>;
}
