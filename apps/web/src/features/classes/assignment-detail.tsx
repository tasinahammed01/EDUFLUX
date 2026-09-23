"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { AssignmentDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { StudentSubmissionDialog } from "./student-submission-dialog";
import { TeacherSubmissions } from "./teacher-submissions";
export function AssignmentDetail({
  classId,
  assignmentId,
  mode,
}: {
  classId: string;
  assignmentId: string;
  mode: "teacher" | "student";
}) {
  const [item, setItem] = useState<AssignmentDto | null>(null),
    [error, setError] = useState("");
  const [submissionOpen, setSubmissionOpen] = useState(false);
  useEffect(() => {
    classesApi
      .assignment(classId, assignmentId)
      .then(setItem)
      .catch(() => setError("Assignment not found."));
  }, [classId, assignmentId]);
  if (error)
    return (
      <main className="dashboard">
        <p role="alert">{error}</p>
      </main>
    );
  if (!item) return <main className="dashboard">Loading assignment…</main>;
  return (
    <main className="dashboard assignment-detail">
      <Link className="back-link" href={`/${mode}/classes/${classId}`}>
        <ArrowLeft />
        Back to class
      </Link>
      <p className="eyebrow">{item.status}</p>
      <h1>{item.title}</h1>
      {item.description && (
        <p className="assignment-lead">{item.description}</p>
      )}
      <section>
        <h2>Instructions</h2>
        <p>{item.instructions || "No additional instructions."}</p>
      </section>
      {item.rubric && (
        <section>
          <h2>Rubric</h2>
          {item.rubric.criteria.map((criterion) => (
            <article key={criterion.id}>
              <strong>{criterion.title}</strong>
              <span>Weight: {criterion.weight}</span>
              {criterion.description && <p>{criterion.description}</p>}
            </article>
          ))}
        </section>
      )}
      {mode === "student" && (
        <section className="assignment-submit-summary">
          <h2>Your submission</h2>
          <p>Submit a typed response, images, PDFs, or a combination in the submission dialog.</p>
          <button className="button button-primary" type="button" onClick={() => setSubmissionOpen(true)}>
            {item.studentSubmission?.submissionState === "DRAFT" ? "Continue Submission" : item.studentSubmission?.canResubmit ? "Submit Another Attempt" : "Submit Assignment"}
          </button>
        </section>
      )}
      {mode === "teacher" && item.status === "PUBLISHED" && (
        <TeacherSubmissions classId={classId} assignmentId={assignmentId} />
      )}
      <section className="assignment-facts">
        <div>
          <small>Available</small>
          <strong>
            {item.availableFrom
              ? new Date(item.availableFrom).toLocaleString()
              : "Immediately"}
          </strong>
        </div>
        <div>
          <small>Due</small>
          <strong>
            {item.dueAt ? new Date(item.dueAt).toLocaleString() : "No due date"}
          </strong>
        </div>
        <div>
          <small>Maximum score</small>
          <strong>{item.maxScore}</strong>
        </div>
      </section>
      {item.resourceLinks.length > 0 && (
        <section>
          <h2>Resources</h2>
          {item.resourceLinks.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
              {link.label}
              <ExternalLink />
            </a>
          ))}
        </section>
      )}
      <section>
        <h2>Submission settings</h2>
        <p>
          {item.allowLateSubmission
            ? "Late submissions are allowed."
            : "Late submissions are not allowed."}{" "}
          {item.allowResubmission
            ? "Resubmissions are allowed."
            : "One submission attempt."}
        </p>
      </section>
      {mode === "teacher" && item.status === "DRAFT" && (
        <button
          className="button button-primary"
          onClick={async () =>
            setItem(await classesApi.publishAssignment(classId, item.id))
          }
        >
          Publish assignment
        </button>
      )}
      {mode === "student" && submissionOpen && <StudentSubmissionDialog assignment={item} classId={classId} onClose={() => setSubmissionOpen(false)} />}
    </main>
  );
}
