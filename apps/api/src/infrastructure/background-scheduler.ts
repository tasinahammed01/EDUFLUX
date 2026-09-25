import { waitUntil } from "@vercel/functions";

export function scheduleBackgroundTask(task: Promise<unknown>): void {
  const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV !== undefined;
  
  if (isVercel) {
    waitUntil(task);
  } else {
    void task.catch((error: unknown) => {
      console.error("Background task failed:", error);
    });
  }
}
