"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { X, LoaderCircle, Plus, Trash2 } from "lucide-react";
import type { AssignmentDto } from "@eduflux/shared-types";
import type { RubricInput } from "@eduflux/validation";
import { classesApi } from "@/lib/api/classes";
import { notify } from "@/lib/notifications";

type RubricEditorDialogProps = {
  open: boolean;
  assignment: AssignmentDto;
  onClose: () => void;
  onSuccess: (assignment: AssignmentDto) => void;
  locked?: boolean;
};

type RubricLevel = {
  id: string;
  label: string;
  description?: string;
  percentage: number;
};

type RubricCriterion = {
  id: string;
  title: string;
  description?: string;
  weight: number;
  descriptors: string[];
};

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const DEFAULT_LEVELS: RubricLevel[] = [
  { id: "excellent", label: "Excellent", percentage: 100 },
  { id: "good", label: "Good", percentage: 80 },
  { id: "satisfactory", label: "Satisfactory", percentage: 60 },
  { id: "needs_improvement", label: "Needs Improvement", percentage: 40 },
];

export function RubricEditorDialog({
  open,
  assignment,
  onClose,
  onSuccess,
  locked = false,
}: RubricEditorDialogProps) {
  const [pending, setPending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [rubricLocked, setRubricLocked] = useState(locked);
  const [revisionNumber, setRevisionNumber] = useState(assignment.rubricRevisionNumber);

  const [levels, setLevels] = useState<RubricLevel[]>(DEFAULT_LEVELS);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const [initialRubric, setInitialRubric] = useState<{ levels: RubricLevel[]; criteria: RubricCriterion[] } | null>(null);

  const hasUnsavedChanges = useMemo(() => {
    if (!initialRubric) return false;
    const current = { levels, criteria };
    return JSON.stringify(current) !== JSON.stringify(initialRubric);
  }, [levels, criteria, initialRubric]);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadRubric() {
      if (open) {
        try {
          const rubricData = await classesApi.getRubric(assignment.classId, assignment.id);
          setRubricLocked(rubricData.locked);
          setRevisionNumber(rubricData.rubricRevisionNumber);

          if (rubricData.rubric) {
            setLevels(rubricData.rubric.levels);
            const mappedCriteria = rubricData.rubric.criteria.map(function mapCriteria(c) {
              return {
                id: c.id,
                title: c.title,
                description: c.description || "",
                weight: c.weight,
                descriptors: c.descriptors,
              };
            });
            setCriteria(mappedCriteria);
            const mappedLevels = rubricData.rubric.levels.map(function mapLevel(l) {
              return { ...l };
            });
            const mappedCriteria2 = rubricData.rubric.criteria.map(function mapCriterion(c) {
              return { ...c };
            });
            setInitialRubric({
              levels: mappedLevels,
              criteria: mappedCriteria2,
            });
          } else {
            setLevels(DEFAULT_LEVELS);
            setCriteria([]);
            const mappedDefaultLevels = DEFAULT_LEVELS.map(function mapDefault(l) {
              return { ...l };
            });
            setInitialRubric({
              levels: mappedDefaultLevels,
              criteria: [],
            });
          }
        } catch {
          setLevels(DEFAULT_LEVELS);
          setCriteria([]);
          const mappedDefaultLevels2 = DEFAULT_LEVELS.map(function mapDefault2(l) {
            return { ...l };
          });
          setInitialRubric({
            levels: mappedDefaultLevels2,
            criteria: [],
          });
        }
      }
    }

    loadRubric();
  }, [open, assignment]);

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const isValid = totalWeight === 100 && criteria.length > 0 && levels.length >= 2;

  // Dynamic grid template based on number of levels
  const gridTemplateColumns = `200px repeat(${levels.length}, minmax(170px, 1fr)) auto`;

  async function handleGenerateWithAI() {
    if (generating || !aiPrompt.trim()) return;

    if (hasUnsavedChanges) {
      const confirmed = window.confirm("Replace the current rubric with an AI-generated draft?");
      if (!confirmed) return;
    }

    setGenerating(true);
    setError("");

    try {
      const rubricDraft = await classesApi.generateRubric(assignment.classId, assignment.id, aiPrompt);

      setLevels(rubricDraft.levels.map((l) => {
        const level: RubricLevel = {
          id: l.id,
          label: l.label,
          percentage: l.percentage,
        };
        if (l.description !== undefined && l.description !== null && l.description !== "") {
          (level as Partial<RubricLevel>).description = l.description;
        }
        return level;
      }));
      setCriteria(rubricDraft.criteria.map((c) => {
        const criterion: RubricCriterion = {
          id: c.id,
          title: c.title,
          weight: c.weight,
          descriptors: c.descriptors,
        };
        if (c.description !== undefined && c.description !== null && c.description !== "") {
          (criterion as Partial<RubricCriterion>).description = c.description;
        }
        return criterion;
      }));

      notify.success("Rubric draft generated", "rubric-generated");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not generate a rubric. Please try again."
      );
      notify.error(caught, "Could not generate a rubric. Try again.", "rubric-generation-error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleApply() {
    if (!isValid || pending) return;

    setPending(true);
    setError("");

    try {
      const rubricInput: RubricInput = {
        version: 1,
        title: `${assignment.title} Rubric`,
        description: "",
        levels,
        criteria,
      };

      const updated = await classesApi.saveRubric(assignment.classId, assignment.id, rubricInput);
      setRevisionNumber(updated.rubricRevisionNumber);
      onSuccess(updated);
      notify.success("Rubric saved", "rubric-saved");
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save rubric. Please try again."
      );
      notify.error(caught, "Could not save rubric. Try again.", "rubric-save-error");
    } finally {
      setPending(false);
    }
  }

  function handleAddLevel() {
    if (levels.length >= 6) return;
    const newLevel: RubricLevel = {
      id: generateId(),
      label: "New Level",
      percentage: 50,
    };
    setLevels([...levels, newLevel]);

    setCriteria(criteria.map((c) => ({
      ...c,
      descriptors: [...c.descriptors, ""],
    })));
  }

  function handleRemoveLevel(levelId: string) {
    if (levels.length <= 2) return;

    const levelIndex = levels.findIndex((l) => l.id === levelId);
    setLevels(levels.filter((l) => l.id !== levelId));

    setCriteria(criteria.map((c) => ({
      ...c,
      descriptors: c.descriptors.filter((_, i) => i !== levelIndex),
    })));
  }

  function handleAddCriterion() {
    if (criteria.length >= 12) return;
    const newCriterion: RubricCriterion = {
      id: generateId(),
      title: "New Criterion",
      weight: 10,
      descriptors: levels.map(() => ""),
    };
    setCriteria([...criteria, newCriterion]);
  }

  function handleRemoveCriterion(criterionId: string) {
    setCriteria(criteria.filter((c) => c.id !== criterionId));
  }

  function handleLevelChange(levelId: string, field: keyof RubricLevel, value: string | number) {
    setLevels(levels.map((l) =>
      l.id === levelId ? { ...l, [field]: value } : l
    ));
  }

  function handleCriterionChange(criterionId: string, field: keyof RubricCriterion, value: string | number) {
    setCriteria(criteria.map((c) =>
      c.id === criterionId ? { ...c, [field]: value } : c
    ));
  }

  function handleDescriptorChange(criterionId: string, levelIndex: number, value: string) {
    setCriteria(criteria.map((c) => {
      if (c.id !== criterionId) return c;
      const newDescriptors = [...c.descriptors];
      newDescriptors[levelIndex] = value;
      return { ...c, descriptors: newDescriptors };
    }));
  }

  function handleClose() {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm("You have unsaved changes. Close anyway?");
      if (!confirmed) return;
    }
    onClose();
  }

  if (!open) return null;

  return (
    <div className="settings-backdrop" onClick={handleClose}>
      <div
        ref={dialogRef}
        className="settings-dialog rubric-editor-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <div>
            <span className="rubric-editor-eyebrow">RUBRIC EDITOR</span>
            <h2>Rubric: {assignment.title}</h2>
            {rubricLocked && (
              <span className="rubric-locked-badge">Locked</span>
            )}
            {revisionNumber && (
              <span className="rubric-revision-badge">Revision {revisionNumber}</span>
            )}
          </div>
          <button className="settings-close" onClick={handleClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div className="rubric-editor-content">
          {rubricLocked && (
            <div className="rubric-locked-notice">
              <p>
                <strong>Rubric locked</strong> — This rubric is locked because students have already submitted work.
              </p>
            </div>
          )}

          {!rubricLocked && (
            <div className="rubric-ai-section">
              <label>
                Describe the rubric you want AI to generate...
              </label>
              <div className="rubric-ai-row">
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g., Create a rubric for a 500-word argumentative essay about social media. Focus on content, organization, evidence, vocabulary, grammar and mechanics."
                  rows={3}
                  maxLength={4000}
                />
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleGenerateWithAI}
                  disabled={generating || !aiPrompt.trim()}
                >
                  {generating && <LoaderCircle className="spinner" aria-hidden="true" />}
                  {generating ? "Generating…" : "Generate with AI"}
                </button>
              </div>
            </div>
          )}

          <div className="rubric-section">
            <div className="rubric-section-header">
              <h3>Grading Levels</h3>
              {!rubricLocked && levels.length < 6 && (
                <button
                  type="button"
                  className="button button-ghost button-small"
                  onClick={handleAddLevel}
                >
                  <Plus />
                  Add Level
                </button>
              )}
            </div>
            <div className="rubric-levels">
              <div className="rubric-levels-header" style={{ gridTemplateColumns }}>
                <div className="rubric-levels-header-label">Grading criterion</div>
                {levels.map((level) => (
                  <div key={level.id} className="rubric-levels-header-label">
                    {level.label}
                  </div>
                ))}
                {!rubricLocked && levels.length < 6 && (
                  <div></div>
                )}
              </div>
              <div className="rubric-levels-row" style={{ gridTemplateColumns }}>
                <div className="rubric-levels-header-label">Level name</div>
                {levels.map((level) => (
                  <div key={level.id} className="rubric-level-column">
                    <input
                      type="text"
                      value={level.label}
                      onChange={(e) => handleLevelChange(level.id, "label", e.target.value)}
                      placeholder="Level name"
                      className="rubric-level-label"
                      disabled={rubricLocked}
                      readOnly={rubricLocked}
                    />
                    <div className="rubric-level-percent-label">Percentage</div>
                    <div className="rubric-level-percent-input">
                      <input
                        type="number"
                        value={level.percentage}
                        onChange={(e) => handleLevelChange(level.id, "percentage", parseInt(e.target.value) || 0)}
                        min="0"
                        max="100"
                        className="rubric-level-percentage"
                        disabled={rubricLocked}
                        readOnly={rubricLocked}
                      />
                      <span className="rubric-level-percent">%</span>
                    </div>
                    {!rubricLocked && levels.length > 2 && (
                      <div className="rubric-level-actions">
                        <button
                          type="button"
                          className="button-icon button-destructive-outline"
                          onClick={() => handleRemoveLevel(level.id)}
                          aria-label="Remove level"
                        >
                          <Trash2 />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {!rubricLocked && levels.length < 6 && (
                  <button
                    type="button"
                    className="rubric-add-level"
                    onClick={handleAddLevel}
                  >
                    <Plus />
                    Add Level
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="rubric-section">
            <div className="rubric-section-header">
              <h3>Criteria</h3>
            </div>
            <div className="rubric-criteria">
              {criteria.length === 0 ? (
                <div className="rubric-empty-state">
                  <p>No criteria yet. Add your first criterion or generate one with AI.</p>
                  {!rubricLocked && (
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={handleAddCriterion}
                    >
                      <Plus />
                      Add Criterion
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="rubric-criteria-header" style={{ gridTemplateColumns }}>
                    <div className="rubric-criteria-header-label">Criterion</div>
                    {levels.map((level) => (
                      <div key={level.id} className="rubric-criteria-header-label">
                        {level.label}
                      </div>
                    ))}
                    <div></div>
                  </div>
                  {criteria.map((criterion) => (
                    <div key={criterion.id} className="rubric-criterion-row" style={{ gridTemplateColumns }}>
                      <div className="rubric-criterion-main">
                        <input
                          type="text"
                          value={criterion.title}
                          onChange={(e) => handleCriterionChange(criterion.id, "title", e.target.value)}
                          placeholder="Criterion title"
                          className="rubric-criterion-title"
                          disabled={rubricLocked}
                          readOnly={rubricLocked}
                        />
                        <div className="rubric-criterion-weight">
                          <label>Weight</label>
                          <input
                            type="number"
                            aria-label={`Weight for ${criterion.title}`}
                            value={criterion.weight}
                            onChange={(e) => handleCriterionChange(criterion.id, "weight", parseInt(e.target.value) || 0)}
                            min="1"
                            max="100"
                            disabled={rubricLocked}
                            readOnly={rubricLocked}
                          />
                        </div>
                      </div>
                      {levels.map((level, levelIndex) => (
                        <div key={level.id} className="rubric-descriptor-cell">
                          <textarea
                            value={criterion.descriptors[levelIndex] || ""}
                            onChange={(e) => handleDescriptorChange(criterion.id, levelIndex, e.target.value)}
                            placeholder={`Descriptor for ${level.label}`}
                            rows={3}
                            disabled={rubricLocked}
                            readOnly={rubricLocked}
                          />
                        </div>
                      ))}
                      {!rubricLocked && (
                        <div className="rubric-criterion-actions">
                          <button
                            type="button"
                            className="button-icon button-destructive-outline"
                            onClick={() => handleRemoveCriterion(criterion.id)}
                            aria-label="Remove criterion"
                          >
                            <Trash2 />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!rubricLocked && criteria.length < 12 && (
                    <button
                      type="button"
                      className="rubric-add-criterion"
                      onClick={handleAddCriterion}
                    >
                      <Plus />
                      Add Criterion
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="settings-footer rubric-editor-footer">
          <div className={`rubric-total-weight ${isValid ? "valid" : "invalid"}`}>
            Total Weight: {totalWeight} / 100
          </div>
          <div className="rubric-editor-actions">
            <button
              type="button"
              className="button button-ghost"
              onClick={handleClose}
              disabled={pending}
            >
              {rubricLocked ? "Close" : "Cancel"}
            </button>
            {!rubricLocked && (
              <button
                type="button"
                className="button button-primary"
                onClick={handleApply}
                disabled={!isValid || pending}
              >
                {pending && <LoaderCircle className="spinner" aria-hidden="true" />}
                {pending ? "Saving…" : "Apply Changes"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
