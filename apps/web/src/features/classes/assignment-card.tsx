"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  Eye,
  Edit,
  Archive,
  MoreVertical,
  Copy,
  List,
  Trash2,
  Send,
} from "lucide-react";
import type { AssignmentDto, SubmissionDto, StudentAssignmentSubmissionSummary } from "@eduflux/shared-types";

interface AssignmentCardProps {
  assignment: AssignmentDto;
  classId: string;
  mode: "teacher" | "student";
  submissionStats?: {
    submitted: number;
    total: number;
  };
  submission?: SubmissionDto | StudentAssignmentSubmissionSummary;
  onArchive?: (assignment: AssignmentDto) => void;
  onDelete?: (assignment: AssignmentDto) => void;
  onEdit?: (assignment: AssignmentDto) => void;
  onViewSubmissions?: (assignment: AssignmentDto) => void;
  onDuplicate?: (assignment: AssignmentDto) => void;
  onShowQr?: (assignment: AssignmentDto) => void;
  onShowRubric?: (assignment: AssignmentDto) => void;
  onPublish?: (assignment: AssignmentDto) => void;
  onStudentSubmit?: (assignment: AssignmentDto) => void;
  publishing?: boolean;
  menuOpen?: string | null;
  setMenuOpen?: (id: string | null) => void;
}

export function AssignmentCard({
  assignment,
  classId,
  mode,
  submissionStats,
  submission,
  onArchive,
  onDelete,
  onEdit,
  onViewSubmissions,
  onDuplicate,
  onShowQr,
  onShowRubric,
  onPublish,
  onStudentSubmit,
  publishing = false,
  menuOpen,
  setMenuOpen,
}: AssignmentCardProps) {
  const statusColors = {
    DRAFT: "status-draft",
    PUBLISHED: "status-published",
    ARCHIVED: "status-archived",
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "No due date";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const submissionPercentage = useMemo(() => {
    if (!submissionStats?.total || submissionStats.total === 0) return null;
    return Math.round((submissionStats.submitted / submissionStats.total) * 100);
  }, [submissionStats]);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const isOpen = menuOpen === assignment.id;

  const closeMenu = useCallback(() => {
    setMenuOpen?.(null);
    setMenuPosition(null);
  }, [setMenuOpen]);

  const handleTriggerClick = useCallback(() => {
    if (isOpen) {
      closeMenu();
    } else {
      setMenuOpen?.(assignment.id);
    }
  }, [isOpen, closeMenu, setMenuOpen, assignment.id]);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const menuHeight = 180;
      const menuWidth = 180;
      const gap = 6;

      let top = triggerRect.bottom + gap;
      let left = triggerRect.right - menuWidth;

      if (top + menuHeight > window.innerHeight) {
        top = triggerRect.top - menuHeight - gap;
      }

      if (left < 8) {
        left = 8;
      }

      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }

      setMenuPosition({ top, left });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        triggerRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        closeMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    const handleScroll = () => {
      if (isOpen) {
        closeMenu();
      }
    };

    const handleResize = () => {
      if (isOpen) {
        closeMenu();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", handleResize);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen, closeMenu]);

  const handleArchiveClick = useCallback(() => {
    closeMenu();
    onArchive?.(assignment);
  }, [closeMenu, onArchive, assignment]);

  const handleDeleteClick = useCallback(() => {
    closeMenu();
    onDelete?.(assignment);
  }, [closeMenu, onDelete, assignment]);

  const handleDuplicateClick = useCallback(() => {
    closeMenu();
    onDuplicate?.(assignment);
  }, [closeMenu, onDuplicate, assignment]);

  const handleQrClick = useCallback(() => {
    closeMenu();
    onShowQr?.(assignment);
  }, [closeMenu, onShowQr, assignment]);

  const handleRubricClick = useCallback(() => {
    closeMenu();
    onShowRubric?.(assignment);
  }, [closeMenu, onShowRubric, assignment]);

  const submissionState = submission
    ? "submissionState" in submission
      ? submission.submissionState
      : submission.status
    : "NONE";
  const isSubmitted = mode === "student" && submissionState === "SUBMITTED";

  return (
    <article className="assignment-card" data-submitted={isSubmitted}>
      <div className="assignment-card-main">
        <div className="assignment-card-header">
          <h4>{assignment.title}</h4>
          <span className={`status-badge ${statusColors[assignment.status]}`}>
            {assignment.status.toLowerCase()}
          </span>
        </div>

        {(assignment.description || assignment.instructions) && (
          <p className="assignment-card-description">
            {assignment.description || assignment.instructions}
          </p>
        )}

        <div className="assignment-card-meta">
          <span>Due {formatDate(assignment.dueAt)}</span>
          {assignment.hasRubric && <span> · {assignment.maxScore} points</span>}
          {mode === "teacher" && submissionStats && submissionStats.total > 0 && (
            <>
              <span>·</span>
              <span>
                {submissionStats.submitted}/{submissionStats.total} Submitted
                {submissionPercentage !== null && ` · ${submissionPercentage}%`}
              </span>
            </>
          )}
          {mode === "student" && submission && (
            <>
              <span>·</span>
              <span>
                {submissionState === "SUBMITTED" 
                  ? `Submitted · Attempt ${submission.latestAttemptNumber}`
                  : submissionState === "DRAFT" ? "Draft saved" : "Not started"
                }
                {submission.isLate && " · Late"}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="assignment-card-actions">
        {mode === "teacher" ? (
          <>
            <button
              className="button button-primary button-small assignment-card-primary-action"
              onClick={() => onViewSubmissions?.(assignment)}
            >
              <Eye />
              View Submissions
            </button>

            <div className="teacher-action-grid">
              {assignment.status === "DRAFT" && assignment.hasRubric && onPublish && (
                <button
                  className="button button-primary button-small"
                  onClick={() => onPublish(assignment)}
                  disabled={publishing}
                >
                  <Send />
                  {publishing ? "Publishing…" : "Publish"}
                </button>
              )}
              {onShowQr && (
                <button
                  className="button button-secondary button-small"
                  onClick={() => onShowQr(assignment)}
                  aria-label="Show QR code"
                >
                  <Copy />
                  QR Code
                </button>
              )}
              <button
                className="button button-secondary button-small"
                onClick={() => onEdit?.(assignment)}
              >
                <Edit />
                Edit
              </button>
              {onDuplicate && (
                <button
                  className="button button-secondary button-small"
                  onClick={() => onDuplicate(assignment)}
                  aria-label="Duplicate assignment"
                >
                  <Copy />
                  Duplicate
                </button>
              )}
              {onShowRubric && (
                <button
                  className={`button button-secondary button-small ${assignment.hasRubric ? "button-warm" : "button-accent"}`}
                  onClick={() => onShowRubric(assignment)}
                  aria-label={assignment.hasRubric ? (assignment.rubricLocked ? "View rubric" : "Edit rubric") : "Add rubric"}
                  title={assignment.rubricLocked ? "Locked after student submission." : undefined}
                >
                  <List />
                  {assignment.hasRubric ? (assignment.rubricLocked ? "View Rubric" : "Edit Rubric") : "Add Rubric"}
                </button>
              )}
              {assignment.status !== "ARCHIVED" && (
                <button
                  className="button button-ghost button-small button-destructive-outline"
                  onClick={handleArchiveClick}
                  aria-label="Archive assignment"
                >
                  <Archive />
                  Archive
                </button>
              )}
              {onDelete && (
                <button
                  className="button button-ghost button-small button-destructive"
                  onClick={handleDeleteClick}
                  aria-label="Delete assignment"
                >
                  <Trash2 />
                  Delete
                </button>
              )}
            </div>

            <div className="action-menu-container mobile-only">
              <button
                ref={triggerRef}
                className="button-icon"
                aria-label={`Assignment actions for ${assignment.title}`}
                aria-expanded={isOpen}
                aria-haspopup="menu"
                onClick={handleTriggerClick}
              >
                <MoreVertical />
              </button>

              {isOpen && menuPosition &&
                createPortal(
                  <div
                    ref={menuRef}
                    className="action-menu"
                    role="menu"
                    style={{
                      position: "fixed",
                      top: `${menuPosition.top}px`,
                      left: `${menuPosition.left}px`,
                      zIndex: 100,
                    }}
                  >
                    {onShowQr && (
                      <button
                        className="menu-item"
                        role="menuitem"
                        onClick={handleQrClick}
                      >
                        <Copy />
                        QR Code
                      </button>
                    )}
                    <button
                      className="menu-item"
                      role="menuitem"
                      onClick={() => {
                        onEdit?.(assignment);
                        closeMenu();
                      }}
                    >
                      <Edit />
                      Edit
                    </button>
                    {onDuplicate && (
                      <button
                        className="menu-item"
                        role="menuitem"
                        onClick={handleDuplicateClick}
                      >
                        <Copy />
                        Duplicate
                      </button>
                    )}
                    {onShowRubric && (
                      <button
                        className="menu-item"
                        role="menuitem"
                        onClick={handleRubricClick}
                        title={assignment.rubricLocked ? "Locked after student submission." : undefined}
                      >
                        <List />
                        {assignment.hasRubric ? (assignment.rubricLocked ? "View Rubric" : "Edit Rubric") : "Add Rubric"}
                      </button>
                    )}
                    {assignment.status === "DRAFT" && assignment.hasRubric && onPublish && (
                      <button
                        className="menu-item"
                        role="menuitem"
                        disabled={publishing}
                        onClick={() => {
                          closeMenu();
                          onPublish(assignment);
                        }}
                      >
                        <Send />
                        {publishing ? "Publishing…" : "Publish"}
                      </button>
                    )}
                    {assignment.status !== "ARCHIVED" && (
                      <button
                        className="menu-item menu-item-danger"
                        role="menuitem"
                        onClick={handleArchiveClick}
                      >
                        <Archive />
                        Archive
                      </button>
                    )}
                    {onDelete && (
                      <button
                        className="menu-item menu-item-danger"
                        role="menuitem"
                        onClick={handleDeleteClick}
                      >
                        <Trash2 />
                        Delete
                      </button>
                    )}
                  </div>,
                  document.body
                )}
            </div>
          </>
        ) : (
          <>
            {submission ? (
              <>
                {submissionState === "SUBMITTED" ? (
                  <>
                    {"latestAttemptId" in submission && submission.submissionId && submission.latestAttemptId ? <Link
                      className="button button-primary button-small assignment-card-primary-action"
                      href={`/student/classes/${classId}/assignments/${assignment.id}/submissions/${submission.submissionId}/attempts/${submission.latestAttemptId}`}
                    >
                      <Eye />
                      {submission.evaluationStatus === "COMPLETED" ? "View Review" : "View Submission"}
                    </Link> : <Link className="button button-primary button-small assignment-card-primary-action" href={`/student/classes/${classId}/assignments/${assignment.id}`}><Eye />View Submission</Link>}
                    {submission.canResubmit && (
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => onStudentSubmit?.(assignment)}
                      >
                        Submit New Attempt
                      </button>
                    )}
                  </>
                ) : (
                  <button type="button"
                    className="button button-primary button-small assignment-card-primary-action"
                    onClick={() => onStudentSubmit?.(assignment)}
                  >
                    {submissionState === "DRAFT" ? "Continue Submission" : "Submit Assignment"}
                  </button>
                )}
              </>
            ) : (
              <button type="button"
                className="button button-primary button-small assignment-card-primary-action"
                onClick={() => onStudentSubmit?.(assignment)}
              >
                Submit Assignment
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
