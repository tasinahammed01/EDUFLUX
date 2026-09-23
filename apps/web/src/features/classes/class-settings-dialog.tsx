"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { ClassSummary } from "@eduflux/shared-types";
import type { UpdateClassInput } from "@eduflux/validation";
import { classesApi } from "@/lib/api/classes";
import { notify } from "@/lib/notifications";

type ClassSettingsDialogProps = {
  open: boolean;
  item: ClassSummary;
  onClose: () => void;
  onUpdated: (updated: ClassSummary) => void;
};

export function ClassSettingsDialog({
  open,
  item,
  onClose,
  onUpdated,
}: ClassSettingsDialogProps) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");

    const form = new FormData(event.currentTarget);
    try {
      const updated = await classesApi.update(item.id, {
        name: String(form.get("name")),
        subjectLevel: String(
          form.get("subjectLevel"),
        ) as UpdateClassInput["subjectLevel"],
        startDate: String(form.get("startDate")),
        ...(String(form.get("endDate") || "") ? { endDate: String(form.get("endDate")) } : {}),
        description: String(form.get("description") || ""),
        allowJoinByCode: form.get("allowJoinByCode") === "on",
        allowJoinByLink: form.get("allowJoinByLink") === "on",
      });
      onUpdated(updated);
      notify.success("Class updated", `class-updated-${item.id}`);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update class.",
      );
      notify.error(caught, "Could not update class. Try again.", `class-update-error-${item.id}`);
    } finally {
      setPending(false);
    }
  }

  async function handleArchive() {
    if (pending) return;
    setPending(true);
    try {
      await classesApi.archive(item.id);
      onUpdated({ ...item, status: "ARCHIVED" });
      notify.success("Class archived", `class-archived-${item.id}`);
      setArchiveOpen(false);
      onClose();
    } catch (caught) {
      notify.error(caught, "Could not archive class.", `class-archive-error-${item.id}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Class Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">
            <X />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="settings-form">
          <label>
            Class name
            <input name="name" defaultValue={item.name} required />
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
            <textarea name="description" defaultValue={item.description} rows={3} />
          </label>
          <div className="check-grid">
            <label>
              <input type="checkbox" name="allowJoinByCode" defaultChecked={item.allowJoinByCode !== false} />
              Allow joining by class code
            </label>
            <label>
              <input type="checkbox" name="allowJoinByLink" defaultChecked={item.allowJoinByLink !== false} />
              Allow joining by invite link
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="settings-footer">
            <button type="button" className="button button-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>

        {item.role === "OWNER" && (
          <div className="danger-zone">
            <h3>Archive class</h3>
            <p>Stops new enrollment and assignment creation without deleting history.</p>
            <button onClick={() => setArchiveOpen(true)}>
              Archive class
            </button>
          </div>
        )}

        {archiveOpen && (
          <div className="settings-backdrop" onClick={() => setArchiveOpen(false)}>
            <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="settings-header">
                <h2>Archive class?</h2>
                <button className="settings-close" onClick={() => setArchiveOpen(false)} aria-label="Close">
                  <X />
                </button>
              </div>
              <p>This class will stop accepting new students. Existing history will remain available.</p>
              <div className="settings-footer">
                <button className="button button-ghost" onClick={() => setArchiveOpen(false)}>
                  Cancel
                </button>
                <button className="button button-danger" onClick={handleArchive} disabled={pending}>
                  {pending ? "Archiving…" : "Archive class"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}