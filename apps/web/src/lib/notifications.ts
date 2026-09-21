import { toast } from "sonner";
import { ApiClientError } from "./api/client";

function message(error: unknown, fallback: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "You're offline. Check your connection and try again.";
  if (error instanceof ApiClientError) {
    if (error.status === 403) return "You don't have permission to do that.";
    if (error.status === 429) return "Too many attempts. Please wait and try again.";
    if (error.status >= 500 || error.status === 0) return "Something went wrong. Please try again.";
  }
  return fallback;
}

export const notify = {
  success: (text: string, id?: string) => toast.success(text, id ? { id } : {}),
  info: (text: string, id?: string) => toast.info(text, id ? { id } : {}),
  warning: (text: string, id?: string) => toast.warning(text, id ? { id } : {}),
  error: (error: unknown, fallback: string, id?: string) => toast.error(message(error, fallback), id ? { id, duration: 7000 } : { duration: 7000 }),
};
