import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const externalServer = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalServer || "http://localhost:3100";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: externalServer
    ? undefined
    : {
        command: "npm run start -- --hostname localhost --port 3100",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 60000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        },
      },
});
