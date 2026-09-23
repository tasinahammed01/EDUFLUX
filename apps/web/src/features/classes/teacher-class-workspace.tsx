"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Clipboard,
  Plus,
  QrCode,
  RotateCw,
  Users,
  Settings,
} from "lucide-react";
import QRCode from "qrcode";
import type {
  AssignmentDto,
  ClassMember,
  ClassSummary,
} from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { notify } from "@/lib/notifications";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ClassSettingsDialog } from "./class-settings-dialog";
import { AssignmentFormDialog } from "./assignment-form-dialog";
import { AssignmentCard } from "./assignment-card";
import { AssignmentSubmissionsDialog } from "./assignment-submissions-dialog";
import { RubricPromptDialog } from "./rubric-prompt-dialog";
import { RubricEditorDialog } from "./rubric-editor-dialog";

type Confirmation =
  | { kind: "rotate" }
  | { kind: "remove"; member: ClassMember }
  | { kind: "archive"; assignment: AssignmentDto }
  | { kind: "delete"; assignment: AssignmentDto };

export function TeacherClassWorkspace({ id }: { id: string }) {
  const [item, setItem] = useState<ClassSummary | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDto[]>([]);
  const [error, setError] = useState("");
  const [qr, setQr] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [assignmentMenuOpen, setAssignmentMenuOpen] = useState<string | null>(null);
  const [createAssignmentOpen, setCreateAssignmentOpen] = useState(false);
  const [editAssignmentOpen, setEditAssignmentOpen] = useState<AssignmentDto | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [submissionsDialogOpen, setSubmissionsDialogOpen] = useState<AssignmentDto | null>(null);
  const [rubricPromptOpen, setRubricPromptOpen] = useState(false);
  const [rubricEditorOpen, setRubricEditorOpen] = useState<AssignmentDto | null>(null);
  const [newlyCreatedAssignment, setNewlyCreatedAssignment] = useState<AssignmentDto | null>(null);
  const [publishingAssignmentId, setPublishingAssignmentId] = useState<string | null>(null);
  const publishingAssignmentRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      classesApi.one(id),
      classesApi.assignments(id),
      classesApi.members(id, 1, ""),
    ])
      .then(([detail, assignmentData, memberData]) => {
        if (active) {
          setItem(detail);
          setAssignments(assignmentData.assignments);
          setMembers(memberData.members);

        }
      })
      .catch(() => active && setError("This class could not be opened."));
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (item?.joinUrl)
      QRCode.toDataURL(item.joinUrl, {
        width: 320,
        margin: 2,
        color: { dark: "#071127", light: "#ffffff" },
      }).then(setQr);
  }, [item?.joinUrl]);

  const visibleAssignments = useMemo(
    () => assignments.filter((a) => a.status !== "ARCHIVED"),
    [assignments],
  );

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify.success(`${label} copied`, `copy-${label.toLowerCase().replaceAll(" ", "-")}`);
    } catch (caught) {
      notify.error(caught, `Could not copy ${label.toLowerCase()}.`, `copy-${label.toLowerCase().replaceAll(" ", "-")}-error`);
    }
  }

  function getConfirmationTitle(confirmation: Confirmation | null): string {
    if (!confirmation) return "";
    if (confirmation.kind === "rotate") return "Rotate invite link?";
    if (confirmation.kind === "remove") return "Remove student?";
    if (confirmation.kind === "archive") return "Archive assignment?";
    if (confirmation.kind === "delete") return "Delete assignment?";
    return "";
  }

  function getConfirmationDescription(confirmation: Confirmation | null): string {
    if (!confirmation) return "";
    if (confirmation.kind === "rotate") return "The current invitation link will stop working immediately. Students using the old link will no longer be able to join.";
    if (confirmation.kind === "remove") return `Remove ${confirmation.member.displayName} from this class?`;
    if (confirmation.kind === "archive") return `Archive ${confirmation.assignment.title}? Students will no longer see it as active work.`;
    if (confirmation.kind === "delete") return `This will permanently delete "${confirmation.assignment.title}". This action cannot be undone.`;
    return "";
  }

  function getConfirmationLabel(confirmation: Confirmation | null): string {
    if (!confirmation) return "";
    if (confirmation.kind === "rotate") return "Rotate link";
    if (confirmation.kind === "remove") return "Remove student";
    if (confirmation.kind === "archive") return "Archive assignment";
    if (confirmation.kind === "delete") return "Delete assignment";
    return "";
  }

  async function confirmAction() {
    if (!confirmation) return;
    try {
      if (confirmation.kind === "rotate") {
        const next = await classesApi.rotateInvite(id);
        setItem((current) => current ? { ...current, ...next } : current);
        notify.success("Invite link rotated", "invite-rotated");
      } else if (confirmation.kind === "remove") {
        const membershipId = confirmation.member.membershipId;
        if (membershipId) {
          await classesApi.removeMember(id, membershipId);
          setMembers((current) => current.filter((value) => value !== confirmation.member));
          notify.success("Student removed", `member-removed-${membershipId}`);
        }
      } else if (confirmation.kind === "archive") {
        const next = await classesApi.archiveAssignment(id, confirmation.assignment.id);
        setAssignments((current) => current.map((value) => value.id === next.id ? next : value));
        notify.success("Assignment archived", `assignment-archived-${confirmation.assignment.id}`);
      } else if (confirmation.kind === "delete") {
        await classesApi.deleteAssignment(id, confirmation.assignment.id);
        setAssignments((current) => current.filter((value) => value.id !== confirmation.assignment.id));
        notify.success("Assignment deleted", `assignment-deleted-${confirmation.assignment.id}`);
      }
    } catch (caught) {
      let fallback = "Could not complete action.";
      let toastId = "action-error";
      
      if (confirmation.kind === "rotate") {
        fallback = "Could not rotate invite link.";
        toastId = "invite-rotate-error";
      } else if (confirmation.kind === "remove") {
        fallback = "Could not remove student.";
        const membershipId = confirmation.member.membershipId;
        toastId = membershipId ? `member-remove-error-${membershipId}` : "member-remove-error";
      } else if (confirmation.kind === "archive") {
        fallback = "Could not archive assignment.";
        toastId = `assignment-archive-error-${confirmation.assignment.id}`;
      } else if (confirmation.kind === "delete") {
        fallback = "Could not delete assignment.";
        toastId = `assignment-delete-error-${confirmation.assignment.id}`;
      }
      
      notify.error(caught, fallback, toastId);
      throw caught;
    }
  }

  if (error && !item)
    return (
      <main className="dashboard">
        <p role="alert">{error}</p>
      </main>
    );

  if (!item)
    return (
      <main className="dashboard teacher-workspace">
        <div className="workspace-skeleton">
          <div className="skeleton-header">
            <div className="skeleton-title" />
            <div className="skeleton-subtitle" />
          </div>
          <div className="workspace-grid">
            <div className="workspace-left">
              <div className="skeleton-card" />
              <div className="skeleton-card" />
            </div>
            <div className="workspace-right">
              <div className="skeleton-card" />
              <div className="skeleton-card" />
            </div>
          </div>
        </div>
      </main>
    );

  return (
    <main className="dashboard teacher-workspace">
      <div className="workspace-header">
        <div className="workspace-title">
          <h1>{item.name}</h1>
          {item.subjectLevel && (
            <p className="workspace-subtitle">{item.subjectLevel}</p>
          )}
        </div>
        <div className="workspace-actions">
          <button 
            className="button button-ghost button-small"
            onClick={() => setSettingsOpen(true)}
            aria-label="Class settings"
          >
            <Settings />
            Settings
          </button>
          <Link className="button button-secondary" href="/teacher/dashboard">
            <ArrowLeft />
            Back to My Classes
          </Link>
        </div>
      </div>

      <div className="workspace-grid">
        <div className="workspace-left">
          <ClassSummaryCard item={item} assignmentCount={visibleAssignments.length} />
          <ShareClassCard item={item} qr={qr} onCopy={copy} onRotate={() => setConfirmation({ kind: "rotate" })} />
        </div>

        <div className="workspace-right">
          <AssignmentPanel
            classId={id}
            assignments={visibleAssignments}
            onArchive={(assignment) => setConfirmation({ kind: "archive", assignment })}
            onDelete={(assignment) => setConfirmation({ kind: "delete", assignment })}
            onCreate={() => setCreateAssignmentOpen(true)}
            onEdit={(assignment) => setEditAssignmentOpen(assignment)}
            menuOpen={assignmentMenuOpen}
            setMenuOpen={setAssignmentMenuOpen}
            onViewSubmissions={setSubmissionsDialogOpen}
            onShowRubric={(assignment) => {
              // For now, always open editor - it will handle locked state internally
              setRubricEditorOpen(assignment);
            }}
            publishingAssignmentId={publishingAssignmentId}
            onPublish={async (assignment) => {
              if (publishingAssignmentRef.current) return;
              publishingAssignmentRef.current = assignment.id;
              setPublishingAssignmentId(assignment.id);
              try {
                const updated = await classesApi.publishAssignment(id, assignment.id);
                setAssignments((current) => current.map((item) => item.id === updated.id ? updated : item));
                notify.success("Assignment published", `assignment-published-${assignment.id}`);
              } catch (caught) {
                notify.error(caught, caught instanceof Error ? caught.message : "Could not publish assignment.", `assignment-publish-error-${assignment.id}`);
              } finally {
                publishingAssignmentRef.current = null;
                setPublishingAssignmentId(null);
              }
            }}
          />
          <StudentPanel
            members={members}
            onRemove={(member) => setConfirmation({ kind: "remove", member })}
          />
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmation)}
        title={getConfirmationTitle(confirmation)}
        description={getConfirmationDescription(confirmation)}
        confirmLabel={getConfirmationLabel(confirmation)}
        variant={confirmation?.kind === "rotate" ? "warning" : "destructive"}
        onCancel={() => setConfirmation(null)}
        onConfirm={confirmAction}
      />

      <ClassSettingsDialog
        open={settingsOpen}
        item={item}
        onClose={() => setSettingsOpen(false)}
        onUpdated={setItem}
      />

      <AssignmentFormDialog
        open={createAssignmentOpen}
        classId={id}
        mode="create"
        onClose={() => setCreateAssignmentOpen(false)}
        onSuccess={(assignment) => {
          setAssignments((current) => [assignment, ...current]);
          setNewlyCreatedAssignment(assignment);
          setRubricPromptOpen(true);
        }}
      />

      {editAssignmentOpen && (
        <AssignmentFormDialog
          open={true}
          classId={id}
          mode="edit"
          assignment={editAssignmentOpen}
          onClose={() => setEditAssignmentOpen(null)}
          onSuccess={(updatedAssignment) => {
            setAssignments((current) =>
              current.map((item) =>
                item.id === updatedAssignment.id ? updatedAssignment : item
              )
            );
          }}
        />
      )}

      {submissionsDialogOpen && (
        <AssignmentSubmissionsDialog
          open={Boolean(submissionsDialogOpen)}
          onClose={() => setSubmissionsDialogOpen(null)}
          classId={id}
          assignmentId={submissionsDialogOpen.id}
          assignmentTitle={submissionsDialogOpen.title}
        />
      )}

      {rubricPromptOpen && newlyCreatedAssignment && (
        <RubricPromptDialog
          open={rubricPromptOpen}
          assignmentTitle={newlyCreatedAssignment.title}
          onAddNow={() => {
            setRubricPromptOpen(false);
            setRubricEditorOpen(newlyCreatedAssignment);
          }}
          onAddLater={() => {
            setRubricPromptOpen(false);
            setNewlyCreatedAssignment(null);
          }}
        />
      )}

      {rubricEditorOpen && (
        <RubricEditorDialog
          open={Boolean(rubricEditorOpen)}
          assignment={rubricEditorOpen}
          onClose={() => setRubricEditorOpen(null)}
          onSuccess={(updatedAssignment) => {
            setAssignments((current) =>
              current.map((item) =>
                item.id === updatedAssignment.id ? updatedAssignment : item
              )
            );
            setRubricEditorOpen(null);
          }}
        />
      )}
    </main>
  );
}

function ClassSummaryCard({ item, assignmentCount }: { item: ClassSummary; assignmentCount: number }) {
  const subjectLower = item.subjectLevel?.toLowerCase() || "";
  const subjectKey = subjectLower.includes("english") ? "english" :
                     subjectLower.includes("math") ? "mathematics" :
                     subjectLower.includes("science") ? "science" :
                     subjectLower.includes("computer") ? "computer" :
                     subjectLower.includes("business") ? "business" :
                     undefined;

  return (
    <article className="workspace-card class-summary-card">
      <div 
        className="class-banner"
        data-subject={subjectKey}
      >
        <span className="banner-initials">{item.name.slice(0, 2).toUpperCase()}</span>
      </div>
      <div className="class-stats">
        <div className="stat-item">
          <Users />
          <span>{item.memberCount ?? 0} Students</span>
        </div>
        <div className="stat-item">
          <span>▣</span>
          <span>{assignmentCount === 1 ? "1 Assignment" : `${assignmentCount} Assignments`}</span>
        </div>
      </div>
      {item.description && (
        <p className="class-description">{item.description}</p>
      )}
    </article>
  );
}

function ShareClassCard({ 
  item, 
  qr, 
  onCopy, 
  onRotate 
}: { 
  item: ClassSummary; 
  qr: string; 
  onCopy: (v: string, l: string) => void; 
  onRotate: () => void; 
}) {
  const [showQr, setShowQr] = useState(false);

  return (
    <article className="workspace-card share-card">
      <h3>Share This Class</h3>
      
      <div className="share-field">
        <label>Class Link</label>
        <div className="share-input-group">
          <input 
            type="text" 
            readOnly 
            value={item.joinUrl || ""} 
            className="share-input"
          />
          <button 
            className="button-icon"
            onClick={() => onCopy(item.joinUrl!, "Invite link")}
            aria-label="Copy invite link"
          >
            <Clipboard />
          </button>
        </div>
      </div>

      {item.joinCode && (
        <div className="share-field">
          <label>Class Code</label>
          <div className="share-input-group">
            <input 
              type="text" 
              readOnly 
              value={item.joinCode} 
              className="share-input code-input"
            />
            <button 
              className="button-icon"
              onClick={() => onCopy(item.joinCode!, "Class code")}
              aria-label="Copy class code"
            >
              <Clipboard />
            </button>
          </div>
        </div>
      )}

      <button 
        className="button button-secondary button-small"
        onClick={() => setShowQr(true)}
      >
        <QrCode />
        Show QR
      </button>

      <button 
        className="text-action"
        onClick={onRotate}
      >
        <RotateCw />
        Rotate invite link
      </button>

      {showQr && qr && (
        <div className="qr-modal" onClick={() => setShowQr(false)}>
          <div className="qr-content" onClick={(e) => e.stopPropagation()}>
            <h4>Join {item.name}</h4>
            <Image src={qr} width={320} height={320} alt={`QR code to join ${item.name}`} unoptimized />
            <a
              className="button button-secondary"
              href={qr}
              download={`${item.name}-invite.png`}
            >
              Download QR
            </a>
            <button className="button button-ghost" onClick={() => setShowQr(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function AssignmentPanel({
  classId,
  assignments,
  onArchive,
  onDelete,
  onCreate,
  onEdit,
  menuOpen,
  setMenuOpen,
  onViewSubmissions,
  onShowRubric,
  onPublish,
  publishingAssignmentId,
}: {
  classId: string;
  assignments: AssignmentDto[];
  onArchive: (assignment: AssignmentDto) => void;
  onDelete: (assignment: AssignmentDto) => void;
  onCreate: () => void;
  onEdit: (assignment: AssignmentDto) => void;
  menuOpen: string | null;
  setMenuOpen: (id: string | null) => void;
  onViewSubmissions: (assignment: AssignmentDto) => void;
  onShowRubric: (assignment: AssignmentDto) => void;
  onPublish: (assignment: AssignmentDto) => void;
  publishingAssignmentId: string | null;
}) {
  const handleArchive = useCallback((assignment: AssignmentDto) => {
    setMenuOpen(null);
    onArchive(assignment);
  }, [setMenuOpen, onArchive]);

  const handleDelete = useCallback((assignment: AssignmentDto) => {
    setMenuOpen(null);
    onDelete(assignment);
  }, [setMenuOpen, onDelete]);

  return (
    <section className="workspace-card assignment-panel">
      <div className="panel-header">
        <div>
          <h3>{assignments.length === 1 ? "1 Assignment" : `${assignments.length} Assignments`}</h3>
        </div>
        <button className="button button-primary button-small" onClick={onCreate}>
          <Plus />
          Create Assignment
        </button>
      </div>

      {assignments.length === 0 ? (
        <div className="empty-state">
          <h3>No assignments yet</h3>
          <p>Create your first assignment for this class.</p>
          <button className="button button-secondary" onClick={onCreate}>
            Create assignment
          </button>
        </div>
      ) : (
        <div className="assignment-list">
          {assignments.map((assignment) => {
            const stats = assignment.submissionStats;
            return (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                classId={classId}
                mode="teacher"
                {...(stats
                  ? {
                      submissionStats: {
                        submitted: stats.submittedCount,
                        total: stats.eligibleStudentCount,
                      },
                    }
                  : {})}
                onArchive={handleArchive}
                onDelete={handleDelete}
                onEdit={onEdit}
                onViewSubmissions={onViewSubmissions}
                onShowRubric={onShowRubric}
                onPublish={onPublish}
                publishing={publishingAssignmentId === assignment.id}
                menuOpen={menuOpen}
                setMenuOpen={setMenuOpen}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function StudentPanel({
  members,
  onRemove,
}: {
  members: ClassMember[];
  onRemove: (member: ClassMember) => void;
}) {
  const students = members.filter((m) => m.role === "STUDENT");

  return (
    <section className="workspace-card student-panel">
      <div className="panel-header">
        <div>
          <h3>{students.length === 1 ? "1 Student Joined" : `${students.length} Students Joined`}</h3>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="empty-state">
          <h3>No students yet</h3>
          <p>No students have joined this class yet.</p>
        </div>
      ) : (
        <div className="student-list">
          {students.map((member) => (
            <article key={member.membershipId || member.joinedAt} className="student-row">
              <div className="student-avatar">
                {member.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="student-info">
                <h4>{member.displayName}</h4>
                <p>Student · Joined {new Date(member.joinedAt).toLocaleDateString()}</p>
              </div>
              <button
                className="button button-ghost button-small"
                onClick={() => onRemove(member)}
              >
                Remove
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
