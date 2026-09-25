import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleBackgroundTask } from "./background-scheduler.js";

describe("Background scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("handles normal Node environment with catch", async () => {
    vi.stubEnv("VERCEL", undefined);
    const task = Promise.resolve("done");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    scheduleBackgroundTask(task);
    await task;
    consoleErrorSpy.mockRestore();
  });

  it("catches and logs background failures in normal Node", async () => {
    vi.stubEnv("VERCEL", undefined);
    const task = Promise.reject(new Error("Task failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    scheduleBackgroundTask(task);
    await task.catch(() => {});
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("does not throw when scheduling a task", () => {
    vi.stubEnv("VERCEL", undefined);
    const task = Promise.resolve("done");
    expect(() => scheduleBackgroundTask(task)).not.toThrow();
  });
});
