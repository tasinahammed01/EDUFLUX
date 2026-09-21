import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const workspace = path.resolve(import.meta.dirname, "../..");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "pnpm --filter @eduflux/api e2e:server", cwd: workspace, env: { EDUFLUX_E2E_API_PORT: "5100", EDUFLUX_E2E_WEB_ORIGIN: "http://127.0.0.1:3100" }, url: "http://127.0.0.1:5100/health/ready", reuseExistingServer: false, timeout: 120_000 },
    { command: "pnpm --filter @eduflux/web build && pnpm --filter @eduflux/web start --hostname 127.0.0.1 --port 3100", cwd: workspace, env: { API_INTERNAL_URL: "http://127.0.0.1:5100" }, url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 120_000 }
  ]
});
