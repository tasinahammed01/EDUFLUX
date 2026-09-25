"use client";
/* eslint-disable @next/next/no-img-element -- signed R2 URLs intentionally bypass image optimization */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SubmissionReviewDto } from "@eduflux/shared-types";
import {
  BookOpen,
  Check,
  FileImage,
  FileText,
  LoaderCircle,
  X,
} from "lucide-react";
import { notify } from "@/lib/notifications";
import {
  aggregateCorrectionStats,
  CATEGORY_LABELS,
  CORRECTION_CATEGORIES,
  CORRECTION_LEGEND,
  normalizeCorrection,
  type CorrectionCategory,
} from "./correction-taxonomy";
type Issue = SubmissionReviewDto["issues"][number];

export function SubmissionReview({
  review,
  onSaveComment,
  onRefreshFiles,
  onRetryEvaluation,
}: {
  review: SubmissionReviewDto;
  onSaveComment?: (comment: string) => Promise<SubmissionReviewDto>;
  onRefreshFiles?: () => Promise<void>;
  onRetryEvaluation?: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"file" | "text">(
    review.transcribedText || review.typedText ? "text" : "file",
  );
  const [fileIndex, setFileIndex] = useState(0),
    [pageNumber, setPageNumber] = useState(1);
  const [comment, setComment] = useState(review.teacherComment ?? ""),
    [saving, setSaving] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null),
    [legendOpen, setLegendOpen] = useState(false);
  const [issueAnchor, setIssueAnchor] = useState<DOMRect | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const refreshedFiles = useRef(new Set<string>());
  const refreshFile = async (fileId: string) => {
    if (!onRefreshFiles || refreshedFiles.current.has(fileId)) return false;
    refreshedFiles.current.add(fileId);
    await onRefreshFiles();
    return true;
  };
  const selectIssue = (id: string, element?: HTMLElement) => {
    setSelectedIssueId(id);
    if (element) setIssueAnchor(element.getBoundingClientRect());
  };
  const selectedIssue = useMemo(
    () => review.issues.find((issue) => issue.id === selectedIssueId),
    [review.issues, selectedIssueId],
  );
  const stats = useMemo(
    () => aggregateCorrectionStats(review.issues),
    [review.issues],
  );
  const issueGroups = useMemo(
    () => groupIssues(review.issues),
    [review.issues],
  );
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedIssueId(null);
        setLegendOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const firstRenderableIndex = review.files.findIndex((item) =>
    Boolean(item.contentUrl),
  );
  const activeFileIndex = review.files[fileIndex]?.contentUrl
    ? fileIndex
    : Math.max(0, firstRenderableIndex);
  const file = review.files[activeFileIndex],
    pages =
      review.ocrPages?.filter((page) => page.sourceFileId === file?.id) ?? [];
  if (review.status === "PENDING" || review.status === "PROCESSING")
    return <ProcessingReview review={review} />;
  if (review.status === "FAILED") {
    const hasReadableWork = Boolean(
      review.transcribedText || review.typedText || review.ocrPages?.length,
    );
    return (
      <div className="submission-review review-failed-review">
        <section
          className="review-status review-failed workspace-card"
          aria-live="polite"
        >
          <h1>Automated feedback couldn&apos;t be completed.</h1>
          <p>
            {hasReadableWork
              ? "Your submission and transcription are safely stored."
              : (review.statusMessage ??
                "Your submission is safely stored, but its transcription could not be completed.")}
          </p>
          {review.failureStage === "AI_EVALUATION" && onRetryEvaluation && (
            <button
              type="button"
              className="button button-primary"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true);
                try {
                  await onRetryEvaluation();
                } catch (error) {
                  notify.error(error, "Automated review could not be retried yet.");
                  setRetrying(false);
                }
              }}
            >
              {retrying
                ? "Retrying automated review..."
                : "Retry automated review"}
            </button>
          )}
          {!hasReadableWork && review.files.length > 0 && (
            <div className="review-preserved-files">
              <h2>Submitted work</h2>
              {review.files.map((storedFile) => (
                <a
                  key={storedFile.id}
                  href={storedFile.contentUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileImage />
                  {storedFile.originalName}
                </a>
              ))}
            </div>
          )}
        </section>
        {hasReadableWork && (
          <section className="review-frame">
            <header className="review-frame-header">
              <div>
                <p className="eyebrow">Student work</p>
                <h2>
                  {mode === "text"
                    ? "Student's Transcribed Text"
                    : "Student's Uploaded Work"}
                </h2>
              </div>
              <button
                className="review-mode-action"
                disabled={mode === "text" && !file}
                onClick={() => setMode(mode === "text" ? "file" : "text")}
              >
                {mode === "text" ? <FileImage /> : <FileText />}
                {mode === "text"
                  ? "View Uploaded Work"
                  : "View Transcribed Text"}
              </button>
            </header>
            <div className="review-failed-content">
              <section className="review-work-panel">
                {mode === "file" && file ? (
                  <ReviewFile
                    review={review}
                    file={file}
                    files={review.files}
                    fileIndex={activeFileIndex}
                    setFileIndex={setFileIndex}
                    pages={pages}
                    pageNumber={pageNumber}
                    setPageNumber={setPageNumber}
                    selectedIssueId={null}
                    onSelectIssue={() => undefined}
                    onPreviewError={refreshFile}
                    showLabels={false}
                    onToggleLabels={() => undefined}
                  />
                ) : (
                  <ReviewText
                    review={review}
                    selectedIssueId={null}
                    onSelectIssue={() => undefined}
                  />
                )}
              </section>
            </div>
          </section>
        )}
      </div>
    );
  }
  return (
    <div className="submission-review">
      <header className="review-identity">
        <div>
          <p className="eyebrow">Submission review</p>
          <h1>{review.student.displayName}</h1>
          <p>
            Attempt {review.attemptNumber} <span>•</span> Rubric revision{" "}
            {review.rubricRevisionNumber ?? "—"}
          </p>
          <p>Submitted {new Date(review.submittedAt).toLocaleString()}</p>
        </div>
      </header>
      <section className="review-frame">
        <header className="review-frame-header">
          <div>
            <p className="eyebrow">Student work</p>
            <h2>
              {mode === "text"
                ? "Student's Transcribed Text"
                : "Student's Uploaded Work"}
            </h2>
          </div>
          <button
            className="review-mode-action"
            disabled={mode === "text" && !file}
            onClick={() => setMode(mode === "text" ? "file" : "text")}
          >
            {mode === "text" ? <FileImage /> : <FileText />}
            {mode === "text" ? "View Uploaded Work" : "View Transcribed Text"}
          </button>
        </header>
        <div className="review-layout">
          <aside className="review-sidebar">
            <section className="review-side-card review-score-card">
              <div className="review-side-heading">
                <h2>Overall Score</h2>
                <strong>
                  {review.overallScore ?? "—"} / {review.maxScore ?? "—"}
                </strong>
              </div>
              <ScoreRing score={review.overallScore} max={review.maxScore} />
              {review.feedbackSections[0]?.summary && (
                <p>{review.feedbackSections[0].summary}</p>
              )}
            </section>
            <StatisticsCard stats={stats} />
            <LegendCard
              issues={review.issues}
              onOpen={() => setLegendOpen(true)}
            />
          </aside>
          <main className="review-content-column">
            <section className="review-work-panel">
              <header className="review-work-meta">
                <div>
                  <h2>{review.student.displayName}&apos;s submission</h2>
                  <p>
                    {review.student.email} <span>•</span>{" "}
                    {new Date(review.submittedAt).toLocaleDateString()}
                  </p>
                </div>
                {review.typedText && !review.transcribedText && (
                  <span>Typed submission</span>
                )}
              </header>
              {mode === "file" && file ? (
                <ReviewFile
                  review={review}
                  file={file}
                  files={review.files}
                  fileIndex={activeFileIndex}
                  setFileIndex={setFileIndex}
                  pages={pages}
                  pageNumber={pageNumber}
                  setPageNumber={setPageNumber}
                  selectedIssueId={selectedIssueId}
                  onSelectIssue={selectIssue}
                  onPreviewError={refreshFile}
                  showLabels={showLabels}
                  onToggleLabels={() => setShowLabels(!showLabels)}
                />
              ) : (
                <ReviewText
                  review={review}
                  selectedIssueId={selectedIssueId}
                  onSelectIssue={selectIssue}
                />
              )}
            </section>
            <FeedbackGrid groups={issueGroups} onSelect={selectIssue} />
            <section className="review-section">
              <header>
                <h2>What Worked Well</h2>
                <p>Evidence-based strengths from this submission</p>
              </header>
              <div className="strength-grid">
                {review.strengths.map((strength) => (
                  <article key={strength.title}>
                    <h3>{formatLabel(strength.title)}</h3>
                    <p>{strength.description}</p>
                  </article>
                ))}
              </div>
            </section>
            <RubricEvaluation sections={review.feedbackSections} />
            <section className="workspace-card review-comments">
              <h2>Teacher Comments</h2>
              {onSaveComment ? (
                <>
                  <textarea
                    rows={4}
                    maxLength={5000}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    aria-label="Teacher comment"
                  />
                  <button
                    className="button button-primary"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        const value = await onSaveComment(comment);
                        setComment(value.teacherComment ?? "");
                        notify.success("Comment saved.");
                      } catch (error) {
                        notify.error(error, "Comment could not be saved.");
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    {saving ? "Saving…" : "Save Comment"}
                  </button>
                </>
              ) : (
                <p>{review.teacherComment || "No teacher comment yet."}</p>
              )}
            </section>
          </main>
        </div>
      </section>
      {selectedIssue && (
        <IssuePopover
          issue={selectedIssue}
          anchor={issueAnchor}
          onClose={() => setSelectedIssueId(null)}
        />
      )}{" "}
      {legendOpen && <LegendDialog onClose={() => setLegendOpen(false)} />}
    </div>
  );
}

function ProcessingReview({ review }: { review: SubmissionReviewDto }) {
  const stages = ["PENDING", "OCR", "AI_EVALUATION", "FINALIZING"] as const;
  const active = Math.max(
    0,
    stages.findIndex(
      (stage) =>
        stage ===
        (review.processingStage ??
          (review.status === "PROCESSING" ? "OCR" : "PENDING")),
    ),
  );
  const steps = [
    "Upload complete",
    "Reading uploaded work",
    "Analyzing errors",
    "Preparing feedback",
  ];
  const stageTitles = [
    "Preparing your review...",
    "Reading your uploaded work...",
    "Analyzing your work...",
    "Preparing your feedback...",
  ];
  return (
    <section className="review-processing workspace-card" aria-live="polite">
      <div className="review-processing-orbit">
        <LoaderCircle />
      </div>
      <p className="eyebrow">Submission received</p>
      <h1>{review.statusMessage ?? stageTitles[active]}</h1>
      <p>Your assignment is safely stored. This page updates automatically.</p>
      <ol>
        {steps.map((label, index) => (
          <li
            key={label}
            className={
              index < active ? "done" : index === active ? "active" : ""
            }
          >
            {index < active ? <Check /> : <span>{index + 1}</span>}
            <strong>{label}</strong>
          </li>
        ))}
      </ol>
      <div className="review-processing-skeleton">
        <i />
        <i />
        <i />
      </div>
    </section>
  );
}

function ScoreRing({
  score,
  max,
}: {
  score: number | undefined;
  max: number | undefined;
}) {
  const pct = score !== undefined && max ? Math.round((score / max) * 100) : 0;
  return (
    <div
      className="review-score-ring"
      style={{ "--score": `${pct * 3.6}deg` } as React.CSSProperties}
      role="img"
      aria-label={`Score ${score ?? "not available"} out of ${max ?? "not available"}`}
    >
      <span>
        <strong>{score ?? "—"}</strong>
        <small>of {max ?? "—"}</small>
      </span>
    </div>
  );
}
function StatisticsCard({
  stats,
}: {
  stats: Record<CorrectionCategory, number>;
}) {
  const max = Math.max(...Object.values(stats), 0);
  return (
    <section className="review-side-card">
      <h2>Correction Statistics</h2>
      <div className="review-stat-list">
        {CORRECTION_CATEGORIES.map((category) => (
          <div key={category} data-category={category}>
            <span>
              <b>{CATEGORY_LABELS[category]} Issues</b>
              <strong>{stats[category]}</strong>
            </span>
            <div>
              <i
                style={{
                  width: max ? `${(stats[category] / max) * 100}%` : "0%",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
function LegendCard({
  issues,
  onOpen,
}: {
  issues: Issue[];
  onOpen: () => void;
}) {
  const unique = new Map(
    issues.map((issue) => {
      const display = normalizeCorrection(
        issue.code,
        issue.category,
        issue.label,
      );
      return [display.code, display];
    }),
  );
  return (
    <section className="review-side-card">
      <div className="review-side-heading">
        <h2>Correction Legend</h2>
        <BookOpen />
      </div>
      <div className="review-legend-compact">
        {[...unique.values()].map((display) => (
          <div key={display.code} data-category={display.category}>
            <code>{display.code}</code>
            <span>{display.label}</span>
          </div>
        ))}
      </div>
      <button className="review-legend-open" onClick={onOpen}>
        View full correction legend
      </button>
    </section>
  );
}

type SelectIssue = (id: string, element?: HTMLElement) => void;
function ReviewFile({
  review,
  file,
  files,
  fileIndex,
  setFileIndex,
  pages,
  pageNumber,
  setPageNumber,
  selectedIssueId,
  onSelectIssue,
  onPreviewError,
  showLabels,
  onToggleLabels,
}: {
  review: SubmissionReviewDto;
  file: SubmissionReviewDto["files"][number];
  files: SubmissionReviewDto["files"];
  fileIndex: number;
  setFileIndex: (v: number) => void;
  pages: NonNullable<SubmissionReviewDto["ocrPages"]>;
  pageNumber: number;
  setPageNumber: (v: number) => void;
  selectedIssueId: string | null;
  onSelectIssue: SelectIssue;
  onPreviewError: (fileId: string) => Promise<boolean>;
  showLabels: boolean;
  onToggleLabels: () => void;
}) {
  return (
    <div className="review-file">
      {files.length > 1 && (
        <div className="review-file-picker">
          {files.map((item, index) => (
            <button
              key={item.id}
              title={item.originalName}
              className={index === fileIndex ? "active" : ""}
              onClick={() => {
                setFileIndex(index);
                setPageNumber(1);
              }}
            >
              Page {index + 1}
            </button>
          ))}
        </div>
      )}
      {pages.length > 1 && (
        <div className="review-page-picker">
          {pages.map((page) => (
            <button
              key={page.pageNumber}
              aria-pressed={pageNumber === page.pageNumber}
              onClick={() => setPageNumber(page.pageNumber)}
            >
              Page {page.pageNumber}
            </button>
          ))}
        </div>
      )}
      {file.mimeType.startsWith("image/") ? (
        <ReviewImage
          key={`${file.id}-${pageNumber}-${file.contentUrl}`}
          src={file.contentUrl}
          name={file.originalName}
          page={pages.find((p) => p.pageNumber === pageNumber)}
          issues={review.issues}
          selectedIssueId={selectedIssueId}
          onSelectIssue={onSelectIssue}
          onPreviewError={() => onPreviewError(file.id)}
          showLabels={showLabels}
        />
      ) : (
        <iframe
          src={`${file.contentUrl}#page=${pageNumber}`}
          title={file.originalName}
        />
      )}
      <div className="review-file-footer">
        <small className="review-active-filename" title={file.originalName}>
          {file.originalName}
        </small>
        <div className="review-file-actions">
          <button
            type="button"
            className="review-label-toggle"
            onClick={onToggleLabels}
            aria-pressed={showLabels}
            title={showLabels ? "Hide error codes" : "Show error codes"}
          >
            Labels {showLabels ? "ON" : "OFF"}
          </button>
          <a
            href={file.contentUrl}
            target="_blank"
            rel="noreferrer"
            className="review-original-link"
          >
            <FileImage />
            Original
          </a>
        </div>
      </div>
    </div>
  );
}
function ReviewImage({
  src,
  name,
  page,
  issues,
  selectedIssueId,
  onSelectIssue,
  onPreviewError,
  showLabels,
}: {
  src: string | undefined;
  name: string;
  page: NonNullable<SubmissionReviewDto["ocrPages"]>[number] | undefined;
  issues: Issue[];
  selectedIssueId: string | null;
  onSelectIssue: SelectIssue;
  onPreviewError: () => Promise<boolean>;
  showLabels: boolean;
}) {
  const [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false);
  const segments = useMemo(
    () => buildAnnotationSegments(page, issues),
    [page, issues],
  );
  if (!src || failed)
    return (
      <div className="review-file-fallback">
        <FileImage />
        <strong>Preview unavailable</strong>
        <p>
          The submitted file is still safely stored. Refresh the review to
          request a new secure preview link.
        </p>
      </div>
    );
  return (
    <div className={`review-image-stage${loaded ? " loaded" : " loading"}`}>
      {!loaded && (
        <div className="review-image-loading">
          <LoaderCircle />
          <span>Loading submitted work…</span>
        </div>
      )}
      <img
        src={src}
        alt={`Submitted file ${name}`}
        onLoad={() => setLoaded(true)}
        onError={() => {
          void onPreviewError()
            .then((refreshing) => {
              if (!refreshing) setFailed(true);
            })
            .catch(() => setFailed(true));
        }}
      />
      {loaded &&
        segments.map(({ issue, box, isFirst }, index) => {
          const d = normalizeCorrection(
            issue.code,
            issue.category,
            issue.label,
          );
          const isSelected = selectedIssueId === issue.id;
          const shouldShowLabel = showLabels || isSelected;
          return (
            <button
              key={`${issue.id}-${index}`}
              data-category={d.category}
              data-show-label={shouldShowLabel}
              className={`review-image-annotation${isSelected ? " selected" : ""}`}
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
              }}
              aria-label={`${d.code}: ${issue.explanation ?? d.label}`}
              onClick={(event) => onSelectIssue(issue.id, event.currentTarget)}
            >
              {isFirst && (
                <span data-testid={`annotation-badge-${issue.id}`}>
                  {d.code}
                </span>
              )}
            </button>
          );
        })}
    </div>
  );
}
function ReviewText({
  review,
  selectedIssueId,
  onSelectIssue,
}: {
  review: SubmissionReviewDto;
  selectedIssueId: string | null;
  onSelectIssue: SelectIssue;
}) {
  const pages = review.ocrPages ?? [];
  const fileNames = new Map(
    review.files.map((file) => [file.id, file.originalName]),
  );
  const ocrBase = review.transcribedText
    ? Math.max(0, review.effectiveText.indexOf(review.transcribedText))
    : 0;
  return (
    <div className="review-text review-transcription">
      {review.typedText && (
        <section className="review-text-page">
          <p className="review-page-label">Typed submission</p>
          <HighlightedText
            text={review.typedText.replace(/^Typed response:\s*/i, "")}
            issues={review.issues.filter(
              (issue) => !issue.source || issue.source === "TYPED",
            )}
            selectedIssueId={selectedIssueId}
            onSelectIssue={onSelectIssue}
          />
        </section>
      )}
      {pages.length
        ? pages.map((page, index) => {
            const base = ocrBase + page.startOffset;
            const localIssues = review.issues
              .filter(
                (issue) =>
                  issue.sourceFileId === page.sourceFileId &&
                  issue.pageNumbers?.includes(page.pageNumber),
              )
              .map((issue) => ({
                ...issue,
                ...(issue.startIndex === undefined
                  ? {}
                  : { startIndex: issue.startIndex - base }),
                ...(issue.endIndex === undefined
                  ? {}
                  : { endIndex: issue.endIndex - base }),
              }));
            return (
              <section
                className="review-text-page"
                key={`${page.sourceFileId}-${page.pageNumber}`}
              >
                <p className="review-page-label">
                  Page {index + 1} ·{" "}
                  {fileNames.get(page.sourceFileId) ?? "Uploaded work"}
                </p>
                <HighlightedText
                  text={page.text}
                  issues={localIssues}
                  selectedIssueId={selectedIssueId}
                  onSelectIssue={onSelectIssue}
                />
              </section>
            );
          })
        : !review.typedText && (
            <HighlightedText
              text={review.transcribedText}
              issues={review.issues}
              selectedIssueId={selectedIssueId}
              onSelectIssue={onSelectIssue}
            />
          )}
    </div>
  );
}
function HighlightedText({
  text,
  issues,
  selectedIssueId,
  onSelectIssue,
}: {
  text: string;
  issues: Issue[];
  selectedIssueId: string | null;
  onSelectIssue: SelectIssue;
}) {
  if (!text)
    return <p className="review-page-text">No readable text was found.</p>;
  const ranged = issues
    .filter(
      (i) =>
        i.startIndex !== undefined &&
        i.endIndex !== undefined &&
        i.startIndex >= 0 &&
        i.endIndex > i.startIndex &&
        i.endIndex <= text.length,
    )
    .sort((a, b) => a.startIndex! - b.startIndex!);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const issue of ranged) {
    if (issue.startIndex! < cursor) continue;
    const d = normalizeCorrection(issue.code, issue.category, issue.label);
    parts.push(text.slice(cursor, issue.startIndex));
    parts.push(
      <mark
        key={issue.id}
        data-category={d.category}
        className={`review-issue-highlight${selectedIssueId === issue.id ? " selected" : ""}`}
        tabIndex={0}
        role="button"
        aria-label={`${issue.originalText}: ${issue.explanation ?? d.label}`}
        title={`${d.code} · ${d.label}. Click for details`}
        onClick={(event) => onSelectIssue(issue.id, event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectIssue(issue.id, event.currentTarget);
          }
        }}
      >
        {text.slice(issue.startIndex, issue.endIndex)}
      </mark>,
    );
    cursor = issue.endIndex!;
  }
  parts.push(text.slice(cursor));
  return <p className="review-page-text">{parts}</p>;
}

function buildAnnotationSegments(
  page: NonNullable<SubmissionReviewDto["ocrPages"]>[number] | undefined,
  issues: Issue[],
) {
  if (!page) return [];
  const words = new Map(page.words.map((word) => [word.id, word]));
  return issues.flatMap((issue) => {
    if (
      issue.sourceFileId !== page.sourceFileId ||
      !issue.pageNumbers?.includes(page.pageNumber)
    )
      return [];
    const boxes = (issue.wordIds ?? [])
      .flatMap((id) => {
        const word = words.get(id);
        return word ? [word.boundingBox] : [];
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const merged: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];
    for (const box of boxes) {
      const last = merged.at(-1);
      if (
        last &&
        Math.abs(last.y - box.y) <= Math.max(last.height, box.height) * 0.55 &&
        box.x - (last.x + last.width) <= 0.025
      ) {
        const right = Math.max(last.x + last.width, box.x + box.width);
        last.y = Math.min(last.y, box.y);
        last.height = Math.max(last.height, box.height);
        last.width = right - last.x;
      } else merged.push({ ...box });
    }
    return merged.map((box, index) => ({ issue, box, isFirst: index === 0 }));
  });
}

function FeedbackGrid({
  groups,
  onSelect,
}: {
  groups: Map<CorrectionCategory, Issue[]>;
  onSelect: SelectIssue;
}) {
  const [expanded, setExpanded] = useState<CorrectionCategory[]>([]);
  return (
    <section className="review-section review-coaching-section">
      <header>
        <h2>Areas for Improvement</h2>
        <h3>Detailed Feedback &amp; Suggestions</h3>
        <p>Focus your next revision on these skills and practice steps.</p>
      </header>
      <div className="review-feedback-grid">
        {[...groups].map(([category, issues]) => {
          const isExpanded = expanded.includes(category);
          const visibleIssues = isExpanded ? issues : issues.slice(0, 4);
          return (
            <article key={category} data-category={category}>
              <header>
                <div>
                  <span className="review-category-mark" aria-hidden="true" />
                  <h3>{CATEGORY_LABELS[category]}</h3>
                </div>
                <span>
                  {issues.length} {issues.length === 1 ? "issue" : "issues"}
                </span>
              </header>
              <p className="review-coaching-summary">
                {coachingSummary(category)}
              </p>
              <h4>Skills to strengthen</h4>
              <div className="review-coaching-list">
                {visibleIssues.map((issue) => {
                  const d = normalizeCorrection(
                    issue.code,
                    issue.category,
                    issue.label,
                  );
                  return (
                    <button
                      key={issue.id}
                      onClick={(event) =>
                        onSelect(issue.id, event.currentTarget)
                      }
                    >
                      <code>{d.code}</code>
                      <span>
                        <strong>{d.label}</strong>
                        <small>{conciseIssueText(issue)}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <footer>
                <strong>How to practice</strong>
                <ul>
                  {[
                    ...new Set(
                      issues
                        .slice(0, 3)
                        .map((issue) => practiceTip(category, issue.code)),
                    ),
                  ].map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </footer>
              {issues.length > 4 && (
                <button
                  className="review-feedback-more"
                  onClick={() =>
                    setExpanded((current) =>
                      isExpanded
                        ? current.filter((item) => item !== category)
                        : [...current, category],
                    )
                  }
                >
                  {isExpanded ? "Show fewer" : `Show ${issues.length - 4} more`}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function coachingSummary(category: CorrectionCategory) {
  return (
    {
      content: "Develop ideas with relevant, specific evidence.",
      organization: "Make the progression between ideas easier to follow.",
      grammar: "Build accurate, controlled sentences that read naturally.",
      vocabulary: "Choose precise words and natural academic expressions.",
      mechanics: "Proofread surface details so meaning stays clear.",
    } as const
  )[category];
}
function practiceTip(category: CorrectionCategory, code?: string) {
  const byCode: Record<string, string> = {
    REL: "Compare every paragraph with the task and remove material that does not answer it.",
    DEV: "Add a reason, example, or explanation after each important claim.",
    TA: "Turn each task requirement into a checklist before revising.",
    CL: "Rewrite unclear ideas in one direct sentence before expanding them.",
    SD: "Support general statements with one specific detail or example.",
    COH: "State how each new idea connects to the previous one.",
    CO: "Use transitions only where they clarify a real relationship.",
    PU: "Give each paragraph one controlling idea.",
    TS: "Open each paragraph with a sentence that states its purpose.",
    CONC: "Restate the main insight and close without introducing a new topic.",
    T: "Check that time references and verb tenses remain consistent.",
    VF: "Check the verb pattern required after auxiliaries and other verbs.",
    AGR: "Identify the subject and check whether the verb agrees in number.",
    FRAG: "Check that every sentence has a complete subject and predicate.",
    RO: "Separate independent clauses or connect them with correct punctuation.",
    WO: "Read the sentence aloud and place modifiers beside what they describe.",
    ART: "Practice when to use a, an, the, or no article.",
    PREP: "Learn prepositions as part of complete phrases rather than alone.",
    WC: "Check whether each word precisely expresses the intended meaning.",
    WF: "Verify the noun, verb, adjective, or adverb form the sentence needs.",
    REP: "Highlight repeated words and replace only unnecessary repetition.",
    FORM: "Replace conversational wording with a suitable academic expression.",
    COL: "Record and practice words together in their natural combinations.",
    SP: "Keep a personal spelling list and verify uncertain words.",
    P: "Read aloud and pause where punctuation should guide the reader.",
    CAP: "Check sentence openings and proper names in a separate editing pass.",
    SPC: "Use one consistent space between words and after punctuation.",
    FMT: "Apply the assignment’s formatting rules consistently throughout.",
  };
  return (
    byCode[code ?? ""] ??
    (
      {
        content: "Underline each claim and the evidence that supports it.",
        organization:
          "Write a one-line purpose for every paragraph, then check the order.",
        grammar:
          "Proofread one sentence at a time, checking verbs before other details.",
        vocabulary:
          "Keep a phrase bank and review words in their full context.",
        mechanics:
          "Read the final draft slowly and perform a punctuation pass.",
      } as const
    )[category]
  );
}
function conciseIssueText(issue: Issue) {
  const original = issue.originalText.trim();
  const suggested = issue.suggestedText?.trim();
  const clip = (value: string) =>
    value.length > 54 ? `${value.slice(0, 51)}…` : value;
  return suggested
    ? `${clip(original)} → ${clip(suggested)}`
    : clip(issue.explanation ?? original);
}
function RubricEvaluation({
  sections,
}: {
  sections: SubmissionReviewDto["feedbackSections"];
}) {
  return (
    <section className="review-section">
      <header>
        <h2>Rubric Evaluation</h2>
        <p>AI-assisted scoring against the assigned rubric</p>
      </header>
      <div className="review-rubric-list">
        {sections.map((s) => {
          const width = s.maxScore
            ? Math.max(0, Math.min(100, (s.score / s.maxScore) * 100))
            : 0;
          return (
            <article key={`${s.category}-${s.title}`}>
              <div>
                <h3>{formatLabel(s.title)}</h3>
                <p>{s.summary}</p>
              </div>
              <strong>
                {s.score} / {s.maxScore}
              </strong>
              <div className="review-rubric-meter">
                <i style={{ width: `${width}%` }} />
              </div>
              {s.suggestions.length > 0 && (
                <ul>
                  {s.suggestions.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
function IssuePopover({
  issue,
  anchor,
  onClose,
}: {
  issue: Issue;
  anchor: DOMRect | null;
  onClose: () => void;
}) {
  const d = normalizeCorrection(issue.code, issue.category, issue.label);
  const width = Math.min(400, window.innerWidth - 24);
  let left = anchor ? anchor.right + 10 : (window.innerWidth - width) / 2;
  if (left + width > window.innerWidth - 12) {
    left = Math.max(12, (anchor?.left ?? window.innerWidth) - width - 10);
  }
  let top = anchor ? anchor.bottom + 10 : 80;
  if (top + 360 > window.innerHeight - 12) {
    top = Math.max(12, (anchor?.top ?? 372) - 370);
  }
  const maxHeight = Math.max(180, window.innerHeight - top - 12);
  return createPortal(
    <div
      className="review-popover-layer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className="review-error-popover"
        style={{ left, top, width, maxHeight }}
        data-category={d.category}
        role="dialog"
        aria-label={`Correction ${d.code}`}
      >
        <button aria-label="Close correction" onClick={onClose}>
          <X />
        </button>
        <header>
          <code>{d.code}</code>
          <div>
            <strong>{CATEGORY_LABELS[d.category]}</strong>
            <span>{d.label}</span>
          </div>
        </header>
        {issue.explanation && (
          <section>
            <small>What to improve</small>
            <p>{issue.explanation}</p>
          </section>
        )}
        <section className="review-inspector-tip">
          <small>How to improve</small>
          <p>{practiceTip(d.category, d.code)}</p>
        </section>
        {issue.suggestedText && (
          <div className="review-correction-comparison">
            <section>
              <small>Example correction</small>
              <ins>{issue.suggestedText}</ins>
            </section>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
function LegendDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return createPortal(
    <div
      className="review-legend-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="review-legend-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legend-title"
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            event.preventDefault();
            ref.current?.focus();
          }
        }}
      >
        <header>
          <div>
            <p className="eyebrow">Reference guide</p>
            <h2 id="legend-title">Correction Legend</h2>
          </div>
          <button
            ref={ref}
            aria-label="Close correction legend"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <div>
          {(
            [
              "content",
              "organization",
              "grammar",
              "vocabulary",
              "mechanics",
            ] as const
          ).map((category) => (
            <section key={category} data-category={category}>
              <h3>{CATEGORY_LABELS[category]}</h3>
              {Object.entries(CORRECTION_LEGEND)
                .filter(([, v]) => v.category === category)
                .map(([code, v]) => (
                  <div key={code}>
                    <code>{code}</code>
                    <span>{v.label}</span>
                  </div>
                ))}
            </section>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
function groupIssues(issues: Issue[]) {
  const groups = new Map<CorrectionCategory, Issue[]>();
  for (const issue of issues) {
    const key = normalizeCorrection(
      issue.code,
      issue.category,
      issue.label,
    ).category;
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }
  return groups;
}
export function formatReviewLabel(value: string) {
  return formatLabel(value);
}
function formatLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .replace(/\bAnd\b/g, "&");
}
