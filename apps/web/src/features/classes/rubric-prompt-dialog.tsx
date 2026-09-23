"use client";

import { X } from "lucide-react";

type RubricPromptDialogProps = {
  open: boolean;
  assignmentTitle: string;
  onAddNow: () => void;
  onAddLater: () => void;
};

export function RubricPromptDialog({
  open,
  assignmentTitle,
  onAddNow,
  onAddLater,
}: RubricPromptDialogProps) {
  if (!open) return null;

  return (
    <div className="settings-backdrop" onClick={onAddLater}>
      <div className="settings-dialog rubric-prompt-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Add a rubric?</h2>
          <button className="settings-close" onClick={onAddLater} aria-label="Close">
            <X />
          </button>
        </div>

        <div className="rubric-prompt-content">
          <p>
            A rubric defines how this assignment will be scored and how AI feedback will be generated.
          </p>
          <p className="rubric-prompt-assignment">
            Assignment: <strong>{assignmentTitle}</strong>
          </p>
        </div>

        <div className="settings-footer rubric-prompt-footer">
          <button
            type="button"
            className="button button-ghost"
            onClick={onAddLater}
          >
            I&apos;ll add it later
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={onAddNow}
          >
            Add rubric now
          </button>
        </div>
      </div>
    </div>
  );
}
