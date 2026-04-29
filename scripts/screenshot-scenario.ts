import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SCENARIO = process.env.SCENARIO ?? "BDW-01";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const URL = `${BASE_URL}/train?scenario=${SCENARIO}`;
const OUT_DIR = path.resolve(process.cwd(), "docs/screenshots", SCENARIO);

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      console.log(`[browser:${type}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.log(`[browser:pageerror] ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    console.log(`[browser:requestfailed] ${req.url()} - ${req.failure()?.errorText}`);
  });

  console.log(`Opening ${URL}`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await page.waitForSelector("canvas", { timeout: 30_000 }).catch(() => {
    console.log("[warn] <canvas> never appeared within 30s");
  });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {
    console.log("[warn] network did not reach idle within 30s");
  });

  const debugPath = path.join(OUT_DIR, "debug.png");
  await page.screenshot({ path: debugPath, fullPage: true });
  console.log(`Saved ${debugPath}`);

  await page.waitForTimeout(3000);

  const afterPath = path.join(OUT_DIR, "debug-after-play.png");
  await page.screenshot({ path: afterPath, fullPage: true });
  console.log(`Saved ${afterPath}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
