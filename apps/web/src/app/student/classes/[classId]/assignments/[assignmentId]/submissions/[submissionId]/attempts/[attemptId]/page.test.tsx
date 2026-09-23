import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Page from "./page";

vi.mock("@/features/classes/student-submission-review", () => ({
  StudentSubmissionReview: (props: Record<string, string>) => <output data-testid="student-review">{JSON.stringify(props)}</output>,
}));

describe("student immutable attempt page", () => {
  afterEach(() => vi.clearAllMocks());
  it("resolves and forwards every exact dynamic route parameter", async () => {
    const params = { classId: "class", assignmentId: "assignment", submissionId: "submission", attemptId: "attempt" };
    render(await Page({ params: Promise.resolve(params) }));
    expect(screen.getByTestId("student-review")).toHaveTextContent(JSON.stringify(params));
  });
});
