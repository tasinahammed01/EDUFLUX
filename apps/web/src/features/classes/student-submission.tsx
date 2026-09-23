"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SubmissionDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { notify } from "@/lib/notifications";

export function StudentSubmission({
  classId,
  assignmentId,
}: {
  classId: string;
  assignmentId: string;
}) {
  const router = useRouter();
  const [submission, setSubmission] = useState<SubmissionDto | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    classesApi.submission(classId, assignmentId).then((value) => {
      setSubmission(value);
      setText(value.draftText);
    });
  }, [assignmentId, classId]);

  const save = useCallback(async () => {
    if (!submission || !dirtyRef.current) return;
    setSaving(true);
    try {
      const value = await classesApi.saveSubmissionDraft(
        classId,
        assignmentId,
        text,
        submission.draftFiles.map((file) => file.id),
        submission.draftRevision,
      );
      dirtyRef.current = false;
      setDirty(false);
      setSubmission(value);
    } catch (error) {
      notify.error(error, "Draft could not be saved. Refresh before editing again.");
    } finally {
      setSaving(false);
    }
  }, [assignmentId, classId, submission, text]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(save, 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, save, text]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);

  if (!submission)
    return (
      <section>
        <h2>Your work</h2>
        <p>Loading submission…</p>
      </section>
    );
  return (
    <section className="submission-workspace">
      <header>
        <div>
          <h2>Your work</h2>
          <p>
            {saving
              ? "Saving…"
              : dirty
                ? "Unsaved changes"
                : "Draft saved"}
          </p>
        </div>
        <strong>{submission.isLate ? "Late" : submission.status}</strong>
      </header>
      <label htmlFor="submission-text">Written response</label>
      <textarea
        id="submission-text"
        maxLength={100000}
        rows={12}
        value={text}
        onChange={(event) => {
          dirtyRef.current = true;
          setDirty(true);
          setText(event.target.value);
        }}
        disabled={!submission.canSubmit && !submission.canResubmit}
      />
      <small>{text.length.toLocaleString()} / 100,000 characters</small>
      <label className="button button-ghost">
        {uploading ? "Uploading…" : "Add PDF or image"}
        <input hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp" capture="environment" disabled={uploading} onChange={async (event) => {
          const file = event.target.files?.[0]; if (!file) return;
          if (!submission.limits.allowedMimeTypes.includes(file.type) || file.size > submission.limits.maxFileBytes) { notify.error(new Error("invalid"), "Choose a supported file within the size limit."); return; }
          setUploading(true);
          try {
            const intent = await classesApi.uploadIntent(classId, assignmentId, file.name, file.type, file.size);
            await new Promise<void>((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open("PUT", intent.uploadUrl); for (const [name, value] of Object.entries(intent.requiredHeaders)) xhr.setRequestHeader(name, value); xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload")); xhr.onerror = () => reject(new Error("upload")); xhr.send(file); });
            const uploaded = await classesApi.finalizeSubmissionFile(intent.file.id);
            const value = await classesApi.saveSubmissionDraft(classId, assignmentId, text, [...submission.draftFiles.map((item) => item.id), uploaded.id], submission.draftRevision);
            setSubmission(value); notify.success("Attachment uploaded.");
          } catch (error) { notify.error(error, "Attachment could not be uploaded."); } finally { setUploading(false); event.target.value = ""; }
        }} />
      </label>
      {submission.draftFiles.map((file) => <p key={file.id}>{file.originalName} · {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>)}
      {submission.unavailableReason && (
        <p role="status">{submission.unavailableReason}</p>
      )}
      <button
        className="button button-primary"
        disabled={saving || (!submission.canSubmit && !submission.canResubmit)}
        onClick={async () => {
          await save();
          setConfirming(true);
        }}
      >
        Submit work
      </button>
      {submission.attempts.length > 0 && (
        <div>
          <h3>Attempt history</h3>
          {submission.attempts.map((attempt) => (
            <article key={attempt.id}>
              <strong>Attempt {attempt.attemptNumber}</strong>
              <time>{new Date(attempt.submittedAt).toLocaleString()}</time>
              {attempt.isLate && <span>Late</span>}
              <p>{attempt.typedText ? "Written response" : "No typed response"}{attempt.files.length ? ` · ${attempt.files.length} file${attempt.files.length === 1 ? "" : "s"}` : ""}</p>
              <Link className="button button-secondary button-small" href={`/student/classes/${classId}/assignments/${assignmentId}/submissions/${submission.id}/attempts/${attempt.id}`}>View Review</Link>
            </article>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title="Submit this attempt?"
        description="A timestamped, immutable snapshot of your current work will be saved."
        confirmLabel="Submit attempt"
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          const result = await classesApi.submitAssignment(
            classId,
            assignmentId,
          );
          notify.success("Assignment submitted.");
          router.replace(`/student/classes/${classId}/assignments/${assignmentId}/submissions/${result.submission.id}/attempts/${result.attempt.id}`);
        }}
      />
    </section>
  );
}
