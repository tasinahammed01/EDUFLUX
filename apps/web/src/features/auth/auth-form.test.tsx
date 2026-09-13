import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "./auth-form";
import { authApi } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api/client";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));
vi.mock("@/lib/api/auth", () => ({ authApi: { register: vi.fn(), login: vi.fn() } }));

beforeEach(() => { vi.mocked(authApi.register).mockReset(); vi.mocked(authApi.login).mockReset(); replace.mockReset(); });
afterEach(cleanup);

describe("AuthForm", () => {
  it("renders password-manager-compatible login fields and validation", async () => {
    const user = userEvent.setup(); render(<AuthForm mode="login" />);
    expect(screen.getByLabelText("Email address")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("highlighted fields");
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it("supports persona selection and redirects a registered student", async () => {
    vi.mocked(authApi.register).mockResolvedValue({ user: { id: "1", displayName: "Student", email: "student@example.com", primaryPersona: "STUDENT", platformRole: "USER" } });
    const user = userEvent.setup(); render(<AuthForm mode="register" />);
    const student = screen.getByRole("button", { name: /Student/ }); await user.click(student); expect(student).toHaveAttribute("aria-pressed", "true");
    await user.type(screen.getByLabelText("Display name"), "Student One"); await user.type(screen.getByLabelText("Email address"), "student@example.com"); const password = document.querySelector<HTMLInputElement>('input[name="password"]'); expect(password).not.toBeNull(); await user.type(password!, "correct horse battery staple"); await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/student/dashboard")); expect(authApi.register).toHaveBeenCalledWith(expect.objectContaining({ primaryPersona: "STUDENT" }));
  });

  it("disables submission while a request is pending", async () => {
    vi.mocked(authApi.login).mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup(); render(<AuthForm mode="login" />);
    await user.type(screen.getByLabelText("Email address"), "teacher@example.com"); await user.type(screen.getByLabelText("Password"), "correct horse battery staple"); await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("button", { name: /Signing in/ })).toBeDisabled();
  });

  it("renders a safe server error and restores submission", async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiClientError("INVALID_CREDENTIALS", "Invalid email or password.", 401));
    const user = userEvent.setup(); render(<AuthForm mode="login" />);
    await user.type(screen.getByLabelText("Email address"), "teacher@example.com"); await user.type(screen.getByLabelText("Password"), "wrong password value"); await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password."); expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});
