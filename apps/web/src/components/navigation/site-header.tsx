"use client";

import { useEffect, useRef } from "react";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { DesktopNavigation } from "./desktop-navigation";
import { MobileNavigation } from "./mobile-navigation";

export function SiteHeader() {
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const marker = document.querySelector("[data-header-marker]");
    if (!marker || !headerRef.current) return;
    const observer = new IntersectionObserver(([entry]) => headerRef.current?.classList.toggle("is-scrolled", !entry?.isIntersecting), { threshold: 0 });
    observer.observe(marker);
    return () => observer.disconnect();
  }, []);
  return <header ref={headerRef} className="site-header"><Container className="header-inner"><Logo /><DesktopNavigation /><MobileNavigation /></Container></header>;
}
