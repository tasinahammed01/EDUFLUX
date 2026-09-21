import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./theme-toggle";

const themeMock = vi.hoisted(() => ({
  theme: "system",
  resolvedTheme: "dark",
  setTheme: vi.fn(),
}));
vi.mock("next-themes", () => ({ useTheme: () => themeMock }));

beforeEach(() => {
  themeMock.theme = "system";
  themeMock.resolvedTheme = "dark";
  themeMock.setTheme.mockReset();
});
afterEach(cleanup);

describe("ThemeToggle", () => {
  it("exposes all modes and communicates the current selection", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const trigger = screen.getByRole("button", { name: "Change theme" });
    await user.click(trigger);
    expect(screen.getByRole("menuitemradio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("menuitemradio", { name: "Light" }));
    expect(themeMock.setTheme).toHaveBeenCalledWith("light");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the menu with Escape", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle compact />);
    const trigger = screen.getByRole("button", { name: "Change theme" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
