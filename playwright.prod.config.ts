// Opt-in: runs the e2e suite against a production build on :3100 (dev server is flaky).
//   NEXT_PUBLIC_ENABLE_DEV_LOGIN=true pnpm build
//   PW_CHANNEL=chrome pnpm exec playwright test -c playwright.prod.config.ts
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: "http://localhost:3100" },
  webServer: {
    command: "pnpm start --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NEXT_PUBLIC_ENABLE_DEV_LOGIN: "true" },
  },
});
