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
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await user.click(button);
    expect(screen.getByRole("button", { name: "Close navigation" }).getAttribute("aria-expanded")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    await user.click(screen.getByRole("link", { name: "Features" }));
    expect(screen.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded")).toBe("false");
    expect(document.body.style.overflow).toBe("");
  });

  it("closes with Escape and returns focus", async () => {
    const user = userEvent.setup();
    render(<MobileNavigation />);
    const button = screen.getByRole("button", { name: "Open navigation" });
    await user.click(button);
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});
