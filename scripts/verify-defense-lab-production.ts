import { chromium, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { frameAt, simulate } from "../apps/web/lib/defense-lab/simulation";
import { compare, isThreatOpen } from "../apps/web/lib/defense-lab/analytics";
import {
  findAttackWitness,
  type AttackReport,
} from "../apps/web/lib/defense-lab/attackCore";
import { createDefaultConfig } from "../apps/web/lib/defense-lab/scenario";
import { DEFAULT_OPPONENT } from "../apps/web/lib/defense-lab/offensivePolicy";
import {
  createAnswer,
  exportAnswers,
} from "../apps/web/lib/defense-lab/answers";
import type { LabConfig } from "../apps/web/lib/defense-lab/types";

// Run only after next build + next start: the parent coordinates server replacement.
// Observe genuine browser Worker messages, then independently verify executable reads.
const url = process.env.BASE_URL ?? "http://localhost:3000";
const out = path.resolve("docs/defense-lab/qa-production"),
  storageKey = "courtiq.defense-lab.answers.v1";
const steps: {
  name: string;
  passed: boolean;
  evidence?: unknown;
  error?: string;
}[] = [];
const errors: { source: string; message: string }[] = [],
  warnings: string[] = [],
  failedRequests: unknown[] = [];
let page: Page;
const button = (name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });
async function shot(name: string) {
  const file = path.join(out, name + ".png");
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const evidence = await fn();
    steps.push({ name, passed: true, evidence });
    console.log("PASS " + name);
  } catch (error) {
    steps.push({ name, passed: false, error: String(error) });
    console.error("FAIL " + name + ": " + String(error));
    await shot("failure-" + steps.length).catch(() => undefined);
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
async function chooseD3() {
  await button("Build our answer").click();
  await page
    .getByRole("combobox", { name: "Coach a defender", exact: true })
    .selectOption("D3");
}
async function closeInspector() {
  if (await button("Close inspector").count())
    await button("Close inspector").click();
}
async function save(name: string): Promise<LabConfig> {
  await closeInspector();
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
    { k: storageKey, n: name },
  );
}
async function reports(): Promise<AttackReport[]> {
  return page.evaluate(
    () => (window as unknown as { qaReports: AttackReport[] }).qaReports,
  );
}
async function attack() {
  await page
    .locator('[aria-label="Experiment loop"]')
    .getByRole("button", { name: /^(Break my defense|Stress it again)$/ })
    .click();
  await expect(page.locator("main")).toHaveAttribute(
    "data-attack-state",
    "complete",
    { timeout: 90000 },
  );
  return (await reports()).at(-1)!;
}
function executableEvidence(report: AttackReport) {
  const result = simulate(report.selected.config),
    witness = report.selected.witness;
  expect(findAttackWitness(result)).toEqual(witness);
  if (!witness) return { witness: null };
  const frame = frameAt(result, witness.at),
    option = frame.options.find((o) => o.id === witness.threatId)!;
  expect(isThreatOpen(option, frame, result.config.assumptions)).toBe(true);
  expect(witness.at + 1e-8).toBeGreaterThanOrEqual(option.readAvailableAt ?? 0);
  const actualRead = result.decisions.find(
    (d) =>
      Math.abs(d.t - witness.at) < 1e-8 &&
      d.candidates.some((c) => c.threatId === witness.threatId && c.available),
  );
  const prior = [...result.decisions]
    .reverse()
    .find((d) => d.t <= witness.at + 1e-8);
  const continuingDrive =
    witness.threatId === "drive" &&
    prior?.selected === "drive" &&
    prior.actorId === frame.ball.owner;
  expect(Boolean(actualRead) || continuingDrive).toBe(true);
  return { witness, actualRead: actualRead ?? null, continuingDrive };
}
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
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 0.75,
  });
  await context.addInitScript(() => {
    const WorkerClass = window.Worker;
    (
      window as unknown as { qaReports: unknown[]; qaWorkerUrls: string[] }
    ).qaReports = [];
    (window as unknown as { qaWorkerUrls: string[] }).qaWorkerUrls = [];
    window.Worker = class extends WorkerClass {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        (window as unknown as { qaWorkerUrls: string[] }).qaWorkerUrls.push(
          String(args[0]),
        );
        this.addEventListener("message", (event) => {
          if (event.data.report?.selected)
            (window as unknown as { qaReports: unknown[] }).qaReports.push(
              event.data.report,
            );
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
    failedRequests.push({ url: r.url(), message: r.failure()?.errorText }),
  );
  page.on("response", (r) => {
    if (r.status() >= 400)
      errors.push({ source: "http", message: r.status() + " " + r.url() });
  });
  let first: AttackReport, second: AttackReport, moved: LabConfig;
  try {
    await check("production anonymous world and exact Run freeze", async () => {
      const response = await page.goto(url + "/lab", {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      expect(response?.status()).toBe(200);
      await expect(
        page.locator(
          "[data-lab-renderer=webgl][data-athlete-type=skinned-glb]",
        ),
      ).toBeVisible({ timeout: 60000 });
      await expect(
        page.locator("[data-nextjs-dialog],.vite-error-overlay"),
      ).toHaveCount(0);
      await expect(button("Open Next.js Dev Tools")).toHaveCount(0);
      expect(
        (await context.cookies()).filter((c) =>
          /sb-.+-auth-token/.test(c.name),
        ),
      ).toEqual([]);
      await button("Run it").click();
      await expect(button("Play replay")).toBeVisible({ timeout: 60000 });
      await expect(page.getByTestId("lab-clock")).toHaveText("0.75s");
      return { screenshot: await shot("01-production-world") };
    });
    await check(
      "attack freezes at executable read rather than forecast interval start",
      async () => {
        first = await attack();
        const evidence = executableEvidence(first);
        expect(first.selected.witness).not.toBeNull();
        const witness = first.selected.witness!;
        await expect(page.getByTestId("lab-clock")).toHaveText(
          witness.at.toFixed(2) + "s",
        );
        await expect(page.getByTestId("attack-evidence")).toContainText(
          witness.arrivalSeconds.toFixed(2) + "s",
        );
        await writeFile(
          path.join(out, "attack.json.gz"),
          gzipSync(JSON.stringify(first)),
        );
        return {
          ...evidence,
          changes: first.selected.changes,
          budget: first.budget,
          screenshot: await shot("02-executable-witness"),
        };
      },
    );
    await check(
      "D3 movement retest pairs previous opponent and comparison restores old defense",
      async () => {
        await button("Close attack evidence").click();
        await chooseD3();
        await seek(0.75);
        await page.getByText("Show him where to go", { exact: true }).click();
        await button("Toward rim").focus();
        await page.keyboard.press("Enter");
        await button("Run this change").click();
        await expect(button("Play replay")).toBeVisible({ timeout: 60000 });
        await expect(page.getByTestId("lab-clock")).toHaveText("1.40s");
        moved = await save("QA production moved answer");
        expect(
          moved.interventions.some(
            (i) => i.kind === "move" && i.playerId === "D3",
          ),
        ).toBe(true);
        second = await attack();
        expect(second.pairedRetest).not.toBeNull();
        expect(second.pairedRetest!.sameExperiment).toBe(true);
        expect(second.pairedRetest!.current.opponent).toEqual(
          first.selected.opponent,
        );
        executableEvidence(second);
        expect(second.pairedRetest!.current.witness).toEqual(
          findAttackWitness(simulate(second.pairedRetest!.current.config)),
        );
        const oldDefense: LabConfig = {
          ...second.selected.config,
          answer: first.selected.config.answer,
          interventions: [
            ...second.selected.config.interventions.filter(
              (i) =>
                i.kind !== "answer" &&
                !(i.kind === "move" && i.playerId.startsWith("D")),
            ),
            ...first.selected.config.interventions.filter(
              (i) =>
                i.kind === "answer" ||
                (i.kind === "move" && i.playerId.startsWith("D")),
            ),
          ].sort((a, b) => a.at - b.at),
        };
        const oldRun = simulate(oldDefense),
          newRun = simulate(second.selected.config);
        expect(newRun.frames.filter((f) => f.t < 0.75 - 1e-7)).toEqual(
          oldRun.frames.filter((f) => f.t < 0.75 - 1e-7),
        );
        expect(
          newRun.frames.some((f, i) => {
            const a = f.players.find((p) => p.id === "D3")!,
              b = oldRun.frames[i].players.find((p) => p.id === "D3")!;
            return Math.hypot(a.x - b.x, a.z - b.z) > 0.05;
          }),
        ).toBe(true);
        if ((await button("Compare").getAttribute("aria-pressed")) !== "true")
          await button("Compare").click();
        const comparison = compare(oldRun, newRun),
          ribbon = page.getByTestId("lab-comparison");
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
        await writeFile(
          path.join(out, "paired-attack.json.gz"),
          gzipSync(JSON.stringify(second)),
        );
        return {
          sameExperiment: second.pairedRetest!.sameExperiment,
          previousOpponent: first.selected.opponent,
          currentOpponent: second.pairedRetest!.current.opponent,
          previousWitness: second.pairedRetest!.previous.witness,
          currentWitness: second.pairedRetest!.current.witness,
          comparison: comparison.tradeoffs,
          screenshot: await shot("03-movement-paired-comparison"),
        };
      },
    );
    await check(
      "Teach Why shows saved revision without earlier attack evidence",
      async () => {
        if (await button("Close attack evidence").count())
          await button("Close attack evidence").click();
        await button("Teach").click();
        await expect(page.locator("main")).toHaveAttribute(
          "data-mode",
          "teach",
        );
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "QA production moved answer",
        );
        await button("Model & assumptions").click();
        const dialog = page.getByRole("dialog");
        await expect(
          dialog.getByRole("heading", {
            name: "Attack search evidence",
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(dialog).not.toContainText(
          "Bounded deterministic high-P&R search:",
        );
        const text = await dialog.innerText();
        await button("Close dialog").click();
        const screenshot = await shot("04-teach-isolated-evidence");
        await button("Return to Lab").click();
        return { text, savedConfig: moved, screenshot };
      },
    );
    await check(
      "Switch rejects tag template and suppresses D3 tag controls",
      async () => {
        await closeInspector();
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
        await expect(page.getByRole("complementary")).toContainText(
          /Switch|another coverage/,
        );
        const config = await save("QA production switch blocked");
        expect(config.answer.coverage).toBe("switch");
        return {
          config,
          screenshot: await shot("05-switch-template-rejected"),
        };
      },
    );
    await check(
      "legacy authored configuration requires explicit adaptive enable",
      async () => {
        const legacy = createDefaultConfig();
        delete legacy.opponent;
        const file = path.join(out, "legacy-answer.json");
        await writeFile(
          file,
          exportAnswers([
            createAnswer({
              name: "QA legacy authored opponent",
              config: legacy,
            }),
          ]),
        );
        await button(/^Our system/).click();
        await page.locator("input[type=file]").setInputFiles(file);
        await page
          .getByTestId("saved-answer")
          .filter({ hasText: "QA legacy authored opponent" })
          .getByRole("button", { name: "Open", exact: true })
          .click();
        await expect(button(/^Authored opponent/)).toBeVisible();
        const beforeCount = (await reports()).length;
        await page
          .locator('[aria-label="Experiment loop"]')
          .getByRole("button", { name: "Break my defense", exact: true })
          .click();
        await expect(button("Enable adaptive opponent")).toBeVisible();
        expect((await reports()).length).toBe(beforeCount);
        await expect(page.locator("main")).toHaveAttribute(
          "data-attack-state",
          "idle",
        );
        const before = await save("QA legacy before enable");
        expect(before.opponent).toBeUndefined();
        await button(/^Authored opponent/).click();
        await button("Enable adaptive opponent").click();
        await expect(button(/^Live opponent/)).toBeVisible();
        const after = await save("QA legacy explicitly adaptive");
        expect(after.opponent).toEqual(DEFAULT_OPPONENT);
        const { opponent, ...rest } = after;
        expect(rest).toEqual(before);
        const report = await attack();
        expect((await reports()).length).toBe(beforeCount + 1);
        expect(report.baseline.config.opponent).toEqual(DEFAULT_OPPONENT);
        const evidence = executableEvidence(report);
        await writeFile(
          path.join(out, "explicit-adaptive-attack.json.gz"),
          gzipSync(JSON.stringify(report)),
        );
        return {
          before,
          after,
          ...evidence,
          screenshot: await shot("06-explicit-adaptive"),
        };
      },
    );
    await check(
      "production runtime has no errors or failed requests",
      async () => {
        expect(errors).toEqual([]);
        expect(failedRequests).toEqual([]);
        return {
          errors,
          warnings,
          failedRequests,
          workerUrls: await page.evaluate(
            () =>
              (window as unknown as { qaWorkerUrls: string[] }).qaWorkerUrls,
          ),
        };
      },
    );
  } catch (error) {
    console.error(
      "Production focused run stopped after failed prerequisite:",
      String(error),
    );
  } finally {
    await writeFile(
      path.join(out, "report.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          baseUrl: url,
          production: true,
          browser:
            "Anonymous Chromium SwiftShader at DPR .75, production next start; public Worker message observation and engine coherence checks.",
          passed: steps.length === 7 && steps.every((s) => s.passed),
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
    if (steps.length !== 7 || steps.some((s) => !s.passed))
      process.exitCode = 1;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
