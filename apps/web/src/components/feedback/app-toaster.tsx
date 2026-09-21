"use client";

import { Toaster } from "sonner";
import { useTheme } from "next-themes";

export function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === "light" ? "light" : "dark"}
      position="top-right"
      richColors
      closeButton
      visibleToasts={4}
      toastOptions={{ duration: 4500, className: "eduflux-toast" }}
    />
  );
}
