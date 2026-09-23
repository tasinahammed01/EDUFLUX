"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { X, LoaderCircle, User } from "lucide-react";
import type { TeacherSubmissionRow } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { notify } from "@/lib/notifications";

interface AssignmentSubmissionsDialogProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  assignmentId: string;
  assignmentTitle: string;
}

export function AssignmentSubmissionsDialog({
  open,
  onClose,
  classId,
  assignmentId,
  assignmentTitle,
}: AssignmentSubmissionsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const mountedRef = useRef(false);
  const [rows, setRows] = useState<TeacherSubmissionRow[]>([]);
  const [summary, setSummary] = useState({
    students: 0,
    submitted: 0,
    notSubmitted: 0,
    late: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a:not([disabled])")];
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);

    // Load submissions when dialog opens using setTimeout to avoid setState in effect
    const loadController = new AbortController();
    setTimeout(() => {
      if (!mountedRef.current || loadController.signal.aborted) return;
      
      setLoading(true);
      setError("");
      classesApi.submissionRows(classId, assignmentId, 1, "SUBMITTED", "")
        .then((result) => {
          if (mountedRef.current && !loadController.signal.aborted) {
            setRows(result.rows);
            setSummary(result.summary);
          }
        })
        .catch((err) => {
          if (mountedRef.current && !loadController.signal.aborted) {
            setError("Couldn't load submissions.");
            notify.error(err, "Failed to load submissions", "submissions-load-error");
          }
        })
        .finally(() => {
          if (mountedRef.current && !loadController.signal.aborted) {
            setLoading(false);
          }
        });
    }, 0);

    return () => {
      loadController.abort();
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      window.requestAnimationFrame(() => restoreFocusRef.current?.focus());
    };
  }, [open, onClose, classId, assignmentId, retryTrigger]);

  if (!open) return null;

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div
      className="submissions-dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="submissions-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="submissions-title"
      >
        <div className="submissions-dialog-header">
          <div>
            <h2 id="submissions-title">{assignmentTitle}</h2>
            <p>
              {summary.submitted} student{summary.submitted !== 1 ? "s" : ""} submitted
            </p>
          </div>
          <button
            className="submissions-dialog-close"
            type="button"
            onClick={onClose}
            aria-label="Close submissions"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="submissions-dialog-body">
          {loading ? (
            <div className="submissions-loading">
              <LoaderCircle className="spinner" aria-hidden="true" />
              <span>Loading submissions…</span>
            </div>
          ) : error ? (
            <div className="submissions-error">
              <p>{error}</p>
              <button
                className="button button-secondary button-small"
                onClick={() => setRetryTrigger(prev => prev + 1)}
              >
                Try again
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="submissions-empty">
              <User aria-hidden="true" />
              <h3>No submissions yet</h3>
              <p>Students who submit this assignment will appear here.</p>
            </div>
          ) : (
            <div className="submissions-list">
              {rows.map((row) => (
                <article key={row.student.id} className="submission-row">
                  <div className="submission-student">
                    {row.student.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.student.photoURL}
                        alt=""
                        className="submission-avatar"
                      />
                    ) : (
                      <div className="submission-avatar submission-avatar-initials">
                        {getInitials(row.student.displayName)}
                      </div>
                    )}
                    <div className="submission-info">
                      <strong>{row.student.displayName}</strong>
                      <span>
                        Submitted {formatDate(row.latestSubmittedAt)}
                        {row.latestAttemptNumber > 0 && (
                          <> · Attempt {row.latestAttemptNumber}</>
                        )}
                        {row.isLate && (
                          <> · Late</>
                        )}
                      </span>
                    </div>
                  </div>
                  {row.submissionId && (
                    <Link
                      className="button button-secondary button-small"
                      href={`/teacher/classes/${classId}/assignments/${assignmentId}/submissions/${row.submissionId}`}
                    >
                      View submission
                    </Link>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="submissions-dialog-footer">
          <button
            className="button button-secondary"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
