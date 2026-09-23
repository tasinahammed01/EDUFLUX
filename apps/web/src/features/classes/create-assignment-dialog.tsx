"use client";

import { useState } from "react";
import { X, LoaderCircle } from "lucide-react";
import type { AssignmentDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { notify } from "@/lib/notifications";

type CreateAssignmentDialogProps = {
  open: boolean;
  classId: string;
  onClose: () => void;
  onCreated: (assignment: AssignmentDto) => void;
};

export function CreateAssignmentDialog({
  open,
  classId,
  onClose,
  onCreated,
}: CreateAssignmentDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [dueDateError, setDueDateError] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [userSetDueDate, setUserSetDueDate] = useState(false);

  if (!open) return null;

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
      const item = await classesApi.createAssignment(classId, {
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

      onCreated(item);
      notify.success("Draft saved", "assignment-draft-saved");
      onClose();
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

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Create Assignment</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="settings-form">
          <label>
            Title
            <input name="title" required maxLength={150} placeholder="Assignment title" />
          </label>
          <label>
            Description
            <textarea name="description" maxLength={500} placeholder="Brief description (optional)" rows={2} />
          </label>
          <label>
            Instructions
            <textarea name="instructions" rows={4} maxLength={10000} placeholder="Detailed instructions for students" />
          </label>
          
          <div className="form-grid">
            <label>
              Available from
              <input 
                name="availableFrom" 
                type="datetime-local" 
                onChange={handleAvailableFromChange}
              />
            </label>
            <label>
              Due date and time
              <input 
                name="dueAt" 
                type="datetime-local" 
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
              <input name="resourceUrl" type="url" placeholder="https://example.com/resource" />
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
              {pending ? "Creating…" : "Create assignment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}