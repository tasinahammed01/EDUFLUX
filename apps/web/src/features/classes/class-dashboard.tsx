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
  Search,
  RefreshCw,
  MoreVertical,
  Archive,
  Trash2,
  RotateCcw,
} from "lucide-react";
import type { ClassSummary } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { ApiClientError } from "@/lib/api/client";
import { CreateClassDialog } from "./create-class-dialog";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { notify } from "@/lib/notifications";

export function ClassDashboard({ mode }: { mode: "teacher" | "student" }) {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  
  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    window.requestAnimationFrame(() => createButtonRef.current?.focus());
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(null);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen, closeMenu]);

  const handleArchive = async (classId: string) => {
    try {
      await classesApi.archive(classId);
      setClasses((current) =>
        current.map((c) => (c.id === classId ? { ...c, status: "ARCHIVED" } : c))
      );
      notify.success("Class archived", `class-${classId}-status`);
      closeMenu();
    } catch (error) {
      notify.error(error, "Could not archive class.", `class-${classId}-error`);
    }
  };

  const handleRestore = async (classId: string) => {
    try {
      await classesApi.restore(classId);
      setClasses((current) =>
        current.map((c) => (c.id === classId ? { ...c, status: "ACTIVE" } : c))
      );
      notify.success("Class restored", `class-${classId}-status`);
      closeMenu();
    } catch (error) {
      notify.error(error, "Could not restore class.", `class-${classId}-error`);
    }
  };

  const handleDelete = async (classId: string) => {
    try {
      await classesApi.delete(classId);
      setClasses((current) => current.filter((c) => c.id !== classId));
      notify.success("Class deleted", `class-${classId}-deleted`);
      setDeleteTarget(null);
      closeMenu();
    } catch (error) {
      notify.error(error, "Could not delete class.", `class-${classId}-error`);
    }
  };

  const fetchClasses = useCallback(async () => {
    try {
      const result = await classesApi.mine();
      setClasses(result.classes);
      setError("");
    } catch {
      setError("Classes could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchClasses();
  }, [fetchClasses]);

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

  const filteredClasses = classes.filter((item) => {
    const matchesTab = activeTab === "ACTIVE" 
      ? (item.status === "ACTIVE" || !item.status)
      : item.status === "ARCHIVED";
    
    if (!searchQuery) return matchesTab;
    
    const query = searchQuery.toLowerCase();
    return (
      matchesTab &&
      (item.name.toLowerCase().includes(query) ||
       item.subjectLevel?.toLowerCase().includes(query) ||
       item.description?.toLowerCase().includes(query))
    );
  });

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
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">
            {mode === "teacher" ? "My Classes" : "My Classes"}
          </h1>
          {mode === "teacher" && (
            <p className="dashboard-subtitle">
              Manage your classes, assignments and students.
            </p>
          )}
          {mode === "student" && (
            <p className="dashboard-subtitle">
              View your classes and track your progress.
            </p>
          )}
        </div>
      </header>

      {mode === "teacher" && (
        <div className="dashboard-controls">
          <div className="dashboard-tabs">
            <button
              aria-pressed={activeTab === "ACTIVE"}
              onClick={() => setActiveTab("ACTIVE")}
            >
              Active
            </button>
            <button
              aria-pressed={activeTab === "ARCHIVED"}
              onClick={() => setActiveTab("ARCHIVED")}
            >
              Archived
            </button>
          </div>
          <div className="dashboard-search">
            <Search aria-hidden="true" />
            <input
              type="text"
              placeholder="Search your classes"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search classes"
            />
          </div>
          <div className="dashboard-actions">
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Refresh classes"
            >
              {refreshing && (
                <LoaderCircle className="spinner" aria-hidden="true" />
              )}
              {!refreshing && <RefreshCw aria-hidden="true" />}
              Refresh
            </button>
            <button
              ref={createButtonRef}
              className="button button-primary button-small"
              type="button"
              onClick={() => setCreateOpen(true)}
            >
              <Plus aria-hidden="true" />
              Create class
            </button>
          </div>
        </div>
      )}

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
        ) : filteredClasses.length === 0 ? (
          <div className="empty-state">
            <BookOpen aria-hidden="true" />
            <h2>
              {searchQuery ? "No classes match your search" : 
               activeTab === "ARCHIVED" ? "No archived classes" :
               mode === "teacher" ? "No classes yet" : "No classes yet"}
            </h2>
            <p>
              {searchQuery ? "Try a different search term." :
               activeTab === "ARCHIVED" ? "Archived classes will appear here." :
               mode === "teacher" 
                ? "Create your first class to start adding students and assignments."
                : "Enter a class code above when you're ready."}
            </p>
            {mode === "teacher" && !searchQuery && activeTab === "ACTIVE" && (
              <button
                className="button button-primary"
                onClick={() => setCreateOpen(true)}
              >
                <Plus aria-hidden="true" />
                Create class
              </button>
            )}
          </div>
        ) : (
          <div className="class-grid">
            {filteredClasses.map((item) => (
              <article className="class-card" key={item.id}>
                <div
                  className="class-cover"
                  data-subject={
                    item.subjectLevel?.toLowerCase().includes("english") ? "english" :
                    item.subjectLevel?.toLowerCase().includes("math") ? "mathematics" :
                    item.subjectLevel?.toLowerCase().includes("science") ? "science" :
                    item.subjectLevel?.toLowerCase().includes("computer") ? "computer" :
                    item.subjectLevel?.toLowerCase().includes("business") ? "business" :
                    undefined
                  }
                >
                  <span className="class-cover-text">
                    {item.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="class-card-body">
                  <div className="class-card-header">
                    <div>
                      {item.subjectLevel && (
                        <p className="class-card-subject">{item.subjectLevel}</p>
                      )}
                      <h2 className="class-card-title">{item.name}</h2>
                    </div>
                    <div className="class-card-menu" ref={menuOpen === item.id ? menuRef : undefined}>
                      <button
                        type="button"
                        aria-label="Class options"
                        aria-expanded={menuOpen === item.id}
                        onClick={() => setMenuOpen(menuOpen === item.id ? null : item.id)}
                      >
                        <MoreVertical aria-hidden="true" />
                      </button>
                      {menuOpen === item.id && (
                        <div className="class-card-dropdown">
                          {item.joinCode && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(item.joinCode!);
                                  notify.success("Class code copied", `class-code-${item.id}`);
                                  closeMenu();
                                } catch (error) {
                                  notify.error(error, "Could not copy class code.", `class-code-error-${item.id}`);
                                }
                              }}
                            >
                              <Copy aria-hidden="true" />
                              Copy class code
                            </button>
                          )}
                          {item.status === "ARCHIVED" ? (
                            <button
                              type="button"
                              onClick={() => handleRestore(item.id)}
                            >
                              <RotateCcw aria-hidden="true" />
                              Restore class
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleArchive(item.id)}
                            >
                              <Archive aria-hidden="true" />
                              Archive class
                            </button>
                          )}
                          <div className="class-card-dropdown-divider" />
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item.id)}
                            className="class-card-dropdown-item-destructive"
                          >
                            <Trash2 aria-hidden="true" />
                            Delete class
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {item.description && (
                    <p className="class-card-description">{item.description}</p>
                  )}
                  <div className="class-card-meta">
                    {item.memberCount !== undefined && (
                      <div className="class-card-meta-item">
                        <Users aria-hidden="true" />
                        {item.memberCount} students
                      </div>
                    )}
                    {item.startDate && (
                      <div className="class-card-meta-item">
                        <span aria-hidden="true">📅</span>
                        {new Date(
                          `${item.startDate}T00:00:00`,
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    )}
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
                </div>
                <Link href={`/${mode}/classes/${item.id}`} className="class-card-footer">
                  <span>Open class</span>
                  <ArrowRight aria-hidden="true" />
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
      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Delete class?"
          description={`This will permanently delete '${classes.find(c => c.id === deleteTarget)?.name || 'this class'}' and its related class data. This action cannot be undone.`}
          confirmLabel="Delete class"
          variant="destructive"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            if (deleteTarget) {
              await handleDelete(deleteTarget);
            }
          }}
        />
      )}
    </main>
  );
}