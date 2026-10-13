import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  // next dev compiles routes on demand, so first hits of a route can take 10s+
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    // Set PW_CHANNEL=chrome to use system Chrome where Playwright ships no Chromium build (e.g. macOS 13).
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NEXT_PUBLIC_ENABLE_DEV_LOGIN: "true" },
  },
});
