import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "./auth-form";
import {
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
} from "@/lib/firebase/auth";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
}));
vi.mock("@/lib/firebase/auth", () => ({
  loginWithEmail: vi.fn(),
  loginWithGoogle: vi.fn(),
  registerWithEmail: vi.fn(),
  firebaseErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Authentication failed",
}));
const teacher = {
  user: {
    id: "1",
    firebaseUid: "uid-1",
    displayName: "Teacher",
    email: "teacher@example.com",
    emailVerified: true,
    primaryPersona: "TEACHER" as const,
    platformRole: "USER" as const,
  },
  requiresOnboarding: false,
};
beforeEach(() => {
  vi.mocked(loginWithEmail).mockReset();
  vi.mocked(loginWithGoogle).mockReset();
  vi.mocked(registerWithEmail).mockReset();
  replace.mockReset();
});
afterEach(cleanup);
describe("AuthForm", () => {
  it.each(["login", "register"] as const)("exposes the Google action in %s mode", (mode) => {
    render(<AuthForm mode={mode} />);
    const button = screen.getByRole("button", { name: "Continue with Google" });
    expect(button.textContent).toContain("Continue with Google");
    expect(button.className).toContain("google-auth-button");
  });
  it("validates password-manager-compatible login fields", async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);
    expect(
      screen.getByLabelText("Email address").getAttribute("autocomplete"),
    ).toBe("email");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "highlighted",
    );
    expect(loginWithEmail).not.toHaveBeenCalled();
  });
  it("orchestrates email registration with a selected persona", async () => {
    vi.mocked(registerWithEmail).mockResolvedValue({
      ...teacher,
      user: { ...teacher.user, primaryPersona: "STUDENT" },
    });
    const user = userEvent.setup();
    render(<AuthForm mode="register" />);
    await user.click(screen.getByRole("button", { name: /Student/ }));
    await user.type(screen.getByLabelText("Display name"), "Student One");
    await user.type(
      screen.getByLabelText("Email address"),
      "student@example.com",
    );
    const password = document.querySelector<HTMLInputElement>(
      'input[name="password"]',
    );
    expect(password).not.toBeNull();
    await user.type(password!, "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/student/dashboard"),
    );
    expect(registerWithEmail).toHaveBeenCalledWith(
      expect.objectContaining({ primaryPersona: "STUDENT" }),
    );
  });
  it("starts Google sign-in directly and routes onboarding", async () => {
    vi.mocked(loginWithGoogle).mockResolvedValue({
      ...teacher,
      user: { ...teacher.user, primaryPersona: undefined },
      requiresOnboarding: true,
    });
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);
    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
    expect(loginWithGoogle).toHaveBeenCalledOnce();
  });
  it("prevents duplicate submission and restores safe errors", async () => {
    vi.mocked(loginWithEmail).mockRejectedValue(
      new Error("Email or password is incorrect."),
    );
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);
    await user.type(
      screen.getByLabelText("Email address"),
      "teacher@example.com",
    );
    await user.type(screen.getByLabelText("Password"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "incorrect",
    );
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Sign in" })
        .disabled,
    ).toBe(false);
  });
});
