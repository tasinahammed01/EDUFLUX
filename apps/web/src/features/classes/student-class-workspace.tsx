"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type {
  AssignmentDto,
  ClassSummary,
} from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { notify } from "@/lib/notifications";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { AssignmentCard } from "./assignment-card";
import { StudentSubmissionDialog } from "./student-submission-dialog";

type Confirmation = { kind: "leave" };

export function StudentClassWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const [item, setItem] = useState<ClassSummary | null>(null);
  const [assignments, setAssignments] = useState<AssignmentDto[]>([]);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [submissionAssignment, setSubmissionAssignment] = useState<AssignmentDto | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      classesApi.one(id),
      classesApi.assignments(id),
    ])
      .then(([detail, assignmentData]) => {
        if (active) {
          setItem(detail);
          setAssignments(assignmentData.assignments);
        }
      })
      .catch(() => active && setError("This class could not be opened."));
    return () => {
      active = false;
    };
  }, [id]);

  const visibleAssignments = assignments.filter((a) => a.status === "PUBLISHED");

  async function confirmAction() {
    if (!confirmation) return;
    try {
      if (confirmation.kind === "leave") {
        await classesApi.leave(id);
        notify.success("Class left", "class-left");
        router.replace("/student/dashboard");
      }
    } catch (caught) {
      const fallback = confirmation.kind === "leave" ? "Could not leave class. Try again." : "Could not complete action.";
      const toastId = confirmation.kind === "leave" ? "leave-class-error" : "action-error";
      notify.error(caught, fallback, toastId);
      throw caught;
    }
  }

  if (error && !item) {
    return (
      <main className="dashboard">
        <p role="alert">{error}</p>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="dashboard student-workspace">
        <div className="workspace-skeleton">
          <div className="skeleton-header">
            <div className="skeleton-title" />
            <div className="skeleton-subtitle" />
          </div>
          <div className="workspace-grid">
            <div className="workspace-left">
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
  }

  const subjectLower = item.subjectLevel?.toLowerCase() || "";
  const subjectKey = subjectLower.includes("english") ? "english" :
                     subjectLower.includes("math") ? "mathematics" :
                     subjectLower.includes("science") ? "science" :
                     subjectLower.includes("computer") ? "computer" :
                     subjectLower.includes("business") ? "business" :
                     undefined;

  return (
    <main className="dashboard student-workspace">
      <div className="workspace-header">
        <div className="workspace-title">
          <h1>{item.name}</h1>
          {item.subjectLevel && (
            <p className="workspace-subtitle">{item.subjectLevel}</p>
          )}
        </div>
        <div className="workspace-actions">
          <Link className="button button-secondary" href="/student/dashboard">
            <ArrowLeft />
            Back to My Classes
          </Link>
        </div>
      </div>

      <div className="workspace-grid">
        <div className="workspace-left">
          <ClassSummaryCard item={item} subjectKey={subjectKey ?? undefined} onLeave={() => setConfirmation({ kind: "leave" })} />
        </div>

        <div className="workspace-right">
          <AssignmentPanel
            classId={id}
            assignments={visibleAssignments}
            onSubmit={setSubmissionAssignment}
          />
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmation)}
        title="Leave this class?"
        description="You will lose access to this class and its assignments."
        confirmLabel="Leave class"
        variant="destructive"
        onCancel={() => setConfirmation(null)}
        onConfirm={confirmAction}
      />
      {submissionAssignment && <StudentSubmissionDialog assignment={submissionAssignment} classId={id} onClose={() => setSubmissionAssignment(null)} />}
    </main>
  );
}

function ClassSummaryCard({ 
  item, 
  subjectKey,
  onLeave 
}: { 
  item: ClassSummary; 
  subjectKey: string | undefined;
  onLeave: () => void;
}) {
  return (
    <article className="workspace-card class-summary-card">
      <div 
        className="class-banner"
        data-subject={subjectKey}
      >
        <span className="banner-initials">{item.name.slice(0, 2).toUpperCase()}</span>
      </div>
      
      <div className="class-teacher-info">
        {item.owner && (
          <div className="teacher-name">
            <span className="teacher-label">Teacher</span>
            <span className="teacher-display">{item.owner.displayName}</span>
          </div>
        )}
      </div>

      {item.description && (
        <p className="class-description">{item.description}</p>
      )}

      <button 
        className="text-action leave-action"
        onClick={onLeave}
      >
        Leave class
      </button>
    </article>
  );
}

function AssignmentPanel({
  classId,
  assignments,
  onSubmit,
}: {
  classId: string;
  assignments: AssignmentDto[];
  onSubmit: (assignment: AssignmentDto) => void;
}) {
  return (
    <section className="workspace-card assignment-panel">
      <div className="panel-header">
        <div>
          <h3>{assignments.length === 1 ? "1 Assignment" : `${assignments.length} Assignments`}</h3>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div className="empty-state">
          <h3>No assignments yet</h3>
          <p>No assignments have been published yet.</p>
        </div>
      ) : (
        <div className="assignment-list">
          {assignments.map((assignment) => {
            return (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                classId={classId}
                mode="student"
                onStudentSubmit={onSubmit}
                {...(assignment.studentSubmission ? { submission: assignment.studentSubmission } : {})}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
