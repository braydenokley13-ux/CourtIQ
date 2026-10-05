import { chromium, expect, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDefaultConfig } from "../apps/web/lib/defense-lab/scenario";
import { simulate } from "../apps/web/lib/defense-lab/simulation";
import { compare } from "../apps/web/lib/defense-lab/analytics";
import type { LabConfig } from "../apps/web/lib/defense-lab/types";
const out = path.resolve("docs/defense-lab/qa-studio/final-spatial"),
  base = process.env.BASE_URL ?? "http://localhost:3000";
const steps: {
    name: string;
    passed: boolean;
    evidence?: unknown;
    error?: string;
  }[] = [],
  errors: string[] = [],
  failures: string[] = [];
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
  const page: Page = await context.newPage();
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("requestfailed", (r) => failures.push(r.url()));
  async function shot(name: string) {
    const p = path.join(out, name + ".png");
    await page.screenshot({ path: p, fullPage: true });
    console.log("SCREENSHOT " + p);
    return p;
  }
  async function check(name: string, fn: () => Promise<unknown>) {
    try {
      const evidence = await fn();
      steps.push({ name, passed: true, evidence });
      console.log("PASS " + name);
    } catch (error) {
      steps.push({ name, passed: false, error: String(error) });
      await shot("failure-" + steps.length);
      throw error;
    }
  }
  async function seek(t: number) {
    await page
      .getByRole("slider", { name: "Replay time", exact: true })
      .evaluate((input, t) => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(input, t.toFixed(3));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, t);
    await expect(page.getByTestId("lab-clock")).toHaveText(t.toFixed(2) + "s");
  }
  async function insight() {
    return page.getByTestId("lab-insight").boundingBox();
  }
  try {
    await check(
      "final production normal initial and exact tag checkpoint",
      async () => {
        await page.goto(base + "/lab", {
          waitUntil: "domcontentloaded",
          timeout: 90000,
        });
        await expect(
          page.locator(
            "[data-lab-renderer=webgl][data-athlete-type=skinned-glb]",
          ),
        ).toBeVisible({ timeout: 60000 });
        await expect(button("Open Next.js Dev Tools")).toHaveCount(0);
        const initial = await shot("01-normal-initial");
        await button("Run it").click();
        await expect(button("Play replay")).toBeVisible({ timeout: 60000 });
        await expect(page.getByTestId("lab-clock")).toHaveText("0.75s");
        await page.waitForTimeout(300);
        return {
          initial,
          tag: await shot("02-normal-075"),
          insight: await insight(),
        };
      },
    );
    await check(
      "normal and default porcelain at active clocks retain readable controls",
      async () => {
        await seek(2.05);
        const normal = await shot("03-normal-205"),
          normalBounds = await insight();
        await button("X-ray").click();
        await page
          .getByRole("combobox", { name: "X-ray layer", exact: true })
          .selectOption("windows");
        await page.waitForTimeout(800);
        const windows = await shot("04-porcelain-205");
        await seek(0.75);
        await page
          .getByRole("combobox", { name: "X-ray layer", exact: true })
          .selectOption("responsibilities");
        await page.waitForTimeout(800);
        const tag = await shot("05-porcelain-075");
        await button("X-ray").click();
        for (const name of [
          "Build our answer",
          "Run again",
          "Break my defense",
          "Save / teach",
        ]) {
          await expect(button(name)).toBeVisible();
          await expect(button(name)).toBeEnabled();
        }
        await button("Build our answer").click();
        await page
          .getByRole("combobox", { name: "Coach a defender", exact: true })
          .selectOption("D3");
        await expect(page.getByRole("complementary")).toBeVisible();
        const selected = await shot("06-selected-D3");
        await button("Close inspector").click();
        return {
          normal,
          normalBounds,
          windows,
          tag,
          selected,
          qualification:
            "Body/right-corner overlap is reviewed from screenshots; UI geometry and actual clicks are recorded, not fabricated pixel assertions.",
        };
      },
    );
    await check(
      "default deep-to-shallow tag creates a measured basketball tradeoff",
      async () => {
        await seek(0.75);
        await button("Build our answer").click();
        await page
          .getByRole("combobox", { name: "Coach a defender", exact: true })
          .selectOption("D3");
        await expect(
          page.getByRole("combobox", { name: "Apply rule", exact: true }),
        ).toHaveValue("moment");
        await button("Shallower tag").click();
        await button("Run this change").click();
        await expect(button("Play replay")).toBeVisible({ timeout: 60000 });
        await expect(page.getByTestId("lab-clock")).toHaveText("1.40s");
        await button("Save / teach").click();
        await page
          .getByRole("textbox", { name: "Answer name", exact: true })
          .fill("QA final consequential shallow tag");
        await button("Save answer").click();
        const revised: LabConfig = await page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem("courtiq.defense-lab.answers.v1")!,
            ).answers.find(
              (a: { name: string }) =>
                a.name === "QA final consequential shallow tag",
            ).config,
        );
        const before = simulate(createDefaultConfig()),
          after = simulate(revised),
          comparison = compare(before, after);
        expect(after.frames.filter((f) => f.t < 0.75 - 1e-7)).toEqual(
          before.frames.filter((f) => f.t < 0.75 - 1e-7),
        );
        expect(comparison.tradeoffs.some((w) => w.delta > 0.01)).toBe(true);
        expect(comparison.tradeoffs.some((w) => w.delta < -0.01)).toBe(true);
        expect(before.decisions[0]?.selected).toBe("lift");
        expect(after.decisions[0]?.selected).toBe("roll");
        expect(comparison.tradeoffs.find((w) => w.id === "lift")).toMatchObject(
          { before: 0.1, after: 0 },
        );
        expect(comparison.tradeoffs.find((w) => w.id === "roll")).toMatchObject(
          { before: 0, after: 0.15 },
        );
        if ((await button("Compare").getAttribute("aria-pressed")) !== "true")
          await button("Compare").click();
        const ribbon = page.getByTestId("lab-comparison");
        await expect(ribbon).toContainText(
          "Same opponent, seed and movement assumptions",
        );
        for (const w of comparison.tradeoffs
          .filter((w) => w.before > 0.01 || w.after > 0.01)
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
          .slice(0, 3))
          await expect(ribbon).toContainText(
            w.before.toFixed(2) + " → " + w.after.toFixed(2) + "s",
          );
        await seek(2.05);
        const frame205 = await shot("07-consequential-compare-205");
        await seek(2.1);
        const frame210 = await shot("08-consequential-compare-210");
        await button("Close comparison").click();
        return {
          revised,
          comparison: comparison.tradeoffs,
          beforeRead: before.decisions[0],
          afterRead: after.decisions[0],
          explanation: comparison.explanation,
          frame205,
          frame210,
        };
      },
    );
    await check(
      "390 mobile floor fits and dialog keyboard remains usable",
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await seek(0.75);
        const width = await page.evaluate(
          () => document.documentElement.scrollWidth,
        );
        expect(width).toBeLessThanOrEqual(390);
        await button("Model & assumptions").click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        return { width, screenshot: await shot("09-mobile-075") };
      },
    );
    await check(
      "focused final runtime has no errors or failed requests",
      async () => {
        expect(errors).toEqual([]);
        expect(failures).toEqual([]);
        return { errors, failures };
      },
    );
  } catch (error) {
    console.error("Focused final smoke stopped: " + String(error));
  } finally {
    const buildId = (await readFile("apps/web/.next/BUILD_ID", "utf8")).trim();
    await writeFile(
      path.join(out, "report.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          baseUrl: base,
          production: true,
          buildId,
          scope:
            "UI-only insight-card placement + consequential default deep-to-shallow tag tradeoff; full12+3 previous production results retained separately.",
          environment:
            "Anonymous Chromium SwiftShader,1280x800/390x844,DPR.75; no physical-hardware claim.",
          passed: steps.length === 5 && steps.every((s) => s.passed),
          steps,
          errors,
          failures,
        },
        null,
        2,
      ),
    );
    await browser.close();
    if (steps.length !== 5 || steps.some((s) => !s.passed))
      process.exitCode = 1;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
