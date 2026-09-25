import { describe, expect, it, vi } from "vitest";
import { aggregateCorrectionStats, CORRECTION_CATEGORIES, CORRECTION_LEGEND, normalizeCorrection } from "./correction-taxonomy";

describe("correction taxonomy", () => {
  it("defines all 28 codes with one of five semantic categories", () => {
    expect(Object.keys(CORRECTION_LEGEND)).toHaveLength(28);
    for (const [code, entry] of Object.entries(CORRECTION_LEGEND)) {
      expect(normalizeCorrection(code)).toMatchObject(entry);
      expect(CORRECTION_CATEGORIES).toContain(entry.category);
      expect(normalizeCorrection(code).token).toBe(`var(--correction-${entry.category})`);
    }
  });
  it("aggregates issues once into exactly five categories and safely handles unknown codes", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(aggregateCorrectionStats([{ code: "AGR" }, { code: "REL" }, { code: "SP" }, { code: "unknown", category: "vocabulary" }])).toEqual({ content: 1, grammar: 1, organization: 0, vocabulary: 1, mechanics: 1 });
    expect(normalizeCorrection("unknown", "vocabulary").code).toBe("OTHER");
  });
});
