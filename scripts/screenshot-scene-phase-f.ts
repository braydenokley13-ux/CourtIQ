import { chromium, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import net from "node:net";

/**
 * Phase F0 — screenshot harness for the CourtIQ scene redesign.
 *
 * Boots a Next.js dev server, opens the dev-only `/dev/scene-preview`
 * route (BDW-01 by default), waits for the canvas to settle, and
 * saves PNG snapshots into `docs/qa/courtiq/phase-f/`.
 *
 * Usage: `pnpm qa:scene:screenshots` (or invoke this script directly
 * via tsx). The script accepts a `LABEL` env var so the F0 / F5
 * captures share the harness:
 *
 *   LABEL=before pnpm qa:scene:screenshots   # before F1
 *   LABEL=after  pnpm qa:scene:screenshots   # after F5
 */

const LABEL = process.env.LABEL ?? "before";
const SCENARIO = process.env.SCENARIO ?? "BDW-01";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const OUT_DIR = path.resolve(process.cwd(), "docs/qa/courtiq/phase-f");
const SKIP_SERVER = process.env.SKIP_SERVER === "1";
const PORT = Number(BASE_URL.split(":").pop()) || 3100;

const PREVIEW_URL = (fullscreen: boolean) =>
  `${BASE_URL}/dev/scene-preview?scenario=${SCENARIO}${fullscreen ? "&fullscreen=1" : ""}`;

function waitForPort(port: number, host = "127.0.0.1", timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.createConnection({ port, host }, () => {
        sock.end();
        resolve();
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`port ${port} never opened within ${timeoutMs}ms`));
          return;
        }
        setTimeout(tryOnce, 750);
      });
    };
    tryOnce();
  });
}

async function startDevServer(): Promise<ChildProcessWithoutNullStreams> {
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "qa-only-anon-key",
    PORT: String(PORT),
  };
  const child = spawn("pnpm", ["--filter", "@courtiq/web", "dev"], {
    cwd: path.resolve(process.cwd()),
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    if (process.env.VERBOSE === "1") process.stdout.write(`[next] ${text}`);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    if (process.env.VERBOSE === "1") process.stderr.write(`[next] ${text}`);
  });
  return child;
}

function killTree(child: ChildProcessWithoutNullStreams): void {
  try {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

async function captureOne(page: Page, fullscreen: boolean, outFile: string): Promise<void> {
  const url = PREVIEW_URL(fullscreen);
  console.log(`Visiting ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForSelector("canvas", { timeout: 90_000 });
  // Wait for ScenePreviewClient to flip data-scene-ready=1.
  try {
    await page.waitForFunction(
      () => document.querySelector("main[data-scene-ready='1']") !== null,
      { timeout: 30_000 },
    );
  } catch {
    console.warn("[warn] data-scene-ready=1 never observed; capturing anyway");
  }
  // Belt-and-suspenders settle wait so the WebGL frame is steady.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: outFile, fullPage: false });
  console.log(`Saved ${outFile}`);
}

async function captureCloseup(page: Page, outFile: string): Promise<void> {
  // Close-up: navigate fresh and clip to the rectangle that contains
  // the user (right-side cluster) and the closest defender on the
  // BDW-01 scene. Coordinates are tuned against the 1440x900 viewport
  // and the 720px-tall <Scenario3DView height={720}> wrapper.
  const url = PREVIEW_URL(false);
  console.log(`Visiting ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForSelector("canvas", { timeout: 90_000 });
  try {
    await page.waitForFunction(
      () => document.querySelector("main[data-scene-ready='1']") !== null,
      { timeout: 30_000 },
    );
  } catch {
    /* fall through */
  }
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: outFile,
    clip: { x: 760, y: 80, width: 600, height: 540 },
  });
  console.log(`Saved ${outFile}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let server: ChildProcessWithoutNullStreams | null = null;
  if (!SKIP_SERVER) {
    console.log(`Starting Next dev server on port ${PORT}`);
    server = await startDevServer();
    try {
      await waitForPort(PORT);
      // Next.js prints "Ready" before all routes compile; give the
      // first request to /dev/scene-preview a generous compile budget.
      console.log(`Dev server up on :${PORT}; warming up`);
    } catch (err) {
      console.error(err);
      server.kill("SIGTERM");
      process.exit(1);
    }
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        console.log(`[browser:${msg.type()}] ${msg.text()}`);
      }
    });
    page.on("pageerror", (err) => {
      console.log(`[browser:pageerror] ${err.message}`);
    });

    const defaultPath = path.join(OUT_DIR, `phase-f-${LABEL}-default.png`);
    const fullscreenPath = path.join(OUT_DIR, `phase-f-${LABEL}-fullscreen.png`);
    const closeupPath = path.join(OUT_DIR, `phase-f-${LABEL}-player-closeup.png`);

    await captureOne(page, false, defaultPath);
    await captureCloseup(page, closeupPath);
    try {
      await captureOne(page, true, fullscreenPath);
    } catch (err) {
      console.warn(`[warn] fullscreen capture failed: ${(err as Error).message}`);
    }
  } finally {
    await browser?.close();
    if (server) {
      killTree(server);
      // Give Next a beat to flush before exit.
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
