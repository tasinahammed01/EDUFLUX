import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const workspace = path.resolve(import.meta.dirname, "../..");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "pnpm --filter @eduflux/api e2e:server", cwd: workspace, url: "http://127.0.0.1:5000/health/ready", reuseExistingServer: false, timeout: 120_000 },
    { command: "pnpm --filter @eduflux/web start --hostname 127.0.0.1", cwd: workspace, url: "http://127.0.0.1:3000", reuseExistingServer: false, timeout: 120_000 }
  ]
});
