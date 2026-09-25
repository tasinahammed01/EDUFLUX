export const CORRECTION_CATEGORIES = ["content", "grammar", "organization", "vocabulary", "mechanics"] as const;

export { CORRECTION_LEGEND, type CorrectionCode, type CorrectionCategory } from "@eduflux/shared-types";
import { CORRECTION_LEGEND, type CorrectionCode, type CorrectionCategory } from "@eduflux/shared-types";
export const CATEGORY_LABELS: Record<CorrectionCategory, string> = { content: "Content", grammar: "Grammar", organization: "Organization", vocabulary: "Vocabulary", mechanics: "Mechanics" };

const categoryAliases: Record<string, CorrectionCategory> = {
  content: "content", content_relevance_and_accuracy: "content", relevance: "content",
  grammar: "grammar", grammar_and_mechanics: "grammar",
  organization: "organization", organization_and_coherence: "organization",
  vocabulary: "vocabulary", vocabulary_and_word_choice: "vocabulary",
  mechanics: "mechanics", spelling_and_punctuation: "mechanics",
};

export function normalizeCorrection(code: string, category?: string, label?: string) {
  const normalizedCode = code.trim().toUpperCase();
  const known = CORRECTION_LEGEND[normalizedCode as CorrectionCode];
  if (known) return { code: normalizedCode as CorrectionCode, ...known, token: `var(--correction-${known.category})` };
  const normalizedCategory = (category ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const safeCategory = categoryAliases[normalizedCategory] ?? "grammar";
  if (process.env.NODE_ENV === "development") console.warn(`[review] Unknown correction code: ${normalizedCode || "(empty)"}`);
  return { code: "OTHER", label: label && !label.includes("_") ? label : "Other", category: safeCategory, token: `var(--correction-${safeCategory})` } as const;
}

export function aggregateCorrectionStats(issues: ReadonlyArray<{ code: string; category?: string; label?: string }>) {
  const counts: Record<CorrectionCategory, number> = { content: 0, grammar: 0, organization: 0, vocabulary: 0, mechanics: 0 };
  for (const issue of issues) counts[normalizeCorrection(issue.code, issue.category, issue.label).category] += 1;
  return counts;
}
