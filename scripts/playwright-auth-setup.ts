import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const AUTH_DIR = path.resolve(process.cwd(), ".auth");
const AUTH_FILE = path.join(AUTH_DIR, "courtiq-user.json");

async function main() {
  await mkdir(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log(`\nOpening ${BASE_URL}/login`);
  console.log("Complete login in the browser window. This script will save");
  console.log("your session automatically once you land on /home or /onboarding.\n");

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });

  // Wait up to 5 minutes for the user to complete login and land on a
  // non-auth route. The Supabase flow passes through /auth/callback before
  // settling on /home or /onboarding, so we exclude both prefixes.
  await page.waitForURL(
    (url) =>
      !url.pathname.startsWith("/login") &&
      !url.pathname.startsWith("/signup") &&
      !url.pathname.startsWith("/auth") &&
      !url.pathname.startsWith("/forgot-password"),
    { timeout: 300_000 },
  );

  await context.storageState({ path: AUTH_FILE });
  console.log(`\nAuth state saved to ${AUTH_FILE}`);
  console.log("You can now run: pnpm qa:screenshot\n");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
