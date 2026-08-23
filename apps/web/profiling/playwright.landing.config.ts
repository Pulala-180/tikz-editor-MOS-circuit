/**
 * Playwright config for profiling the landing page.
 * Uses a production build so the captured profile reflects real runtime cost.
 */
import { defineConfig, devices } from "@playwright/test";

const withoutColorEnv = "env -u NO_COLOR -u FORCE_COLOR";

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "off",
    reducedMotion: "no-preference",
    viewport: {
      width: 1600,
      height: 2200
    }
  },
  webServer: {
    command: `${withoutColorEnv} npm run generate:feature-svgs && ${withoutColorEnv} npx vite build --sourcemap && ${withoutColorEnv} npx vite preview --host 127.0.0.1 --port 4175`,
    cwd: "../../landing",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: {
          width: 1600,
          height: 2200
        },
        reducedMotion: "no-preference"
      }
    }
  ]
});
