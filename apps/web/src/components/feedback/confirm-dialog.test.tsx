import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

afterEach(cleanup);
describe("ConfirmDialog", () => {
  it("favors cancel, traps focus, cancels safely, and restores focus", async () => {
    const user = userEvent.setup(), cancel = vi.fn(), confirm = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger); trigger.focus();
    const { rerender } = render(<ConfirmDialog open title="Rotate invite link?" description="The old link will stop working." confirmLabel="Rotate link" variant="warning" onCancel={cancel} onConfirm={confirm} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    expect(cancel).toHaveBeenCalledOnce();
    rerender(<ConfirmDialog open={false} title="Rotate invite link?" description="The old link will stop working." confirmLabel="Rotate link" onCancel={cancel} onConfirm={confirm} />);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    trigger.remove();
  });

  it("confirms once and remains open when the action fails", async () => {
    const user = userEvent.setup(), cancel = vi.fn();
    let reject!: (error: Error) => void;
    const confirm = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
    render(<ConfirmDialog open title="Archive class?" description="Enrollment will stop." confirmLabel="Archive class" variant="destructive" onCancel={cancel} onConfirm={confirm} />);
    await user.click(screen.getByRole("button", { name: "Archive class" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Archive class/ })).toBeDisabled();
    reject(new Error("failed"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    expect(cancel).not.toHaveBeenCalled();
  });
});
