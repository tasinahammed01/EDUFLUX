import { describe, expect, it } from "vitest";
import { hashRubric, normalizeRubric } from "./rubric-revision.service.js";

const rubric = {
  version: 1,
  title: "Essay rubric",
  description: "",
  levels: [
    { id: "strong", label: "Strong", description: "", percentage: 100 },
    { id: "developing", label: "Developing", description: "", percentage: 60 },
  ],
  criteria: [
    {
      id: "argument",
      title: "Argument",
      description: "",
      weight: 100,
      descriptors: ["Clear", "Developing"],
    },
  ],
};

describe("rubric revision canonicalization", () => {
  it("normalizes insignificant whitespace into a deterministic hash", () => {
    const spaced = {
      ...rubric,
      title: "  Essay rubric  ",
      criteria: [{ ...rubric.criteria[0]!, descriptors: [" Clear ", "Developing"] }],
    };
    expect(hashRubric(spaced)).toBe(hashRubric(rubric));
    expect(normalizeRubric(spaced).title).toBe("Essay rubric");
  });

  it("preserves intentional array order and changes hashes for grading changes", () => {
    const changed = {
      ...rubric,
      levels: [...rubric.levels].reverse(),
    };
    expect(hashRubric(changed)).not.toBe(hashRubric(rubric));
  });
});
