"use client";

import { useEffect, useState } from "react";
import type { TeacherSubmissionRow } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";

export function TeacherSubmissions({
  classId,
  assignmentId,
}: {
  classId: string;
  assignmentId: string;
}) {
  const [rows, setRows] = useState<TeacherSubmissionRow[]>([]);
  const [summary, setSummary] = useState({
    students: 0,
    submitted: 0,
    notSubmitted: 0,
    late: 0,
  });
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        classesApi
          .submissionRows(classId, assignmentId, 1, filter, search)
          .then((result) => {
            setRows(result.rows);
            setSummary(result.summary);
          }),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [assignmentId, classId, filter, search]);
  return (
    <section className="submission-workspace">
      <header>
        <div>
          <h2>Student submissions</h2>
          <p>
            {summary.submitted} of {summary.students} submitted · {summary.late}{" "}
            late
          </p>
        </div>
      </header>
      <div className="submission-filters">
        <input
          aria-label="Search students"
          placeholder="Search students"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filter submissions"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="ALL">All</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="NOT_SUBMITTED">Not submitted</option>
          <option value="LATE">Late</option>
          <option value="MULTIPLE">Multiple attempts</option>
        </select>
      </div>
      <div className="submission-list">
        {rows.map((row) => (
          <article key={row.student.id}>
            <div>
              <strong>{row.student.displayName}</strong>
              <small>{row.student.email}</small>
            </div>
            <span>{row.status.replace("_", " ")}</span>
            <span>
              {row.latestAttemptNumber
                ? `${row.latestAttemptNumber} attempt${row.latestAttemptNumber === 1 ? "" : "s"}`
                : "—"}
            </span>
            <time>
              {row.latestSubmittedAt
                ? new Date(row.latestSubmittedAt).toLocaleString()
                : "Not submitted"}
            </time>
          </article>
        ))}
      </div>
    </section>
  );
}
