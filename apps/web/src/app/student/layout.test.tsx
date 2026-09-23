import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentLayout from "./layout";

const mocks = vi.hoisted(() => ({ getServerSession: vi.fn(), redirect: vi.fn((target: string) => { throw new Error(`REDIRECT:${target}`); }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/server-session", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/components/app/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div> }));

const user = { id: "user", firebaseUid: "firebase", displayName: "Student", email: "student@example.com", emailVerified: true, platformRole: "USER" as const };

describe("StudentLayout authorization", () => {
  it("allows a student persona to render the student route", async () => {
    mocks.getServerSession.mockResolvedValue({ requiresOnboarding: false, user: { ...user, primaryPersona: "STUDENT" } });
    render(await StudentLayout({ children: <p>Exact review route</p> }));
    expect(screen.getByTestId("app-shell")).toHaveTextContent("Exact review route");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects a teacher persona away from student routes", async () => {
    mocks.getServerSession.mockResolvedValue({ requiresOnboarding: false, user: { ...user, primaryPersona: "TEACHER" } });
    await expect(StudentLayout({ children: <p>Review</p> })).rejects.toThrow("REDIRECT:/teacher/dashboard");
  });
});
