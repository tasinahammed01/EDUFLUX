"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { PublicUser } from "@eduflux/shared-types";
import { Logo } from "@/components/ui/logo";
import { authApi } from "@/lib/api/auth";

export function AppShell({ user, children }: { user: PublicUser; children: React.ReactNode }) {
  const router = useRouter();
  async function signOut() { try { await authApi.logout(); } finally { router.replace("/login"); router.refresh(); } }
  return <div className="app-shell"><aside className="app-sidebar"><Logo /><nav aria-label="Application"><Link className="active" href={user.primaryPersona === "TEACHER" ? "/teacher/dashboard" : "/student/dashboard"}>Classes</Link></nav><div className="app-profile"><span>{user.displayName.slice(0,2).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.primaryPersona.toLowerCase()}</small></div><button type="button" onClick={signOut} aria-label="Sign out"><LogOut aria-hidden="true" /></button></div></aside><div className="app-main"><header className="app-mobile-header"><Logo /><span>{user.displayName}</span><button type="button" onClick={signOut} aria-label="Sign out"><LogOut aria-hidden="true" /></button></header>{children}</div></div>;
}
