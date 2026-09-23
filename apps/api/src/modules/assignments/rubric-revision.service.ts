import { createHash } from "node:crypto";
import type { ClientSession } from "mongoose";
import type { RubricInput } from "@eduflux/validation";
import { RubricRevisionModel, type RubricRevisionRecord } from "./rubric-revision.model.js";

function normalizedText(value: string | undefined): string {
  return value?.trim() ?? "";
}

export type NormalizedRubric = {
  version: number;
  title: string;
  description: string;
  levels: Array<{ id: string; label: string; description: string; percentage: number }>;
  criteria: Array<{ id: string; title: string; description: string; weight: number; descriptors: string[] }>;
};

export function normalizeRubric(rubric: RubricInput): NormalizedRubric {
  return {
    version: 1,
    title: rubric.title.trim(),
    description: normalizedText(rubric.description),
    levels: rubric.levels.map((level) => ({
      id: level.id.trim(),
      label: level.label.trim(),
      description: normalizedText(level.description),
      percentage: level.percentage,
    })),
    criteria: rubric.criteria.map((criterion) => ({
      id: criterion.id.trim(),
      title: criterion.title.trim(),
      description: normalizedText(criterion.description),
      weight: criterion.weight,
      descriptors: criterion.descriptors.map((descriptor) => descriptor.trim()),
    })),
  };
}

export function hashRubric(rubric: RubricInput | NormalizedRubric): string {
  const normalized = normalizeRubric(rubric);
  const canonical = {
    title: normalized.title,
    description: normalized.description,
    levels: normalized.levels.map(({ id, label, description, percentage }) => ({
      id,
      label,
      description: description ?? "",
      percentage,
    })),
    criteria: normalized.criteria.map(({ id, title, description, weight, descriptors }) => ({
      id,
      title,
      description: description ?? "",
      weight,
      descriptors,
    })),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function rubricMaxScore(rubric: RubricInput | NormalizedRubric): number {
  return rubric.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
}

export async function findCurrentRubricRevision(
  revisionId: string | undefined,
  assignmentId: string,
  session?: ClientSession,
): Promise<RubricRevisionRecord | null> {
  if (!revisionId) return null;
  const query = RubricRevisionModel.findOne({ _id: revisionId, assignmentId }).lean();
  if (session) query.session(session);
  return query.exec();
}

export async function findRubricRevisionByHash(
  assignmentId: string,
  rubricHash: string,
  session?: ClientSession,
) {
  const query = RubricRevisionModel.findOne({ assignmentId, rubricHash }).lean();
  if (session) query.session(session);
  return query.exec();
}
