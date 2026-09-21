"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clipboard,
  Plus,
  QrCode,
  RotateCw,
  Search,
  Users,
} from "lucide-react";
import QRCode from "qrcode";
import type {
  AssignmentDto,
  ClassMember,
  ClassSummary,
} from "@eduflux/shared-types";
import type { CreateClassInput } from "@eduflux/validation";
import { classesApi } from "@/lib/api/classes";
import { notify } from "@/lib/notifications";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
type Tab = "overview" | "assignments" | "people" | "settings";
type Confirmation = { kind: "leave" } | { kind: "rotate" } | { kind: "remove"; member: ClassMember };
export function ClassDetail({
  id,
  mode,
}: {
  id: string;
  mode: "teacher" | "student";
}) {
  const router = useRouter();
  const [item, setItem] = useState<ClassSummary | null>(null),
    [members, setMembers] = useState<ClassMember[]>([]),
    [assignments, setAssignments] = useState<AssignmentDto[]>([]),
    [tab, setTab] = useState<Tab>("overview"),
    [error, setError] = useState(""),
    [qr, setQr] = useState(""),
    [search, setSearch] = useState(""),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const privileged = mode === "teacher";
  useEffect(() => {
    let active = true;
    Promise.all([classesApi.one(id), classesApi.assignments(id)])
      .then(([detail, data]) => {
        if (active) {
          setItem(detail);
          setAssignments(data.assignments);
        }
      })
      .catch(() => active && setError("This class could not be opened."));
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (tab !== "people") return;
    const timer = window.setTimeout(
      () =>
        classesApi
          .members(id, 1, search)
          .then((data) => setMembers(data.members))
          .catch(() => setError("Members could not be loaded.")),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [id, search, tab]);
  useEffect(() => {
    if (item?.joinUrl)
      QRCode.toDataURL(item.joinUrl, {
        width: 320,
        margin: 2,
        color: { dark: "#071127", light: "#ffffff" },
      }).then(setQr);
  }, [item?.joinUrl]);
  const visible = useMemo(
    () => assignments.filter((a) => privileged || a.status === "PUBLISHED"),
    [assignments, privileged],
  );
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify.success(`${label} copied`, `copy-${label.toLowerCase().replaceAll(" ", "-")}`);
    } catch (caught) {
      notify.error(caught, `Could not copy ${label.toLowerCase()}.`, `copy-${label.toLowerCase().replaceAll(" ", "-")}-error`);
    }
  }
  async function confirmAction() {
    if (!confirmation) return;
    try {
      if (confirmation.kind === "leave") {
        await classesApi.leave(id);
        notify.success("Class left", "class-left");
        router.replace("/student/dashboard");
      } else if (confirmation.kind === "rotate") {
        const next = await classesApi.rotateInvite(id);
        setItem((current) => current ? { ...current, ...next } : current);
        notify.success("Invite link rotated", "invite-rotated");
      } else if (confirmation.member.membershipId) {
        await classesApi.removeMember(id, confirmation.member.membershipId);
        setMembers((current) => current.filter((value) => value !== confirmation.member));
        notify.success("Student removed", `member-removed-${confirmation.member.membershipId}`);
      }
    } catch (caught) {
      const fallback = confirmation.kind === "leave" ? "Could not leave class. Try again." : confirmation.kind === "rotate" ? "Could not rotate invite link." : "Could not remove student.";
      const toastId = confirmation.kind === "leave" ? "leave-class-error" : confirmation.kind === "rotate" ? "invite-rotate-error" : `member-remove-error-${confirmation.member.membershipId}`;
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
      <main className="dashboard">
        <div className="class-skeletons">
          <i />
          <i />
        </div>
      </main>
    );
  return (
    <main className="dashboard class-workspace">
      <Link className="back-link" href={`/${mode}/dashboard`}>
        <ArrowLeft />
        Back to classes
      </Link>
      <header className="class-hero">
        <div>
          <p className="eyebrow">
            {item.status} · {item.role}
          </p>
          <h1>{item.name}</h1>
          <p>{item.description || "Your class space is ready."}</p>
          <div className="class-facts">
            <span>{item.subjectLevel || "General"}</span>
            {item.owner && <span>Teacher: {item.owner.displayName}</span>}
            {item.startDate && (
              <span>
                {item.startDate}
                {item.endDate ? ` — ${item.endDate}` : ""}
              </span>
            )}
          </div>
        </div>
        {privileged && item.joinCode && (
          <aside className="invite-compact">
            <small>CLASS CODE</small>
            <strong>{item.joinCode}</strong>
            <button onClick={() => copy(item.joinCode!, "Class code")}>
              <Clipboard />
              Copy
            </button>
          </aside>
        )}
      </header>
      <nav className="class-tabs" aria-label="Class sections">
        {(
          [
            "overview",
            "assignments",
            "people",
            ...(privileged ? ["settings"] : []),
          ] as Tab[]
        ).map((value) => (
          <button
            key={value}
            aria-current={tab === value ? "page" : undefined}
            onClick={() => setTab(value)}
          >
            {value}
          </button>
        ))}
      </nav>
      {tab === "overview" && (
        <section className="class-overview">
          <article>
            <h2>About this class</h2>
            <p>{item.description || "No description has been added yet."}</p>
            <dl>
              <div>
                <dt>Teacher</dt>
                <dd>{item.owner?.displayName || "EduFlux teacher"}</dd>
              </div>
              <div>
                <dt>Assignments</dt>
                <dd>{visible.length}</dd>
              </div>
              <div>
                <dt>Members</dt>
                <dd>{item.memberCount ?? "View People"}</dd>
              </div>
            </dl>
          </article>
          {!privileged && (
            <article>
              <h2>Membership</h2>
              <p>You joined this class as a student.</p>
              <button
                className="text-action"
                onClick={() => setConfirmation({ kind: "leave" })}
              >
                Leave class
              </button>
            </article>
          )}
          {privileged && (
            <InvitePanel
              item={item}
              qr={qr}
              onCopy={copy}
              onRotate={async () => {
                setConfirmation({ kind: "rotate" });
              }}
            />
          )}
        </section>
      )}
      {tab === "assignments" && (
        <Assignments
          id={id}
          mode={mode}
          items={visible}
          setItems={setAssignments}
        />
      )}{" "}
      {tab === "people" && (
        <section className="member-panel">
          <div className="member-title">
            <Users />
            <div>
              <h2>People</h2>
              <p>Teachers and students in this class</p>
            </div>
            {privileged && (
              <label className="member-search">
                <Search />
                <span className="sr-only">Search members</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or email"
                />
              </label>
            )}
          </div>
          <div className="member-list">
            {members.map((member) => (
              <div
                key={
                  member.membershipId ??
                  `${member.displayName}-${member.joinedAt}`
                }
              >
                <span>{member.displayName.slice(0, 2).toUpperCase()}</span>
                <strong>
                  {member.displayName}
                  {member.email && <small>{member.email}</small>}
                </strong>
                <small>{member.role}</small>
                <time>{new Date(member.joinedAt).toLocaleDateString()}</time>
                {privileged &&
                  member.role === "STUDENT" &&
                  member.membershipId && (
                    <button
                      onClick={() => setConfirmation({ kind: "remove", member })}
                    >
                      Remove
                    </button>
                  )}
              </div>
            ))}
          </div>
        </section>
      )}
      {tab === "settings" && privileged && (
        <ClassSettings item={item} onUpdated={setItem} />
      )}
      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.kind === "rotate" ? "Rotate invite link?" : confirmation?.kind === "remove" ? "Remove student?" : "Leave this class?"}
        description={confirmation?.kind === "rotate" ? "The current invitation link will stop working immediately. Students using the old link will no longer be able to join." : confirmation?.kind === "remove" ? `Remove ${confirmation.member.displayName} from this class?` : "You will lose access to this class and its assignments."}
        confirmLabel={confirmation?.kind === "rotate" ? "Rotate link" : confirmation?.kind === "remove" ? "Remove student" : "Leave class"}
        variant={confirmation?.kind === "rotate" ? "warning" : "destructive"}
        onCancel={() => setConfirmation(null)}
        onConfirm={confirmAction}
      />
    </main>
  );
}
function InvitePanel({
  item,
  qr,
  onCopy,
  onRotate,
}: {
  item: ClassSummary;
  qr: string;
  onCopy: (v: string, l: string) => void;
  onRotate: () => void;
}) {
  return (
    <article className="invite-panel">
      <h2>Invite students</h2>
      <div>
        <span>
          Class code <strong>{item.joinCode}</strong>
        </span>
        <button onClick={() => onCopy(item.joinCode!, "Class code")}>
          <Clipboard />
          Copy
        </button>
      </div>
      <div>
        <span>Secure join link</span>
        <button onClick={() => onCopy(item.joinUrl!, "Invite link")}>
          <Clipboard />
          Copy link
        </button>
      </div>
      {qr && (
        <details>
          <summary>
            <QrCode />
            Show QR
          </summary>
          <Image
            src={qr}
            width={320}
            height={320}
            unoptimized
            alt={`QR code to join ${item.name}`}
          />
          <a
            className="button button-secondary"
            href={qr}
            download={`${item.name}-invite.png`}
          >
            Download QR
          </a>
        </details>
      )}
      <button className="text-action" onClick={onRotate}>
        <RotateCw />
        Rotate invite link
      </button>
    </article>
  );
}
function Assignments({
  id,
  mode,
  items,
  setItems,
}: {
  id: string;
  mode: "teacher" | "student";
  items: AssignmentDto[];
  setItems: React.Dispatch<React.SetStateAction<AssignmentDto[]>>;
}) {
  const [open, setOpen] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [archiveTarget, setArchiveTarget] = useState<AssignmentDto | null>(null);
  async function submit(form: FormData, publish: boolean) {
    if (pending) return;
    setPending(true);
    setError("");
    const available = String(form.get("availableFrom") || ""),
      due = String(form.get("dueAt") || ""),
      url = String(form.get("resourceUrl") || "");
    try {
      let item = await classesApi.createAssignment(id, {
        title: String(form.get("title") || ""),
        description: String(form.get("description") || ""),
        instructions: String(form.get("instructions") || ""),
        ...(available
          ? { availableFrom: new Date(available).toISOString() }
          : {}),
        ...(due ? { dueAt: new Date(due).toISOString() } : {}),
        maxScore: Number(form.get("maxScore") || 100),
        allowLateSubmission: form.get("allowLateSubmission") === "on",
        allowResubmission: form.get("allowResubmission") === "on",
        showMarks: form.get("showMarks") === "on",
        resourceLinks: url ? [{ label: "Assignment resource", url }] : [],
      });
      if (publish) item = await classesApi.publishAssignment(id, item.id);
      setItems((current) => [item, ...current]);
      setOpen(false);
      notify.success(publish ? "Assignment published" : "Draft saved", publish ? "assignment-published" : "assignment-draft-saved");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Assignment could not be saved.",
      );
      notify.error(caught, "Could not save assignment. Try again.", "assignment-save-error");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="assignment-section">
      <header>
        <div>
          <h2>Assignments</h2>
          <p>
            {mode === "teacher"
              ? "Plan, draft, and publish class work."
              : "Published work for this class."}
          </p>
        </div>
        {mode === "teacher" && (
          <button
            className="button button-primary"
            onClick={() => setOpen(true)}
          >
            <Plus />
            Create assignment
          </button>
        )}
      </header>
      {open && (
        <form className="assignment-form">
          <h3>Basic information</h3>
          <label>
            Title
            <input name="title" required maxLength={150} />
          </label>
          <label>
            Description
            <textarea name="description" maxLength={500} />
          </label>
          <label>
            Instructions
            <textarea name="instructions" rows={5} maxLength={10000} />
          </label>
          <h3>Schedule and grading</h3>
          <div className="form-grid">
            <label>
              Available from
              <input name="availableFrom" type="datetime-local" />
            </label>
            <label>
              Due date and time
              <input name="dueAt" type="datetime-local" />
            </label>
            <label>
              Maximum score
              <input
                name="maxScore"
                type="number"
                min="0.01"
                max="10000"
                step="0.01"
                defaultValue="100"
              />
            </label>
            <label>
              Resource URL
              <input name="resourceUrl" type="url" placeholder="https://" />
            </label>
          </div>
          <div className="check-grid">
            <label>
              <input name="allowLateSubmission" type="checkbox" />
              Allow late submissions
            </label>
            <label>
              <input name="allowResubmission" type="checkbox" />
              Allow resubmissions
            </label>
            <label>
              <input name="showMarks" type="checkbox" defaultChecked />
              Show marks
            </label>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <footer>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              className="button button-secondary"
              formAction={(e) => submit(e, false)}
              disabled={pending}
            >
              Save Draft
            </button>
            <button
              className="button button-primary"
              formAction={(e) => submit(e, true)}
              disabled={pending}
            >
              Publish Assignment
            </button>
          </footer>
        </form>
      )}
      <div className="assignment-list">
        {items.length === 0 ? (
          <div className="empty-state">
            <h3>No assignments yet</h3>
            <p>
              {mode === "teacher"
                ? "Create your first assignment when you’re ready."
                : "No assignments have been published yet."}
            </p>
          </div>
        ) : (
          items.map((item) => (
            <article key={item.id}>
              <div>
                <small>{item.status}</small>
                <h3>{item.title}</h3>
                {item.description && <p>{item.description}</p>}
              </div>
              <span>
                {item.dueAt
                  ? `Due ${new Date(item.dueAt).toLocaleString()}`
                  : "No due date"}{" "}
                · {item.maxScore} points
              </span>
              <Link href={`/${mode}/classes/${id}/assignments/${item.id}`}>
                Open assignment
              </Link>
              {mode === "teacher" && item.status === "DRAFT" && (
                <button
                  onClick={async () => {
                    try {
                      const next = await classesApi.publishAssignment(id, item.id);
                      setItems((current) => current.map((value) => value.id === next.id ? next : value));
                      notify.success("Assignment published", `assignment-published-${item.id}`);
                    } catch (caught) {
                      notify.error(caught, "Could not publish assignment.", `assignment-publish-error-${item.id}`);
                    }
                  }}
                >
                  Publish
                </button>
              )}
              {mode === "teacher" && item.status !== "ARCHIVED" && (
                <button onClick={() => setArchiveTarget(item)}>Archive</button>
              )}
            </article>
          ))
        )}
      </div>
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive assignment?"
        description={`Archive ${archiveTarget?.title ?? "this assignment"}? Students will no longer see it as active work.`}
        confirmLabel="Archive assignment"
        variant="destructive"
        onCancel={() => setArchiveTarget(null)}
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            const next = await classesApi.archiveAssignment(id, archiveTarget.id);
            setItems((current) => current.map((value) => value.id === next.id ? next : value));
            notify.success("Assignment archived", `assignment-archived-${archiveTarget.id}`);
          } catch (caught) {
            notify.error(caught, "Could not archive assignment.", `assignment-archive-error-${archiveTarget.id}`);
            throw caught;
          }
        }}
      />
    </section>
  );
}
function ClassSettings({
  item,
  onUpdated,
}: {
  item: ClassSummary;
  onUpdated: React.Dispatch<React.SetStateAction<ClassSummary | null>>;
}) {
  const [error, setError] = useState(""), [archiveOpen, setArchiveOpen] = useState(false);
  return (
    <section className="settings-panel">
      <h2>Class settings</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            const updated = await classesApi.update(item.id, {
              name: String(form.get("name")),
              subjectLevel: String(
                form.get("subjectLevel"),
              ) as CreateClassInput["subjectLevel"],
            startDate: String(form.get("startDate")),
            ...(String(form.get("endDate") || "") ? { endDate: String(form.get("endDate")) } : {}),
            description: String(form.get("description") || ""),
            allowJoinByCode: form.get("allowJoinByCode") === "on",
            allowJoinByLink: form.get("allowJoinByLink") === "on",
            });
            onUpdated((current) =>
              current ? { ...current, ...updated } : current,
            );
            notify.success("Class updated", `class-updated-${item.id}`);
          } catch (caught) {
            setError(
              caught instanceof Error
                ? caught.message
                : "Could not update class.",
            );
            notify.error(caught, "Could not update class. Try again.", `class-update-error-${item.id}`);
          }
        }}
      >
        <label>
          Class name
          <input name="name" defaultValue={item.name} />
        </label>
        <label>
          Subject / Level
          <input name="subjectLevel" defaultValue={item.subjectLevel} />
        </label>
        <label>
          Start date
          <input name="startDate" type="date" defaultValue={item.startDate} />
        </label>
        <label>
          End date
          <input name="endDate" type="date" defaultValue={item.endDate} />
        </label>
        <label>
          Description
          <textarea name="description" defaultValue={item.description} />
        </label>
        <div className="check-grid"><label><input type="checkbox" name="allowJoinByCode" defaultChecked={item.allowJoinByCode!==false}/>Allow joining by class code</label><label><input type="checkbox" name="allowJoinByLink" defaultChecked={item.allowJoinByLink!==false}/>Allow joining by invite link</label></div>
        {error && <p role="alert">{error}</p>}
        <button className="button button-primary">Save changes</button>
      </form>
      {item.role === "OWNER" && (
        <div className="danger-zone">
          <h3>Archive class</h3>
          <p>
            Stops new enrollment and assignment creation without deleting
            history.
          </p>
          <button
            onClick={() => setArchiveOpen(true)}
          >
            Archive class
          </button>
        </div>
      )}
      <ConfirmDialog
        open={archiveOpen}
        title="Archive class?"
        description="This class will stop accepting new students. Existing history will remain available."
        confirmLabel="Archive class"
        variant="destructive"
        onCancel={() => setArchiveOpen(false)}
        onConfirm={async () => {
          try {
            await classesApi.archive(item.id);
            onUpdated({ ...item, status: "ARCHIVED" });
            notify.success("Class archived", `class-archived-${item.id}`);
          } catch (caught) {
            notify.error(caught, "Could not archive class.", `class-archive-error-${item.id}`);
            throw caught;
          }
        }}
      />
    </section>
  );
}
