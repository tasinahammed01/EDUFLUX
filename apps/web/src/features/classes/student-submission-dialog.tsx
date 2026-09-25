"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronUp, FileText, Image as ImageIcon, LoaderCircle, UploadCloud, X } from "lucide-react";
import type { AssignmentDto, SubmissionDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { notify } from "@/lib/notifications";
import { aggregateUploadPercentage, uploadToPresignedUrl } from "./submission-upload";

type Method = "image" | "pdf";
type Stage = "idle" | "preparing" | "uploading" | "verifying" | "saving" | "submitting" | "complete";
type LocalFile = { id: string; file: File; previewUrl?: string };

export function StudentSubmissionDialog({ assignment, classId, onClose }: { assignment: AssignmentDto; classId: string; onClose: () => void }) {
  const router = useRouter();
  const titleId = useId(), descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null), firstFocusRef = useRef<HTMLButtonElement>(null);
  const submitLock = useRef(false);
  const previewUrlsRef = useRef<string[]>([]);
  const [submission, setSubmission] = useState<SubmissionDto | null>(null);
  const [method, setMethod] = useState<Method>("image");
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<Stage>("idle"), [progress, setProgress] = useState(0), [uploadedBytes, setUploadedBytes] = useState(0), [error, setError] = useState("");
  const locked = stage !== "idle";

  useEffect(() => {
    let active = true;
    classesApi.submission(classId, assignment.id).then((value) => {
      if (!active) return;
      setSubmission(value); setLoading(false);
    }).catch((caught) => { if (active) { setLoading(false); setError(caught instanceof Error ? caught.message : "Submission could not be opened."); } });
    return () => { active = false; };
  }, [assignment.id, classId]);

  useEffect(() => () => previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  useEffect(() => {
    firstFocusRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitLock.current) onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); };
  }, [onClose]);

  function selectFiles(selected: File[]) {
    if (!submission) return;
    setError("");
    const matchesMethod = (file: File) => method === "image" ? file.type.startsWith("image/") : method === "pdf" ? file.type === "application/pdf" : true;
    if (selected.some((file) => !matchesMethod(file))) { setError(method === "image" ? "Choose JPG, PNG, or WebP images in Image mode." : "Choose PDF files in PDF mode."); return; }
    const allowed = selected.filter((file) => submission.limits.allowedMimeTypes.includes(file.type));
    if (allowed.length !== selected.length) { setError("Choose JPG, PNG, WebP, or PDF files only."); return; }
    if (allowed.some((file) => file.size > submission.limits.maxFileBytes)) { setError("One or more files exceed the per-file upload limit."); return; }
    const combined = [...files.map((item) => item.file), ...allowed];
    if (submission.draftFiles.length + combined.length > submission.limits.maxFiles || submission.draftFiles.reduce((sum, file) => sum + file.sizeBytes, 0) + combined.reduce((sum, file) => sum + file.size, 0) > submission.limits.maxTotalBytes) { setError("These files exceed the submission file count or total-size limit."); return; }
    setFiles((current) => [...current, ...allowed.map((file) => {
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      if (previewUrl) previewUrlsRef.current.push(previewUrl);
      return { id: `${file.name}-${file.size}-${file.lastModified}`, file, ...(previewUrl ? { previewUrl } : {}) };
    })]);
  }

  async function removeReadyFile(fileId: string) {
    if (!submission || locked) return;
    setSaving(true); setError("");
    try {
      await classesApi.removeSubmissionFile(fileId);
      const value = await classesApi.saveSubmissionDraft(classId, assignment.id, "", submission.draftFiles.filter((file) => file.id !== fileId).map((file) => file.id), submission.draftRevision);
      setSubmission(value);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The attachment could not be removed."); }
    finally { setSaving(false); }
  }

  async function moveReadyFile(index: number, direction: -1 | 1) {
    if (!submission || locked || saving) return;
    const destination = index + direction;
    if (destination < 0 || destination >= submission.draftFiles.length) return;
    const ordered = [...submission.draftFiles];
    [ordered[index], ordered[destination]] = [ordered[destination]!, ordered[index]!];
    setSaving(true); setError("");
    try {
      const value = await classesApi.reorderSubmissionFiles(
        classId,
        assignment.id,
        ordered.map((file) => file.id),
        submission.draftRevision,
      );
      setSubmission(value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The page order could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!submission || submitLock.current || (!submission.canSubmit && !submission.canResubmit)) return;
    if (!submission.draftFiles.length && !files.length) { setError("Upload at least one image or PDF before submitting."); return; }
    submitLock.current = true; setError(""); setStage("preparing"); setProgress(0); setUploadedBytes(0);
    try {
      let working = submission;
      const totalBytes = files.reduce((sum, item) => sum + item.file.size, 0);
      let completedBytes = 0;
      for (const item of [...files]) {
        setStage("preparing");
        const intent = await classesApi.uploadIntent(classId, assignment.id, item.file.name, item.file.type, item.file.size);
        setStage("uploading");
        await uploadToPresignedUrl(item.file, intent.uploadUrl, intent.requiredHeaders, (currentBytes) => { setUploadedBytes(completedBytes + currentBytes); setProgress(aggregateUploadPercentage(completedBytes, currentBytes, totalBytes)); });
        completedBytes += item.file.size; setUploadedBytes(completedBytes); setProgress(aggregateUploadPercentage(completedBytes, 0, totalBytes));
        setStage("verifying");
        const uploaded = await classesApi.finalizeSubmissionFile(intent.file.id);
        setStage("saving");
        working = await classesApi.saveSubmissionDraft(classId, assignment.id, "", [...working.draftFiles.map((file) => file.id), uploaded.id], working.draftRevision);
        setSubmission(working);
        setFiles((current) => current.filter((candidate) => candidate.id !== item.id));
      }
      setStage("submitting");
      const result = await classesApi.submitAssignment(classId, assignment.id);
      setStage("complete");
      notify.success("Assignment submitted.");
      router.replace(`/student/classes/${classId}/assignments/${assignment.id}/submissions/${result.submission.id}/attempts/${result.attempt.id}`);
    } catch (caught) {
      submitLock.current = false; setStage("idle");
      const message = caught instanceof Error ? caught.message : "Submission could not be completed. Your draft is still available.";
      setError(message); notify.error(caught, message);
    }
  }

  const attemptNumber = Math.min((submission?.latestAttemptNumber ?? assignment.studentSubmission?.latestAttemptNumber ?? 0) + 1, assignment.allowResubmission ? (assignment.maxAttempts ?? Number.MAX_SAFE_INTEGER) : 1);
  const attemptLimit = assignment.allowResubmission ? assignment.maxAttempts : 1;
  const stageLabel = stage === "preparing" ? "Preparing upload…" : stage === "uploading" ? `Uploading files — ${progress}%` : stage === "verifying" ? "Verifying upload…" : stage === "saving" ? "Saving submission…" : stage === "submitting" ? "Submitting immutable attempt…" : stage === "complete" ? "Submission complete" : "";
  return <div className="submission-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !locked) onClose(); }}>
    <div ref={dialogRef} className="student-submission-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <header className="submission-dialog-header"><div><p className="eyebrow">Student submission</p><h2 id={titleId}>{assignment.title}</h2><p id={descriptionId}>{assignment.instructions || assignment.description || "No additional instructions."}</p></div><button ref={firstFocusRef} type="button" className="submission-dialog-close" aria-label="Close submission" disabled={locked} onClick={onClose}><X /></button></header>
      <div className="submission-context"><span><small>Due</small><strong>{assignment.dueAt ? new Date(assignment.dueAt).toLocaleString() : "No due date"}</strong></span><span><small>Maximum score</small><strong>{assignment.maxScore}</strong></span><span><small>Attempt</small><strong>{attemptLimit ? `${attemptNumber} of ${attemptLimit}` : attemptNumber}</strong></span>{submission?.isLate && <span className="submission-late"><small>Status</small><strong>Late submission</strong></span>}</div>
      {assignment.rubric && <details className="submission-rubric"><summary>View rubric summary</summary>{assignment.rubric.criteria.map((criterion) => <span key={criterion.id}>{criterion.title} <strong>{criterion.weight}%</strong></span>)}</details>}
      {loading ? <div className="submission-dialog-loading"><LoaderCircle className="spinner" /> Loading your draft…</div> : submission && <>
        <div><h3 className="submission-method-heading">Choose submission type</h3><div className="submission-methods" role="tablist" aria-label="Submission method">{(["image", "pdf"] as Method[]).map((value) => <button key={value} type="button" role="tab" aria-selected={method === value} disabled={locked} onClick={() => setMethod(value)}>{value === "image" ? <ImageIcon /> : <FileText />}<span><strong>{value === "image" ? "Image" : "PDF"}</strong><small>{value === "image" ? "JPG, PNG, WEBP" : "PDF document"}</small></span></button>)}</div></div>
        <FileDropZone method={method} disabled={locked} onFiles={selectFiles} maxFileBytes={submission.limits.maxFileBytes} maxFiles={submission.limits.maxFiles} />
        {(submission.draftFiles.length > 0 || files.length > 0) && <div className="submission-attachments"><h3>Uploaded files</h3>{submission.draftFiles.map((file, index) => <div key={file.id}><span className="submission-page-number">Page {index + 1}</span><FileText /><span title={file.originalName}><strong>{file.originalName}</strong><small>{formatBytes(file.sizeBytes)} · Ready</small></span><CheckCircle2 className="file-ready" /><span className="submission-order-actions"><button type="button" aria-label={`Move ${file.originalName} up`} title="Move up" disabled={locked || saving || index === 0} onClick={() => void moveReadyFile(index, -1)}><ChevronUp /></button><button type="button" aria-label={`Move ${file.originalName} down`} title="Move down" disabled={locked || saving || index === submission.draftFiles.length - 1} onClick={() => void moveReadyFile(index, 1)}><ChevronDown /></button><button type="button" aria-label={`Remove ${file.originalName}`} title="Remove" disabled={locked || saving} onClick={() => void removeReadyFile(file.id)}><X /></button></span></div>)}{files.map((item, index) => <div key={item.id}><span className="submission-page-number">Page {submission.draftFiles.length + index + 1}</span>{item.previewUrl ? <Image src={item.previewUrl} alt="" width={40} height={40} unoptimized /> : <FileText />}<span title={item.file.name}><strong>{item.file.name}</strong><small>{formatBytes(item.file.size)} · Ready to upload</small></span><button type="button" aria-label={`Remove ${item.file.name}`} disabled={locked} onClick={() => setFiles((current) => current.filter((file) => file.id !== item.id))}><X /></button></div>)}</div>}
        {submission.attempts.length > 0 && <section className="submission-attempt-history" aria-labelledby="attempt-history-title"><h3 id="attempt-history-title">Attempt history</h3>{submission.attempts.map((attempt) => <Link key={attempt.id} href={`/student/classes/${classId}/assignments/${assignment.id}/submissions/${submission.id}/attempts/${attempt.id}`}><span><strong>Attempt {attempt.attemptNumber}</strong><small>{new Date(attempt.submittedAt).toLocaleString()}{attempt.isLate ? " · Late" : ""}</small></span><span>View submission</span></Link>)}</section>}
        {stage !== "idle" && <div className="submission-progress" aria-live="polite"><div><strong>{stage === "uploading" ? "Uploading assignment" : stageLabel}</strong>{stage === "uploading" && <span>{progress}%</span>}</div>{stage === "uploading" && <><div className="submission-progress-track" role="progressbar" aria-label="File upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div><small>Uploading {formatBytes(uploadedBytes)} of {formatBytes(files.reduce((sum, item) => sum + item.file.size, 0))}</small></>}</div>}
        {submission.unavailableReason && <p className="submission-notice" role="status">{submission.unavailableReason}</p>}
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button type="button" className="button button-ghost" disabled={locked} onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={loading || locked || !submission || (!submission.canSubmit && !submission.canResubmit)} onClick={() => void submit()}>{locked && <LoaderCircle className="spinner" />} {stage === "idle" ? "Submit Assignment" : stage === "complete" ? "Submitted" : "Working…"}</button></footer>
    </div>
  </div>;
}

function FileDropZone({ method, disabled, onFiles, maxFileBytes, maxFiles }: { method: "image" | "pdf"; disabled: boolean; onFiles: (files: File[]) => void; maxFileBytes: number; maxFiles: number }) {
  const accept = method === "image" ? "image/jpeg,image/png,image/webp" : "application/pdf";
  return <label className="submission-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!disabled) onFiles([...event.dataTransfer.files]); }}><UploadCloud /><strong>Drag and drop {method === "image" ? "images" : "PDF files"}</strong><span>or <b>Browse Files</b></span><small>{method === "image" ? "JPG, PNG, WEBP" : "PDF"} · Up to {maxFiles} files · {formatBytes(maxFileBytes)} each</small><input type="file" multiple hidden accept={accept} disabled={disabled} onChange={(event) => { onFiles([...(event.target.files ?? [])]); event.target.value = ""; }} /></label>;
}

function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
