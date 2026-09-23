"use client";

import { X } from "lucide-react";
import type { AssignmentDto } from "@eduflux/shared-types";

type RubricViewerDialogProps = {
  open: boolean;
  assignment: AssignmentDto;
  onClose: () => void;
  locked?: boolean;
};

export function RubricViewerDialog({
  open,
  assignment,
  onClose,
  locked = false,
}: RubricViewerDialogProps) {
  if (!open || !assignment.rubric) return null;

  const { rubric } = assignment;

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-dialog rubric-viewer-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div>
            <span className="rubric-editor-eyebrow">RUBRIC VIEWER</span>
            <h2>Rubric: {assignment.title}</h2>
          </div>
          <button className="settings-close" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div className="rubric-viewer-content">
          {locked && (
            <div className="rubric-locked-notice">
              <p>
                <strong>Rubric locked</strong> — This rubric is locked because students have already submitted work.
              </p>
            </div>
          )}

          <div className="rubric-section">
            <h3>Grading Levels</h3>
            <div className="rubric-levels-view">
              {rubric.levels.map((level) => (
                <div key={level.id} className="rubric-level-view">
                  <span className="rubric-level-label-view">{level.label}</span>
                  <span className="rubric-level-percentage-view">{level.percentage}%</span>
                  {level.description && (
                    <p className="rubric-level-description-view">{level.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rubric-section">
            <h3>Criteria</h3>
            <div className="rubric-criteria-view">
              {rubric.criteria.map((criterion) => (
                <div key={criterion.id} className="rubric-criterion-view">
                  <div className="rubric-criterion-header-view">
                    <h4>{criterion.title}</h4>
                    <span className="rubric-criterion-weight-view">Weight: {criterion.weight}</span>
                  </div>
                  {criterion.description && (
                    <p className="rubric-criterion-description-view">{criterion.description}</p>
                  )}
                  <div className="rubric-criterion-descriptors-view">
                    {rubric.levels.map((level, levelIndex) => (
                      <div key={level.id} className="rubric-descriptor-view">
                        <strong>{level.label}:</strong>
                        <p>{criterion.descriptors[levelIndex] || "No descriptor"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rubric-total-view">
            <strong>Total Weight:</strong> {rubric.totalWeight} / 100
          </div>
        </div>

        <div className="settings-footer">
          <button
            type="button"
            className="button button-ghost"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
