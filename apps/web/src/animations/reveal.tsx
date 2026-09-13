"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.from(root.current, { y: 32, opacity: 0, duration: 0.85, ease: "power3.out", scrollTrigger: { trigger: root.current, start: "top 88%", once: true } });
  }, { scope: root });
  return <div ref={root} className={className}>{children}</div>;
}
