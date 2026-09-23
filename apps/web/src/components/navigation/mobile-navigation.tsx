"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { navigation } from "./desktop-navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function MobileNavigation(){
  const [open,setOpen]=useState(false);const panelId=useId();const root=useRef<HTMLDivElement>(null);const panel=useRef<HTMLDivElement>(null);const button=useRef<HTMLButtonElement>(null);const timeline=useRef<gsap.core.Timeline|null>(null);
  useGSAP(()=>{if(typeof window.matchMedia!=="function"||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;timeline.current=gsap.timeline({paused:true}).to(".menu-overlay",{autoAlpha:1,duration:.2}).fromTo(".menu-panel",{xPercent:100,clipPath:"inset(0 0 0 100%)"},{xPercent:0,clipPath:"inset(0)",duration:.52,ease:"power3.out"},0).fromTo(".menu-panel nav a",{y:24,opacity:0},{y:0,opacity:1,stagger:.06,duration:.35},.18).fromTo(".menu-footer",{y:18,opacity:0},{y:0,opacity:1,duration:.3},.38);return()=>timeline.current?.kill()},{scope:root});
  useEffect(()=>{if(!timeline.current)return;if(open)timeline.current.play();else timeline.current.reverse()},[open]);
  useEffect(()=>{if(!open)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";panel.current?.querySelector<HTMLAnchorElement>("a")?.focus();const keys=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);button.current?.focus()}if(event.key==="Tab"&&panel.current){const items=[...panel.current.querySelectorAll<HTMLElement>("a,button")],first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};document.addEventListener("keydown",keys);return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",keys)}},[open]);
  const close=()=>setOpen(false);
  return <div ref={root} className="mobile-navigation"><button ref={button} className={`menu-toggle ${open?"is-open":""}`} type="button" aria-label={open?"Close navigation":"Open navigation"} aria-expanded={open} aria-controls={panelId} onClick={()=>setOpen(value=>!value)}><span/><span/></button><div className={`menu-overlay ${open?"is-open":""}`} onMouseDown={event=>{if(event.target===event.currentTarget)close()}} aria-hidden={!open} inert={!open}><div ref={panel} id={panelId} className="menu-panel" aria-label="Mobile navigation"><nav>{navigation.map(item=><Link key={item.href} href={item.href} onClick={close}><span>{item.label}</span><ArrowUpRight aria-hidden="true"/></Link>)}</nav><div className="menu-footer"><ThemeToggle/><p>Make every learning moment count.</p><Link className="button button-primary" href="/register" onClick={close}>Join Now <ArrowUpRight aria-hidden="true"/></Link><Link href="/login" onClick={close}>Sign in</Link></div></div></div></div>
}
