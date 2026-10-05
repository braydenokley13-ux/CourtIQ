import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDefaultConfig } from "../apps/web/lib/defense-lab/scenario";
import {
  createAnswer,
  exportAnswers,
} from "../apps/web/lib/defense-lab/answers";
import { DEFAULT_OPPONENT } from "../apps/web/lib/defense-lab/offensivePolicy";
import type { LabConfig } from "../apps/web/lib/defense-lab/types";
const out = path.resolve("docs/defense-lab/qa-studio"),
  base = process.env.BASE_URL ?? "http://localhost:3000",
  key = "courtiq.defense-lab.answers.v1";
const steps: {
    name: string;
    passed: boolean;
    evidence?: unknown;
    error?: string;
  }[] = [],
  errors: string[] = [],
  failedRequests: string[] = [];
async function main() {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 0.75,
  });
  await context.addInitScript(() => {
    const NativeWorker = window.Worker;
    (window as unknown as { qaWorkerCount: number }).qaWorkerCount = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        (window as unknown as { qaWorkerCount: number }).qaWorkerCount++;
      }
    };
  });
  const page = await context.newPage(),
    button = (name: string | RegExp) =>
      page.getByRole("button", { name, exact: typeof name === "string" });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("requestfailed", (r) => failedRequests.push(r.url()));
  async function save(name: string): Promise<LabConfig> {
    if (await button("Close inspector").count())
      await button("Close inspector").click();
    await button("Save / teach").click();
    await page
      .getByRole("textbox", { name: "Answer name", exact: true })
      .fill(name);
    await button("Save answer").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    return page.evaluate(
      ({ k, n }) =>
        JSON.parse(localStorage.getItem(k)!).answers.find(
          (a: { name: string }) => a.name === n,
        ).config,
      { k: key, n: name },
    );
  }
  async function check(name: string, fn: () => Promise<unknown>) {
    try {
      const evidence = await fn();
      steps.push({ name, passed: true, evidence });
      console.log("PASS " + name);
    } catch (error) {
      steps.push({ name, passed: false, error: String(error) });
      await page.screenshot({
        path: path.join(out, "edge-failure-" + steps.length + ".png"),
        fullPage: true,
      });
      throw error;
    }
  }
  try {
    await page.goto(base + "/lab", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await expect(
      page.locator("[data-lab-renderer=webgl][data-athlete-type=skinned-glb]"),
    ).toBeVisible({ timeout: 60000 });
    await check(
      "Switch rejects suppressed tag template and hides D3 tag authoring",
      async () => {
        await button("Build our answer").click();
        await button("Switch").click();
        await page.getByText("Coach it in your words", { exact: true }).click();
        await page
          .getByRole("combobox", { name: "Coaching template", exact: true })
          .selectOption("Tag shallow and X-out on the pass.");
        await expect(button("Apply coaching cue")).toBeDisabled();
        await expect(page.getByRole("complementary")).toContainText(
          "No rule was created. Switch exchanges the screen defenders",
        );
        await page
          .getByRole("combobox", { name: "Coach a defender", exact: true })
          .selectOption("D3");
        await expect(button("Shallower tag")).toHaveCount(0);
        await expect(
          page.getByText("Coach the roller read", { exact: true }),
        ).toHaveCount(0);
        await page.screenshot({
          path: path.join(out, "16-switch-template-rejected.png"),
          fullPage: true,
        });
        return { config: await save("QA studio Switch rejected tag") };
      },
    );
    await check(
      "legacy authored model cannot silently start adaptive attack",
      async () => {
        const config = createDefaultConfig();
        delete config.opponent;
        config.answer.coachRules = [
          { kind: "roller-depth", depth: 4.8, response: "big-recovers" },
        ];
        config.interventions = [
          {
            kind: "answer",
            id: "legacy-timed",
            at: 0.75,
            patch: { tagDepth: 0.25 },
          },
        ];
        const file = path.join(out, "legacy-studio-answer.json");
        await writeFile(
          file,
          exportAnswers([
            createAnswer({ name: "QA studio legacy exact", config }),
          ]),
        );
        await button(/^Our system/).click();
        await page.locator("input[type=file]").setInputFiles(file);
        await page
          .getByTestId("saved-answer")
          .filter({ hasText: "QA studio legacy exact" })
          .getByRole("button", { name: "Open", exact: true })
          .click();
        await expect(button(/^Authored opponent/)).toBeVisible();
        const count = await page.evaluate(
          () => (window as unknown as { qaWorkerCount: number }).qaWorkerCount,
        );
        await page
          .locator('[aria-label="Experiment loop"]')
          .getByRole("button", { name: "Break my defense", exact: true })
          .click();
        await expect(button("Enable adaptive opponent")).toBeVisible();
        expect(
          await page.evaluate(
            () =>
              (window as unknown as { qaWorkerCount: number }).qaWorkerCount,
          ),
        ).toBe(count);
        await expect(page.getByTestId("break-mode")).toHaveCount(0);
        const before = await save("QA studio legacy before enable");
        expect(before).toEqual(config);
        await button(/^Authored opponent/).click();
        await button("Enable adaptive opponent").click();
        await expect(button(/^Live opponent/)).toBeVisible();
        const after = await save("QA studio legacy explicitly enabled");
        expect(after.opponent).toEqual(DEFAULT_OPPONENT);
        const { opponent, ...remaining } = after;
        expect(remaining).toEqual(before);
        await page.screenshot({
          path: path.join(out, "17-legacy-explicit-adaptive.png"),
          fullPage: true,
        });
        await page
          .locator('[aria-label="Experiment loop"]')
          .getByRole("button", { name: "Break my defense", exact: true })
          .click();
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (window as unknown as { qaWorkerCount: number }).qaWorkerCount,
            ),
          )
          .toBe(count + 1);
        await expect(page.getByTestId("break-mode")).toHaveAttribute(
          "data-phase",
          "frozen",
          { timeout: 120000 },
        );
        await page.screenshot({
          path: path.join(out, "18-default-porcelain-enabled-witness.png"),
          fullPage: true,
        });
        return {
          before,
          after,
          workersBeforeEnable: count,
          workersAfterExplicitAttack: count + 1,
        };
      },
    );
    await check(
      "edge runtime remains free of errors and request failures",
      async () => {
        expect(errors).toEqual([]);
        expect(failedRequests).toEqual([]);
        return { errors, failedRequests };
      },
    );
  } catch (error) {
    console.error("Edge verification stopped: " + String(error));
  } finally {
    await writeFile(
      path.join(out, "edges-report.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          baseUrl: base,
          production: process.env.PRODUCTION === "1",
          environment:
            "Anonymous Chromium SwiftShader cloud; actual UI import/authoring, native Worker-construction count.",
          passed: steps.length === 3 && steps.every((s) => s.passed),
          steps,
          errors,
          failedRequests,
        },
        null,
        2,
      ),
    );
    await browser.close();
    if (steps.length !== 3 || steps.some((s) => !s.passed))
      process.exitCode = 1;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
