import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassDashboard } from "./class-dashboard";
import { classesApi } from "@/lib/api/classes";
import { ApiClientError } from "@/lib/api/client";

const notificationMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  notify: { ...notificationMocks, info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/lib/api/classes", () => ({
  classesApi: { mine: vi.fn(), create: vi.fn(), join: vi.fn() },
}));
const created = {
  id: "class-1",
  name: "Year 10 Literature",
  subjectLevel: "English Literature",
  startDate: "2026-09-20",
  role: "OWNER" as const,
  joinedAt: "2026-09-20T00:00:00.000Z",
  createdAt: "2026-09-20T00:00:00.000Z",
  memberCount: 1,
  joinCode: "ABCD2345",
};
beforeEach(() => {
  vi.mocked(classesApi.mine).mockResolvedValue({ classes: [] });
  vi.mocked(classesApi.create).mockReset();
  notificationMocks.success.mockReset();
  notificationMocks.error.mockReset();
});
afterEach(cleanup);
async function open() {
  const user = userEvent.setup();
  render(<ClassDashboard mode="teacher" />);
  const trigger = screen.getByRole("button", { name: "Create class" });
  await user.click(trigger);
  return { user, trigger };
}
async function validForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Class Name"), created.name);
  await user.selectOptions(
    screen.getByLabelText("Subject / Level"),
    "English Literature",
  );
}

describe("teacher class creation", () => {
  it("opens accessibly, validates required fields and restores focus on cancel", async () => {
    const { user, trigger } = await open();
    expect(
      screen.getByRole("dialog", { name: "Create New Class" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Class Name"));
    await user.click(screen.getByRole("button", { name: "Create Class" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "highlighted",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("closes on Escape and returns focus", async () => {
    const { user, trigger } = await open();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("validates date order and enforces the description limit", async () => {
    const { user } = await open();
    await validForm(user);
    fireEvent.change(screen.getByLabelText("Start Date"), {
      target: { value: "2026-09-20" },
    });
    fireEvent.change(screen.getByLabelText("End Date"), {
      target: { value: "2026-09-19" },
    });
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: "x".repeat(501) },
    });
    expect(screen.getByText("500 / 500 characters")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create Class" }));
    expect(
      await screen.findByText("End date cannot be earlier than start date."),
    ).toBeTruthy();
    expect(classesApi.create).not.toHaveBeenCalled();
  });
  it("prevents duplicate submission and immediately shows the created class", async () => {
    let resolve!: (value: typeof created) => void;
    vi.mocked(classesApi.create).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { user } = await open();
    await validForm(user);
    await user.click(screen.getByRole("button", { name: "Create Class" }));
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: /Creating class/ })
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Creating class…" }));
    expect(classesApi.create).toHaveBeenCalledOnce();
    resolve(created);
    expect(
      await screen.findByRole("heading", { name: created.name }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(notificationMocks.success).toHaveBeenCalledOnce();
    expect(notificationMocks.success).toHaveBeenCalledWith("Class created", "class-created");
  });
  it("keeps the dialog open and presents API errors", async () => {
    vi.mocked(classesApi.create).mockRejectedValue(
      new ApiClientError(
        "VALIDATION_ERROR",
        "Please check the submitted fields.",
        400,
        { name: ["Choose another name."] },
      ),
    );
    const { user } = await open();
    await validForm(user);
    await user.click(screen.getByRole("button", { name: "Create Class" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "submitted fields",
    );
    expect(screen.getByText("Choose another name.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(notificationMocks.error).toHaveBeenCalledOnce();
  });
});
