"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, School } from "lucide-react";
import type { PrimaryPersona } from "@eduflux/shared-types";
import { authApi } from "@/lib/api/auth";

export default function OnboardingPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function choose(primaryPersona: PrimaryPersona) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await authApi.onboarding(primaryPersona);
      router.replace(
        primaryPersona === "TEACHER"
          ? "/teacher/dashboard"
          : "/student/dashboard"
      );
      router.refresh();
    } catch {
      setError("We couldn't save your workspace. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="onboarding-card">
        <p className="eyebrow">One last step</p>
        <h1>How will you use MENTRA?</h1>
        <p>Choose your starting workspace. This cannot grant administrative or class permissions.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div>
          {([
            ["TEACHER", School, "Teacher", "Create classes, assignments, and guide learners."],
            ["STUDENT", GraduationCap, "Student", "Join classes and build your progress."]
          ] as const).map(([persona, Icon, title, copy]) => (
            <button
              key={persona}
              disabled={pending}
              onClick={() => choose(persona)}
            >
              <Icon aria-hidden="true" />
              <span>
                <strong>{title}</strong>
                <small>{copy}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
