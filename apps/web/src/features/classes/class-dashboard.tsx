"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Copy,
  LoaderCircle,
  Plus,
  Users,
} from "lucide-react";
import type { ClassSummary } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { ApiClientError } from "@/lib/api/client";
import { CreateClassDialog } from "./create-class-dialog";
import { notify } from "@/lib/notifications";

export function ClassDashboard({ mode }: { mode: "teacher" | "student" }) {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    window.requestAnimationFrame(() => createButtonRef.current?.focus());
  }, []);
  useEffect(() => {
    let active = true;
    classesApi
      .mine()
      .then((result) => {
        if (active) setClasses(result.classes);
      })
      .catch(() => {
        if (active) setError("Classes could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submitJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const item = await classesApi.join(
        String(new FormData(event.currentTarget).get("joinCode") ?? ""),
      );
      setClasses((current) => [item, ...current]);
      event.currentTarget.reset();
      notify.success("Class joined", "class-joined");
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "The request could not be completed.",
      );
      notify.error(caught, "Could not join class. Try again.", "join-class-error");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="dashboard">
      <header className="dashboard-heading">
        <div>
          <p className="eyebrow">Your learning spaces</p>
          <h1>
            {mode === "teacher"
              ? "Classes you guide"
              : "Classes you’re learning in"}
          </h1>
          <p>
            {mode === "teacher"
              ? "Create a focused home for your next group."
              : "Use the code from your teacher to join a class."}
          </p>
        </div>
        {mode === "teacher" && (
          <button
            ref={createButtonRef}
            className="button button-primary"
            type="button"
            onClick={() => setCreateOpen(true)}
          >
            <Plus aria-hidden="true" />
            Create class
          </button>
        )}
      </header>
      {mode === "student" && (
        <section className="class-action" aria-labelledby="class-action-title">
          <div>
            <span>
              <BookOpen aria-hidden="true" />
            </span>
            <div>
              <h2 id="class-action-title">Join a class</h2>
              <p>Class codes contain eight characters.</p>
            </div>
          </div>
          <form onSubmit={submitJoin}>
            <label>
              <span>Class code</span>
              <input
                className="code-input"
                name="joinCode"
                minLength={8}
                maxLength={8}
                required
                autoCapitalize="characters"
                placeholder="ABCD2345"
              />
            </label>
            <button className="button button-primary" disabled={pending}>
              {pending && (
                <LoaderCircle className="spinner" aria-hidden="true" />
              )}
              {pending ? "Joining class…" : "Join class"}
            </button>
          </form>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
      <section className="class-list" aria-live="polite">
        {loading ? (
          <div className="class-skeletons" aria-label="Loading classes">
            <i />
            <i />
            <i />
          </div>
        ) : classes.length === 0 ? (
          <div className="empty-state">
            <BookOpen aria-hidden="true" />
            <h2>No classes yet</h2>
            <p>
              {mode === "teacher"
                ? "Create your first class when you’re ready."
                : "Enter a class code above when you’re ready."}
            </p>
          </div>
        ) : (
          <div className="class-grid">
            {classes.map((item) => (
              <article className="class-card" key={item.id}>
                <div className="class-card-top">
                  <span>{item.name.slice(0, 2).toUpperCase()}</span>
                  <small>{item.role}</small>
                </div>
                <h2>{item.name}</h2>
                {item.subjectLevel && (
                  <p className="class-subject">{item.subjectLevel}</p>
                )}
                {item.description && <p>{item.description}</p>}
                <div className="class-meta">
                  {item.memberCount !== undefined && (
                    <span>
                      <Users aria-hidden="true" />
                      {item.memberCount} members
                    </span>
                  )}
                  {item.startDate && (
                    <span>
                      Starts{" "}
                      {new Date(
                        `${item.startDate}T00:00:00`,
                      ).toLocaleDateString()}
                    </span>
                  )}
                  <span>
                    Joined {new Date(item.joinedAt).toLocaleDateString()}
                  </span>
                </div>
                {item.joinCode && (
                  <button
                    type="button"
                    className="join-code"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(item.joinCode!);
                        notify.success("Class code copied", `class-code-${item.id}`);
                      } catch (error) {
                        notify.error(error, "Could not copy class code.", `class-code-error-${item.id}`);
                      }
                    }}
                    aria-label={`Copy join code ${item.joinCode}`}
                  >
                    {item.joinCode}
                    <Copy aria-hidden="true" />
                  </button>
                )}
                <Link href={`/${mode}/classes/${item.id}`}>
                  Open class <ArrowRight aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
      {createOpen && (
        <CreateClassDialog
          onClose={closeCreate}
          onCreated={(item) => {
            setClasses((current) => [item, ...current]);
            notify.success("Class created", "class-created");
            closeCreate();
          }}
        />
      )}
    </main>
  );
}
