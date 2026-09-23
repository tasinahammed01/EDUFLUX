"use client";

import { useState, useEffect, useRef } from "react";
import { X, LoaderCircle } from "lucide-react";
import type { AssignmentDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { notify } from "@/lib/notifications";

type AssignmentFormDialogProps = {
  open: boolean;
  classId: string;
  mode: "create" | "edit";
  assignment?: AssignmentDto;
  onClose: () => void;
  onSuccess: (assignment: AssignmentDto) => void;
};

export function AssignmentFormDialog({
  open,
  classId,
  mode,
  assignment,
  onClose,
  onSuccess,
}: AssignmentFormDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [dueDateError, setDueDateError] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [userSetDueDate, setUserSetDueDate] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset form when opening/closing
  useEffect(() => {
    if (!open && formRef.current) {
      formRef.current.reset();
      setError("");
      setDueDateError("");
      setAvailableFrom("");
      setUserSetDueDate(false);
    }
  }, [open]);

  function formatDateTimeForInput(isoString: string): string {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setDueDateError("");

    const form = new FormData(event.currentTarget);
    const available = String(form.get("availableFrom") || "");
    const due = String(form.get("dueAt") || "");
    const url = String(form.get("resourceUrl") || "");

    // Frontend validation: due date must be after availability
    if (available && due) {
      const availableDate = new Date(available);
      const dueDate = new Date(due);
      if (dueDate <= availableDate) {
        setDueDateError("Due date must be after the availability date.");
        setPending(false);
        return;
      }
    }

    try {
      let item: AssignmentDto;
      
      if (mode === "create") {
        item = await classesApi.createAssignment(classId, {
          title: String(form.get("title") || ""),
          description: String(form.get("description") || ""),
          instructions: String(form.get("instructions") || ""),
          ...(available ? { availableFrom: new Date(available).toISOString() } : {}),
          ...(due ? { dueAt: new Date(due).toISOString() } : {}),
          allowLateSubmission: form.get("allowLateSubmission") === "on",
          allowResubmission: form.get("allowResubmission") === "on",
          showMarks: form.get("showMarks") === "on",
          resourceLinks: url ? [{ label: "Assignment resource", url }] : [],
        });

        notify.success("Draft saved", "assignment-draft-saved");
      } else {
        // Edit mode
        if (!assignment) throw new Error("Assignment data required for edit");

        item = await classesApi.updateAssignment(classId, assignment.id, {
          title: String(form.get("title") || ""),
          description: String(form.get("description") || ""),
          instructions: String(form.get("instructions") || ""),
          ...(available ? { availableFrom: new Date(available).toISOString() } : {}),
          ...(due ? { dueAt: new Date(due).toISOString() } : {}),
          allowLateSubmission: form.get("allowLateSubmission") === "on",
          allowResubmission: form.get("allowResubmission") === "on",
          showMarks: form.get("showMarks") === "on",
          resourceLinks: url ? [{ label: "Assignment resource", url }] : [],
        });

        notify.success("Assignment updated", "assignment-updated");
      }
      
      onSuccess(item);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : mode === "create" ? "Assignment could not be saved." : "Assignment could not be updated.",
      );
      notify.error(caught, mode === "create" ? "Could not save assignment. Try again." : "Could not update assignment. Try again.", mode === "create" ? "assignment-save-error" : "assignment-update-error");
    } finally {
      setPending(false);
    }
  }

  function handleAvailableFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    setAvailableFrom(newValue);
    
    // Auto-adjust due date if user hasn't manually set it yet
    if (newValue && !userSetDueDate) {
      const availableDate = new Date(newValue);
      const defaultDueDate = new Date(availableDate);
      defaultDueDate.setDate(defaultDueDate.getDate() + 7); // Default to 7 days later
      defaultDueDate.setHours(23, 59, 0, 0);
      
      const dueInput = document.querySelector('input[name="dueAt"]') as HTMLInputElement;
      if (dueInput) {
        const year = defaultDueDate.getFullYear();
        const month = String(defaultDueDate.getMonth() + 1).padStart(2, '0');
        const day = String(defaultDueDate.getDate()).padStart(2, '0');
        const hours = String(defaultDueDate.getHours()).padStart(2, '0');
        const minutes = String(defaultDueDate.getMinutes()).padStart(2, '0');
        dueInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
      }
    }
    
    // Clear due date error if it exists
    if (dueDateError) {
      setDueDateError("");
    }
  }

  function handleDueDateChange() {
    setUserSetDueDate(true);
    if (dueDateError) {
      setDueDateError("");
    }
  }

  if (!open) return null;
  if (mode === "edit" && !assignment) return null;

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-dialog assignment-form-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{mode === "create" ? "Create Assignment" : "Edit Assignment"}</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="settings-form" data-assignment-form>
          <label>
            Title
            <input 
              name="title" 
              required 
              maxLength={150} 
              placeholder="Assignment title"
              defaultValue={mode === "edit" && assignment ? assignment.title : ""}
            />
          </label>
          <label>
            Description
            <textarea 
              name="description" 
              maxLength={500} 
              placeholder="Brief description (optional)" 
              rows={2}
              defaultValue={mode === "edit" && assignment ? assignment.description || "" : ""}
            />
          </label>
          <label>
            Instructions
            <textarea 
              name="instructions" 
              rows={4} 
              maxLength={10000} 
              placeholder="Detailed instructions for students"
              defaultValue={mode === "edit" && assignment ? assignment.instructions || "" : ""}
            />
          </label>
          
          <div className="form-grid">
            <label>
              Available from
              <input
                name="availableFrom"
                type="datetime-local"
                defaultValue={mode === "edit" && assignment?.availableFrom ? formatDateTimeForInput(assignment.availableFrom) : ""}
                onChange={handleAvailableFromChange}
              />
            </label>
            <label>
              Due date and time
              <input
                name="dueAt"
                type="datetime-local"
                defaultValue={mode === "edit" && assignment?.dueAt ? formatDateTimeForInput(assignment.dueAt) : ""}
                min={availableFrom}
                onChange={handleDueDateChange}
                aria-invalid={dueDateError ? "true" : "false"}
                aria-describedby={dueDateError ? "due-date-error" : undefined}
              />
              {dueDateError && (
                <p id="due-date-error" className="form-error" role="alert">
                  {dueDateError}
                </p>
              )}
            </label>
            <label>
              Resource URL
              <input
                name="resourceUrl"
                type="url"
                placeholder="https://example.com/resource"
                defaultValue={(() => {
                  if (mode === "edit" && assignment?.resourceLinks && assignment.resourceLinks.length > 0) {
                    const firstLink = assignment.resourceLinks[0];
                    return firstLink?.url || "";
                  }
                  return "";
                })()}
              />
            </label>
          </div>

          <div className="check-grid">
            <label>
              <input
                name="allowLateSubmission"
                type="checkbox"
                defaultChecked={mode === "edit" && assignment ? assignment.allowLateSubmission : false}
              />
              Allow late submissions
            </label>
            <label>
              <input
                name="allowResubmission"
                type="checkbox"
                defaultChecked={mode === "edit" && assignment ? assignment.allowResubmission : false}
              />
              Allow resubmissions
            </label>
            <label>
              <input
                name="showMarks"
                type="checkbox"
                defaultChecked={mode === "edit" && assignment ? assignment.showMarks : true}
              />
              Show marks to students
            </label>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="settings-footer">
            <button type="button" className="button button-ghost" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={pending}>
              {pending && <LoaderCircle className="spinner" aria-hidden="true" />}
              {pending ? (mode === "create" ? "Creating…" : "Saving…") : (mode === "create" ? "Create assignment" : "Save changes")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}