import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { select, selectAll } from "./motion-utils";
export function createSectionMotion(root:HTMLElement){
 const triggers:ScrollTrigger[]=[];
 const panels=selectAll<HTMLElement>(root,".feature-story");
 panels.forEach((panel,index)=>triggers.push(ScrollTrigger.create({trigger:panel,start:"top center",end:"bottom center",onToggle:({isActive})=>{if(isActive)root.style.setProperty("--feature-index",`"${String(index+1).padStart(2,"0")}"`)},onEnter:()=>gsap.to(panel,{opacity:1,scale:1,duration:.4}),onLeave:()=>gsap.to(panel,{opacity:.42,scale:.965,duration:.4}),onEnterBack:()=>gsap.to(panel,{opacity:1,scale:1,duration:.4}),onLeaveBack:()=>gsap.to(panel,{opacity:.42,scale:.965,duration:.4})})));
 const track=select<HTMLElement>(root,".workflow-scenes"),section=select<HTMLElement>(root,".workflow-section");
 if(track&&section){const distance=()=>Math.max(0,track.scrollWidth-section.clientWidth);gsap.to(track,{x:()=>-distance(),ease:"none",scrollTrigger:{trigger:section,start:"top top+=66",end:()=>`+=${distance()}`,pin:true,scrub:1,invalidateOnRefresh:true,onUpdate:self=>root.style.setProperty("--workflow-progress",String(self.progress))}})}
 const chart=select(root,".analytics-chart-line");if(chart)gsap.fromTo(chart,{strokeDashoffset:1100},{strokeDashoffset:0,duration:1.8,ease:"power2.out",scrollTrigger:{trigger:select(root,".analytics-stage"),start:"top 72%",once:true}});
 gsap.from(selectAll(root,".analytics-metric,.analytics-bar i,.analytics-marker"),{y:18,scaleX:.25,opacity:0,stagger:.1,duration:.65,scrollTrigger:{trigger:select(root,".analytics-stage"),start:"top 72%",once:true}});
 gsap.from(selectAll(root,".editorial-line > span"),{yPercent:110,stagger:.12,duration:.9,ease:"power3.out",scrollTrigger:{trigger:select(root,".editorial-story"),start:"top 72%",once:true}});
 return()=>triggers.forEach(trigger=>trigger.kill());
}
