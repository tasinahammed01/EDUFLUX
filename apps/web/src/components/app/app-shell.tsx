"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, ChevronDown } from "lucide-react";
import type { PublicUser } from "@eduflux/shared-types";
import { Logo } from "@/components/ui/logo";
import { authApi } from "@/lib/api/auth";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { notify } from "@/lib/notifications";

export function AppShell({ user, children }: { user: PublicUser; children: React.ReactNode }) {
  const router = useRouter();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  
  async function signOut() {
    try {
      await authApi.logout();
    } catch (error) {
      notify.error(error, "Could not sign out. Try again.", "logout-error");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  const closeProfileMenu = useCallback(() => {
    setProfileMenuOpen(false);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        closeProfileMenu();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeProfileMenu();
      }
    };
    if (profileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [profileMenuOpen, closeProfileMenu]);

  const dashboard = user.primaryPersona === "TEACHER" ? "/teacher/dashboard" : "/student/dashboard";

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Logo />
        <nav aria-label="Application">
          <Link className="active" href={dashboard}>
            Classes
          </Link>
        </nav>
      </aside>
      <header className="app-topbar">
        <div className="app-topbar-right">
          <ThemeToggle />
          <div className="app-profile-nav" ref={profileMenuRef}>
            <button
              type="button"
              className="app-profile-trigger"
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
            >
              <span className="app-profile-avatar">
                {user.displayName.slice(0, 2).toUpperCase()}
              </span>
              <div className="app-profile-info">
                <strong>{user.displayName}</strong>
                <small>{user.primaryPersona?.toLowerCase() ?? "onboarding"}</small>
              </div>
              <ChevronDown className="app-profile-chevron" aria-hidden="true" />
            </button>
            {profileMenuOpen && (
              <div className="app-profile-dropdown" role="menu">
                <div className="app-profile-dropdown-header">
                  <strong>{user.displayName}</strong>
                  <small>{user.primaryPersona?.toLowerCase() ?? "onboarding"}</small>
                </div>
                <div className="app-profile-dropdown-divider" />
                <button
                  type="button"
                  onClick={signOut}
                  className="app-profile-dropdown-item"
                >
                  <LogOut aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="app-main">
        <header className="app-mobile-header">
          <Logo />
          <ThemeToggle compact />
          <span>{user.displayName}</span>
          <button type="button" onClick={signOut} aria-label="Sign out">
            <LogOut aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
