import { chromium, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { frameAt, simulate } from "../apps/web/lib/defense-lab/simulation";
import { compare, isThreatOpen } from "../apps/web/lib/defense-lab/analytics";
import {
  findAttackWitness,
  type AttackReport,
} from "../apps/web/lib/defense-lab/attackCore";
import type { LabConfig } from "../apps/web/lib/defense-lab/types";

// Anonymous browser evidence for the remodeled world-first loop. Worker messages
// are observed at their public browser boundary; no application test hooks are used.
const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const outDir = path.resolve(
  process.env.QA_OUT_DIR ?? "docs/defense-lab/qa-raised",
);
const steps: {
  name: string;
  passed: boolean;
  evidence?: unknown;
  error?: string;
}[] = [];
const errors: { source: string; message: string }[] = [],
  warnings: string[] = [];
const failedRequests: { url: string; message: string }[] = [];
const key = "courtiq.defense-lab.answers.v1";
let page: Page;
async function check(name: string, action: () => Promise<unknown>) {
  try {
    const evidence = await action();
    steps.push({ name, passed: true, evidence });
    console.log("PASS " + name);
  } catch (error) {
    steps.push({ name, passed: false, error: String(error) });
    console.error("FAIL " + name + ": " + String(error));
    await shot("failure-" + steps.length).catch(() => undefined);
  }
}
async function shot(name: string) {
  const file = path.join(outDir, name + ".png");
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
const button = (name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });
async function seek(t: number) {
  const value = (Math.round(t / 0.025) * 0.025).toFixed(3);
  await page
    .getByRole("slider", { name: "Replay time", exact: true })
    .evaluate((node, value) => {
      const input = node as HTMLInputElement;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  await expect(page.getByTestId("lab-clock")).toHaveText(
    Number(value).toFixed(2) + "s",
  );
}
async function choose(id = "D3") {
  await button("Build our answer").click();
  await page
    .getByRole("combobox", { name: "Coach a defender", exact: true })
    .selectOption(id);
}
async function closeInspector() {
  if (await button("Close inspector").count())
    await button("Close inspector").click();
}
async function save(name: string) {
  await closeInspector();
  await button("Save / teach").click();
  await page
    .getByRole("textbox", { name: "Answer name", exact: true })
    .fill(name);
  await page
    .getByRole("textbox", {
      name: "What does your team call the low man?",
      exact: true,
    })
    .fill("Anchor");
  await button("Save answer").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return page.evaluate(
    ({ k, n }) =>
      JSON.parse(localStorage.getItem(k)!).answers.find(
        (a: { name: string }) => a.name === n,
      ),
    { k: key, n: name },
  );
}
async function workerReports(): Promise<AttackReport[]> {
  return page.evaluate(
    () =>
      (window as unknown as { qaAttackReports: AttackReport[] })
        .qaAttackReports,
  );
}
async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 0.75,
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    const NativeWorker = window.Worker;
    (window as unknown as { qaAttackReports: unknown[] }).qaAttackReports = [];
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.addEventListener("message", (event) => {
          if (event.data.report?.selected)
            (
              window as unknown as { qaAttackReports: unknown[] }
            ).qaAttackReports.push(event.data.report);
        });
      }
    };
  });
  page = await context.newPage();
  page.on("pageerror", (e) =>
    errors.push({ source: "pageerror", message: e.message }),
  );
  page.on("console", (m) => {
    if (m.type() === "error")
      errors.push({ source: "console", message: m.text() });
    if (m.type() === "warning") warnings.push(m.text());
  });
  page.on("requestfailed", (r) =>
    failedRequests.push({
      url: r.url(),
      message: r.failure()?.errorText ?? "unknown",
    }),
  );
  page.on("response", (r) => {
    if (r.status() >= 400)
      errors.push({ source: "http", message: r.status() + " " + r.url() });
  });
  let shallow: LabConfig | undefined,
    moved: LabConfig | undefined,
    firstAttack: AttackReport | undefined,
    secondAttack: AttackReport | undefined;
  try {
    await check("anonymous world-first first value", async () => {
      const start = performance.now();
      const response = await page.goto(baseUrl + "/lab", {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      expect(response?.status()).toBe(200);
      await expect(button("Run it")).toBeVisible({ timeout: 60000 });
      await expect(page.locator("canvas").first()).toBeVisible({
        timeout: 60000,
      });
      await expect(
        page.getByRole("heading", { name: "High P&R. Tag. Lift. Skip." }),
      ).toBeVisible();
      expect(
        (await context.cookies()).filter((c) =>
          /sb-.+-auth-token/.test(c.name),
        ),
      ).toEqual([]);
      await expect(
        page.locator("[data-nextjs-dialog],.vite-error-overlay"),
      ).toHaveCount(0);
      await expect(
        page.locator(
          "[data-lab-renderer=webgl][data-athlete-type=skinned-glb]",
        ),
      ).toBeVisible({ timeout: 60000 });
      await page.waitForTimeout(500);
      return {
        readyMs: Math.round(performance.now() - start),
        screenshot: await shot("01-full-world"),
      };
    });
    await check("Run freezes at exact 0.75 seconds", async () => {
      await button("Run it").click();
      await expect(button("Pause replay")).toBeVisible();
      await expect(button("Play replay")).toBeVisible({ timeout: 180000 });
      await expect(page.getByTestId("lab-clock")).toHaveText("0.75s");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("lab-clock")).toHaveText("0.75s");
      return {
        clock: await page.getByTestId("lab-clock").innerText(),
        screenshot: await shot("02-run-freeze"),
      };
    });
    await check(
      "direct D3 shallower coaching creates a timed rule",
      async () => {
        await choose();
        await expect(
          page.getByRole("complementary", { name: "Selected player" }),
        ).toContainText("D3");
        await button("Shallower tag").click();
        await expect(page.locator("main")).toHaveAttribute(
          "data-interventions",
          "1",
        );
        const record = await save("QA shallow 0.75");
        shallow = record.config;
        expect(shallow!.interventions).toHaveLength(1);
        expect(shallow!.interventions[0]).toMatchObject({
          kind: "answer",
          at: 0.75,
          patch: { tag: true, tagDepth: 0.25 },
        });
        const before = simulate({ ...shallow!, interventions: [] }),
          after = simulate(shallow!);
        expect(after.frames.filter((f) => f.t < 0.75 - 1e-7)).toEqual(
          before.frames.filter((f) => f.t < 0.75 - 1e-7),
        );
        await choose();
        return {
          screenshot: await shot("03-selected-shallow"),
          config: shallow,
        };
      },
    );
    await check("Run this change freezes at exact 1.40 seconds", async () => {
      await button("Run this change").click();
      await expect(button("Play replay")).toBeVisible({ timeout: 180000 });
      await expect(page.getByTestId("lab-clock")).toHaveText("1.40s");
      return { screenshot: await shot("04-rerun-freeze") };
    });
    await check(
      "comparison uses same geometry and engine windows",
      async () => {
        if ((await button("Compare").getAttribute("aria-pressed")) !== "true")
          await button("Compare").click();
        const ribbon = page.getByTestId("lab-comparison");
        await expect(ribbon).toContainText(
          "Same opponent, seed and movement assumptions",
        );
        const expected = compare(
          simulate({ ...shallow!, interventions: [] }),
          simulate(shallow!),
        );
        for (const id of expected.tradeoffs
          .filter((t) => t.before > 0.01 || t.after > 0.01)
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
          .slice(0, 3)
          .map((t) => t.id)) {
          const trade = expected.tradeoffs.find((t) => t.id === id)!;
          await expect(ribbon).toContainText(
            trade.before.toFixed(2) + " → " + trade.after.toFixed(2) + "s",
          );
        }
        return {
          text: await ribbon.innerText(),
          tradeoffs: expected.tradeoffs,
          screenshot: await shot("05-same-geometry-comparison"),
        };
      },
    );
    await check(
      "Break My Defense executes worker and freezes witnessed predicate",
      async () => {
        await button("Break my defense").click();
        await expect(page.locator("main")).toHaveAttribute(
          "data-attack-state",
          "complete",
          { timeout: 90000 },
        );
        firstAttack = (await workerReports()).at(-1);
        expect(firstAttack).toBeDefined();
        await writeFile(
          path.join(outDir, "first-attack.json.gz"),
          gzipSync(JSON.stringify(firstAttack)),
        );
        const witness = firstAttack!.selected.witness;
        expect(witness).not.toBeNull();
        expect(
          findAttackWitness(simulate(firstAttack!.selected.config)),
        ).toEqual(witness);
        const f = frameAt(simulate(firstAttack!.selected.config), witness!.at),
          option = f.options.find((o) => o.id === witness!.threatId)!;
        expect(isThreatOpen(option, f, firstAttack!.assumptions)).toBe(true);
        await expect(page.getByTestId("lab-clock")).toHaveText(
          witness!.at.toFixed(2) + "s",
        );
        await expect(page.getByTestId("attack-evidence")).toContainText(
          witness!.limitingDefenderId + " arrives",
        );
        await expect(page.getByTestId("attack-evidence")).toContainText(
          witness!.arrivalSeconds.toFixed(2) + "s",
        );
        const evidence = {
          selectedChanges: firstAttack!.selected.changes,
          witness,
          budget: firstAttack!.budget,
          screenshot: await shot("06-break-witness"),
        };
        await writeFile(
          path.join(outDir, "first-attack.json.gz"),
          gzipSync(JSON.stringify(firstAttack)),
        );
        return evidence;
      },
    );
    await check(
      "change and stress again pairs the actual previous opponent",
      async () => {
        await button("Coach this defender").click();
        await closeInspector();
        await choose("D3");
        await button("Stay").click();
        await button("Run this change").click();
        await expect(button("Play replay")).toBeVisible({ timeout: 180000 });
        await button("Stress it again").click();
        await expect(page.locator("main")).toHaveAttribute(
          "data-attack-state",
          "complete",
          { timeout: 90000 },
        );
        secondAttack = (await workerReports()).at(-1);
        expect(secondAttack!.pairedRetest).not.toBeNull();
        expect(secondAttack!.pairedRetest!.current.opponent).toEqual(
          firstAttack!.selected.opponent,
        );
        expect(secondAttack!.pairedRetest!.sameExperiment).toBe(true);
        expect(secondAttack!.pairedRetest!.current.witness).toEqual(
          findAttackWitness(
            simulate(secondAttack!.pairedRetest!.current.config),
          ),
        );
        await expect(page.getByTestId("attack-evidence")).toContainText(
          "Previous attack, tested again",
        );
        await writeFile(
          path.join(outDir, "second-attack.json.gz"),
          gzipSync(JSON.stringify(secondAttack)),
        );
        return {
          paired: {
            ...secondAttack!.pairedRetest!,
            current: {
              id: secondAttack!.pairedRetest!.current.id,
              opponent: secondAttack!.pairedRetest!.current.opponent,
              config: secondAttack!.pairedRetest!.current.config,
              witness: secondAttack!.pairedRetest!.current.witness,
            },
          },
          screenshot: await shot("07-paired-retest"),
        };
      },
    );
    await check(
      "keyboard nudge preserves prefix and moves without teleport",
      async () => {
        await button("Close attack evidence").click();
        await choose("D3");
        await seek(1.4);
        const beforeRecord = await save("QA before nudge"),
          before = simulate(beforeRecord.config);
        await choose("D3");
        await page.getByText("Show him where to go", { exact: true }).click();
        await page
          .getByRole("combobox", { name: "Movement release", exact: true })
          .selectOption("ball-leaves");
        await button("Toward rim").focus();
        await page.keyboard.press("Enter");
        const record = await save("QA moved exact answer");
        moved = record.config;
        const move = moved!.interventions.findLast((i) => i.kind === "move");
        expect(move).toMatchObject({
          kind: "move",
          playerId: "D3",
          untilTrigger: "ball-leaves",
        });
        expect(move!.at).toBeCloseTo(1.4, 8);
        const after = simulate(moved!);
        expect(after.frames.filter((f) => f.t < 1.4 - 1e-7)).toEqual(
          before.frames.filter((f) => f.t < 1.4 - 1e-7),
        );
        const at = frameAt(after, 1.4).players.find((p) => p.id === "D3")!,
          prior = frameAt(before, 1.4).players.find((p) => p.id === "D3")!;
        expect(Math.hypot(at.x - prior.x, at.z - prior.z)).toBeLessThan(0.02);
        await choose("D3");
        return {
          cue: move,
          prefixFrames: after.frames.filter((f) => f.t < 1.4 - 1e-7).length,
          instantDisplacement: Math.hypot(at.x - prior.x, at.z - prior.z),
          screenshot: await shot("08-movement-cue"),
        };
      },
    );
    await check("reload restores complete saved config", async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(
        page.locator(
          "[data-lab-renderer=webgl][data-athlete-type=skinned-glb]",
        ),
      ).toBeVisible({ timeout: 60000 });
      await expect(button(/^Our system/)).toBeVisible({ timeout: 60000 });
      await button(/^Our system/).click();
      const record = page
        .getByTestId("saved-answer")
        .filter({ hasText: "QA moved exact answer" });
      await record.getByRole("button", { name: "Open", exact: true }).click();
      const reopened = await save("QA reopened full config");
      expect(reopened.config).toEqual(moved);
      return { screenshot: await shot("09-reloaded-exact-answer") };
    });
    await check(
      "Teach uses saved revision and primary then conditional jobs",
      async () => {
        await seek(1.4);
        await choose("D3");
        await button("Deep").click();
        await closeInspector();
        await button("Teach").click();
        await expect(page.locator("main")).toHaveAttribute(
          "data-mode",
          "teach",
        );
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "QA reopened full config",
        );
        await expect(button(/D3.*Anchor/)).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await button(/D3.*Anchor/).click();
        await seek(0.75);
        const frame = frameAt(simulate(moved!), 0.75);
        const primary = frame.responsibilities
          .filter((r) => r.defenderId === "D3")
          .sort((a, b) => b.priority - a.priority)[0];
        const labels: Record<string, string> = {
          drive: "Contain the ball",
          roll: "Protect the roller",
          pop: "Close the pop",
          corner: "Take the weak corner",
          lift: "Take the lift",
          strong: "Stay with the strong corner",
        };
        const job =
          primary?.kind === "split"
            ? "Split the lift and corner"
            : primary
              ? (labels[primary.threatId] ?? primary.kind)
              : "Stay connected to your assignment";
        await expect(
          page.getByRole("complementary").getByRole("heading", { level: 2 }),
        ).toHaveText(job);
        await button("Read checkpoint").click();
        await button("Chase the ball wherever it goes").click();
        await expect(page.getByRole("complementary")).toContainText(
          "Follow the responsibility line",
        );
        const screenshot = await shot("10-teach-primary-job");
        await button("Return to Lab").click();
        await seek(1.4);
        await expect(
          page.getByRole("button", { name: /Drop · Deep tag/ }),
        ).toBeVisible();
        return { primary, job, screenshot, draftRestored: true };
      },
    );
    await check(
      "supported coaching preview is explicit; arbitrary text remains disabled",
      async () => {
        await closeInspector();
        await button("Build our answer").click();
        await page.getByText("Coach it in your words", { exact: true }).click();
        const preview = page.getByRole("complementary");
        await expect(preview).toContainText("D3 tags until D5");
        await expect(preview).toContainText("D4 stays with the lift");
        await page
          .getByRole("textbox", { name: "Coaching cue", exact: true })
          .fill("Make everybody perfect and never give up a shot.");
        await expect(button("Apply coaching cue")).toBeDisabled();
        await expect(preview).toContainText("No rule was created");
        await page
          .getByRole("combobox", { name: "Coaching template", exact: true })
          .selectOption("Tag shallow and X-out on the pass.");
        await expect(preview).toContainText(
          "D4 takes the corner and D3 takes the lift",
        );
        await expect(button("Apply coaching cue")).toBeEnabled();
        return { screenshot: await shot("11-supported-coaching") };
      },
    );
    await check(
      "mobile controls fit and modal keyboard Escape works",
      async () => {
        await closeInspector();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(400);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(391);
        await expect(button("Build our answer")).toBeVisible();
        await button("Save / teach").click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Tab");
        const focus = await page.evaluate(() => {
          const e = document.activeElement as HTMLElement;
          const r = e.getBoundingClientRect();
          return { tag: e.tagName, left: r.left, right: r.right };
        });
        expect(focus.tag).not.toBe("BODY");
        expect(focus.right).toBeLessThanOrEqual(391);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        const screenshot = await shot("12-mobile");
        await page.setViewportSize({ width: 1440, height: 1000 });
        return { focus, screenshot };
      },
    );
    await check(
      "invalid import produces feedback and preserves answer collection",
      async () => {
        await button(/^Our system/).click();
        const before = await page.getByTestId("saved-answer").count();
        await page.locator("input[type=file]").setInputFiles({
          name: "invalid.json",
          mimeType: "application/json",
          buffer: Buffer.from('{"bogus":true}'),
        });
        await expect(
          page.getByRole("status").filter({
            hasText: /could not|not a|invalid|unsupported|not supported/i,
          }),
        ).toBeVisible();
        expect(await page.getByTestId("saved-answer").count()).toBe(before);
        const text = await page.getByRole("status").allTextContents();
        await button("Close dialog").click();
        return { text, before };
      },
    );
    await check(
      "storage failure preserves in-memory answer and offers export",
      async () => {
        await page.evaluate(() => {
          Storage.prototype.setItem = function () {
            throw new DOMException("QA storage denied", "QuotaExceededError");
          };
        });
        await button("Save / teach").click();
        await page
          .getByRole("textbox", { name: "Answer name", exact: true })
          .fill("QA memory only");
        await button("Save answer").click();
        await expect(
          page.getByRole("status").filter({ hasText: "Kept in memory" }),
        ).toBeVisible();
        await button(/^Our system/).click();
        await expect(
          page
            .getByTestId("saved-answer")
            .filter({ hasText: "QA memory only" }),
        ).toBeVisible();
        const download = page.waitForEvent("download");
        await button("Export answers").click();
        const file = await download;
        await file.saveAs(path.join(outDir, "answers-export.json"));
        await button("Close dialog").click();
        return {
          download: file.suggestedFilename(),
          screenshot: await shot("13-storage-fallback"),
        };
      },
    );
    await check("no browser runtime errors", async () => {
      expect(errors).toEqual([]);
      return { errors, warnings, failedRequests };
    });
  } finally {
    await shot("final-state").catch(() => undefined);
    await writeFile(
      path.join(outDir, "report.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          baseUrl,
          browser:
            "Chromium SwiftShader; real anonymous browser UI and observed worker reports. Engine recalculation checks coherence, not visual realism or physical hardware speed.",
          passed: steps.every((s) => s.passed),
          steps,
          errors,
          warnings,
          failedRequests,
        },
        null,
        2,
      ),
    );
    await browser.close();
    if (steps.some((s) => !s.passed)) process.exitCode = 1;
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
