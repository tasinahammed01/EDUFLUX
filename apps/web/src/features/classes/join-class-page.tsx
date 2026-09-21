"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { JoinPreview } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { authApi } from "@/lib/api/auth";
import { notify } from "@/lib/notifications";
export function JoinClassPage({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<JoinPreview | null>(null),
    [authenticated, setAuthenticated] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  useEffect(() => {
    Promise.all([
      classesApi.previewInvite(token),
      authApi.session().catch(() => null),
    ])
      .then(([item, session]) => {
        setPreview(item);
        setAuthenticated(Boolean(session));
      })
      .catch(() => setError("This invitation is invalid or no longer active."));
  }, [token]);
  async function join() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const item = await classesApi.joinInvite(token);
      notify.success("Class joined", "class-joined");
      router.replace(
        `/${item.role === "STUDENT" ? "student" : "teacher"}/classes/${item.id}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The class could not be joined.",
      );
      notify.error(caught, "Could not join class. Try again.", "join-class-error");
      setPending(false);
    }
  }
  if (error && !preview)
    return (
      <main className="join-page">
        <div className="join-card">
          <h1>Invitation unavailable</h1>
          <p role="alert">{error}</p>
          <Link className="button button-primary" href="/">
            Return home
          </Link>
        </div>
      </main>
    );
  if (!preview)
    return (
      <main className="join-page">
        <div className="join-card">Loading invitation…</div>
      </main>
    );
  const destination = `/join/${encodeURIComponent(token)}`;
  return (
    <main className="join-page">
      <div className="join-card">
        <p className="eyebrow">Join EduFlux Class</p>
        <h1>{preview.name}</h1>
        {preview.subjectLevel && <strong>{preview.subjectLevel}</strong>}
        <dl>
          <div>
            <dt>Teacher</dt>
            <dd>{preview.teacher.displayName}</dd>
          </div>
          {preview.startDate && (
            <div>
              <dt>Starts</dt>
              <dd>
                {new Date(`${preview.startDate}T00:00:00`).toLocaleDateString()}
              </dd>
            </div>
          )}
        </dl>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {authenticated ? (
          <button
            className="button button-primary"
            onClick={join}
            disabled={pending}
          >
            {pending ? "Joining…" : "Join class"}
          </button>
        ) : (
          <div className="join-actions">
            <Link
              className="button button-primary"
              href={`/login?next=${encodeURIComponent(destination)}`}
            >
              Sign in to join
            </Link>
            <Link
              className="button button-secondary"
              href={`/register?next=${encodeURIComponent(destination)}`}
            >
              Create account
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
