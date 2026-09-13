"use client";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { createHeroMotion } from "./landing/hero-motion";
import { createMicroInteractions } from "./landing/micro-interactions";
import { createSectionMotion } from "./landing/section-motion";
gsap.registerPlugin(useGSAP,ScrollTrigger);
export function LandingMotion({children}:{children:React.ReactNode}){
 const root=useRef<HTMLDivElement>(null);
 useGSAP(()=>{const element=root.current;if(!element||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const cleanups:Array<()=>void>=[];const mm=gsap.matchMedia();
  mm.add("(min-width: 1200px)",()=>{const hero=createHeroMotion(element),sections=createSectionMotion(element),micro=createMicroInteractions(element);if(hero)cleanups.push(hero);cleanups.push(sections,micro)});
  mm.add("(min-width: 768px) and (max-width: 1199px)",()=>{const hero=createHeroMotion(element);if(hero)cleanups.push(hero)});
  const refresh=()=>ScrollTrigger.refresh();document.fonts?.ready.then(refresh);window.addEventListener("load",refresh,{once:true});
  return()=>{window.removeEventListener("load",refresh);cleanups.splice(0).forEach(cleanup=>cleanup());mm.revert()};
 },{scope:root});
 return <div ref={root} className="landing-motion">{children}</div>
}
