import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MobileNavigation } from "./mobile-navigation";

afterEach(() => { cleanup(); document.body.style.overflow = ""; });

describe("MobileNavigation", () => {
  it("opens, closes, and restores body scrolling", async () => {
    const user = userEvent.setup();
    render(<MobileNavigation />);
    const button = screen.getByRole("button", { name: "Open navigation" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    expect(screen.getByRole("button", { name: "Close navigation" })).toHaveAttribute("aria-expanded", "true");
    expect(document.body.style.overflow).toBe("hidden");
    await user.click(screen.getByRole("link", { name: "Features" }));
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute("aria-expanded", "false");
    expect(document.body.style.overflow).toBe("");
  });

  it("closes with Escape and returns focus", async () => {
    const user = userEvent.setup();
    render(<MobileNavigation />);
    const button = screen.getByRole("button", { name: "Open navigation" });
    await user.click(button);
    await user.keyboard("{Escape}");
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
