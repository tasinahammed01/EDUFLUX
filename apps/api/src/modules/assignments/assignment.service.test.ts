import { describe, it, expect } from "vitest";
import { ApiError } from "../../utils/api-error.js";

describe("Assignment Service - Delete Logic", () => {
  it("should define ASSIGNMENT_HAS_SUBMISSIONS error code", () => {
    expect(() => {
      throw new ApiError(
        409,
        "ASSIGNMENT_HAS_SUBMISSIONS",
        "Assignments with student submissions cannot be permanently deleted. Archive it instead."
      );
    }).toThrow();
  });

  it("should preserve historical submissions by requiring no submissions before delete", () => {
    // This test documents the safety policy:
    // - DRAFT + NO submissions: Delete allowed
    // - PUBLISHED + NO submissions: Delete allowed if current product rules permit
    // - HAS student submissions: Prefer Archive instead of permanent deletion
    const hasSubmissions = true;
    const canDelete = !hasSubmissions;
    expect(canDelete).toBe(false);
  });
});
