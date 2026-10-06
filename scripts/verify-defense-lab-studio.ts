import { chromium, expect, type Page, type Locator } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import {
  createAnswer,
  exportAnswers,
} from "../apps/web/lib/defense-lab/answers";
import { frameAt, simulate } from "../apps/web/lib/defense-lab/simulation";
import { compare, isThreatOpen } from "../apps/web/lib/defense-lab/analytics";
import {
  findAttackWitness,
  previewAttackCandidate,
  type AttackReport,
  type AttackPreview,
} from "../apps/web/lib/defense-lab/attackCore";
import type { LabConfig } from "../apps/web/lib/defense-lab/types";

// One browser/GPU; parent coordinates launch. Observe native Worker messages and
// actual UI pointer/keyboard actions. No application state mutation test hooks.
const resume = process.env.QA_RESUME === "1";
const expectedChecks = resume ? 8 : 12;
const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = path.resolve("docs/defense-lab/qa-studio");
const storageKey = "courtiq.defense-lab.answers.v1";
const steps: {
  name: string;
  passed: boolean;
  evidence?: unknown;
  error?: string;
}[] = [];
const errors: string[] = [],
  warnings: string[] = [],
  failedRequests: unknown[] = [],
  serviceRequests: string[] = [];
let page: Page;
const button = (name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });
async function shot(name: string) {
  const file = path.join(out, name + ".png");
  await page.screenshot({ path: file, fullPage: true });
  console.log("SCREENSHOT " + file);
  return file;
}
async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const evidence = await fn();
    steps.push({ name, passed: true, evidence });
    console.log("PASS " + name);
  } catch (error) {
    steps.push({ name, passed: false, error: String(error) });
    await shot("failure-" + steps.length).catch(() => undefined);
    throw error;
  }
}
async function range(input: Locator, value: number) {
  await input.evaluate((node, value) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(node, String(value));
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
async function seek(t: number) {
  t = Number(t.toFixed(3));
  await range(
    page.getByRole("slider", { name: "Replay time", exact: true }),
    t,
  );
  await expect(page.getByTestId("lab-clock")).toHaveText(t.toFixed(2) + "s");
}
async function ready() {
  await expect(
    page.locator("[data-lab-renderer=webgl][data-athlete-type=skinned-glb]"),
  ).toBeVisible({ timeout: 60000 });
}
async function closeInspector() {
  if (await button("Close inspector").count())
    await button("Close inspector").click();
}
async function defender(id: string) {
  await closeInspector();
  await button("Build our answer").click();
  await page
    .getByRole("combobox", { name: "Coach a defender", exact: true })
    .selectOption(id);
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
async function previews(): Promise<AttackPreview[]> {
  return page.evaluate(
    () => (window as unknown as { qaPreviews: AttackPreview[] }).qaPreviews,
  );
}
async function performanceSnapshot() {
  return page.evaluate(() =>
    (
      window as unknown as { __courtIQLabPerformance?: { snapshot(): unknown } }
    ).__courtIQLabPerformance?.snapshot(),
  );
}
function witnessEvidence(report: AttackReport) {
  const run = simulate(report.selected.config),
    witness = report.selected.witness;
  expect(findAttackWitness(run)).toEqual(witness);
  if (!witness) return { witness: null };
  const frame = frameAt(run, witness.at),
    option = frame.options.find((o) => o.id === witness.threatId)!;
  expect(isThreatOpen(option, frame, run.config.assumptions)).toBe(true);
  expect(witness.at + 1e-8).toBeGreaterThanOrEqual(option.readAvailableAt ?? 0);
  const read = run.decisions.find(
    (d) =>
      Math.abs(d.t - witness.at) < 1e-8 &&
      d.candidates.some((c) => c.threatId === witness.threatId && c.available),
  );
  const previous = [...run.decisions]
    .reverse()
    .find((d) => d.t <= witness.at + 1e-8);
  const continuingDrive =
    witness.threatId === "drive" &&
    previous?.selected === "drive" &&
    previous.actorId === frame.ball.owner;
  expect(Boolean(read) || continuingDrive).toBe(true);
  return { witness, read: read ?? null, continuingDrive };
}
async function attack(capture: string, again = false): Promise<AttackReport> {
  const count = () =>
    page.evaluate(
      () => (window as unknown as { qaReports: unknown[] }).qaReports.length,
    );
  const oldCount = await count();
  if (again) await button("Break it again").click();
  else
    await page
      .locator('[aria-label="Experiment loop"]')
      .getByRole("button", { name: /^(Break my defense|Stress it again)$/ })
      .click();
  await expect(page.getByTestId("break-mode")).toHaveAttribute(
    "data-phase",
    "searching",
    { timeout: 10000 },
  );
  await shot(capture + "-searching");
  await expect.poll(count, { timeout: 120000 }).toBe(oldCount + 1);
  await expect(page.getByTestId("break-mode")).toHaveAttribute(
    "data-phase",
    "playing",
    { timeout: 15000 },
  );
  await shot(capture + "-playing");
  await expect(page.getByTestId("break-mode")).toHaveAttribute(
    "data-phase",
    "frozen",
    { timeout: 90000 },
  );
  const report = (await reports()).at(-1)!;
  const stop =
    report.selected.witness?.at ??
    report.selected.result.diagnostics.flightStops?.[0]?.at ??
    report.selected.result.events.find((e) => e.type === "missed-catch")?.t ??
    report.selected.config.assumptions.duration;
  await expect(page.getByTestId("lab-clock")).toHaveText(stop.toFixed(2) + "s");
  await shot(capture + "-frozen");
  await writeFile(
    path.join(out, capture + ".json.gz"),
    gzipSync(JSON.stringify(report)),
  );
  return report;
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
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 0.75,
  });
  await context.addInitScript(() => {
    const NativeWorker = window.Worker;
    const observed = window as unknown as {
      qaReports: unknown[];
      qaPreviews: unknown[];
      qaWorkerUrls: string[];
      qaWorkerInputs: unknown[];
      qaPhases: { phase: string; clock: string; at: number }[];
    };
    observed.qaReports = [];
    observed.qaPreviews = [];
    observed.qaWorkerUrls = [];
    observed.qaWorkerInputs = [];
    observed.qaPhases = [];
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        observed.qaWorkerUrls.push(String(args[0]));
        this.addEventListener("message", (event) => {
          if (event.data.report?.selected)
            observed.qaReports.push(event.data.report);
          if (event.data.candidate)
            observed.qaPreviews.push(event.data.candidate);
        });
      }
      postMessage(...args: Parameters<Worker["postMessage"]>) {
        observed.qaWorkerInputs.push(args[0]);
        super.postMessage(...args);
      }
    };
    document.addEventListener("DOMContentLoaded", () => {
      let previous = "";
      new MutationObserver(() => {
        const mode = document.querySelector('[data-testid="break-mode"]');
        const phase = mode?.getAttribute("data-phase") ?? "exited";
        if (phase !== previous) {
          observed.qaPhases.push({
            phase,
            clock:
              document.querySelector('[data-testid="lab-clock"]')
                ?.textContent ?? "",
            at: performance.now(),
          });
          previous = phase;
        }
      }).observe(document.documentElement, {
        subtree: true,
        attributes: true,
        childList: true,
      });
    });
  });
  // Public studio must remain self-contained. Block unneeded external/application
  // services while recording attempted dependence, rather than merely inspecting imports.
  await context.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (
      /^https?:$/.test(u.protocol) &&
      (u.origin !== new URL(base).origin ||
        /^\/(api|auth|login|film)(\/|$)/.test(u.pathname))
    ) {
      serviceRequests.push(u.href);
      await route.abort("blockedbyclient");
    } else await route.continue();
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
    if (m.type() === "warning") warnings.push(m.text());
  });
  page.on("requestfailed", (r) =>
    failedRequests.push({ url: r.url(), error: r.failure()?.errorText }),
  );
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(r.status() + " " + r.url());
  });
  let first: AttackReport,
    second: AttackReport,
    authored: LabConfig,
    moved: LabConfig;
  try {
    if (resume) {
      const previous = JSON.parse(
        await readFile(path.join(out, "report-found-blocker.json"), "utf8"),
      );
      const config = previous.steps.find((s: { name: string }) =>
        s.name.startsWith("custom roller"),
      ).evidence.authored as LabConfig;
      const fixture = path.join(out, "resume-coached-answer.json");
      await writeFile(
        fixture,
        exportAnswers([
          createAnswer({ name: "QA studio resume coached answer", config }),
        ]),
      );
      await page.goto(base + "/lab?debugLab=1&xrayLook=spectral", {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await ready();
      await shot("resume-latest-normal");
      await button(/^Our system/).click();
      await page.locator("input[type=file]").setInputFiles(fixture);
      await page
        .getByTestId("saved-answer")
        .filter({ hasText: "QA studio resume coached answer" })
        .getByRole("button", { name: "Open", exact: true })
        .click();
      await seek(0.75);
      await shot("resume-latest-normal-075");
      await page.evaluate(() => history.replaceState(null, "", "?debugLab=1"));
      await button("X-ray").click();
      await page
        .getByRole("combobox", { name: "X-ray layer", exact: true })
        .selectOption("responsibilities");
      await page.waitForTimeout(800);
      await shot("resume-latest-porcelain-075");
      await page.evaluate(() =>
        history.replaceState(null, "", "?debugLab=1&xrayLook=spectral"),
      );
      await page.waitForTimeout(800);
      await shot("resume-latest-spectral-075");
      await button("X-ray").click();
      await page.evaluate(() => history.replaceState(null, "", "?debugLab=1"));
      await seek(1.4);
      console.log(
        "RESUME Imported complete authored setup through real UI; earlier first-four checks are not recounted.",
      );
    }
    if (!resume) {
      await check(
        "anonymous local world and exact .75 Run checkpoint",
        async () => {
          const started = Date.now();
          const response = await page.goto(base + "/lab?debugLab=1", {
            waitUntil: "domcontentloaded",
            timeout: 90000,
          });
          expect(response?.status()).toBe(200);
          await ready();
          if (process.env.PRODUCTION === "1")
            await expect(button("Open Next.js Dev Tools")).toHaveCount(0);
          const readyMs = Date.now() - started;
          await shot("01-normal-initial");
          const clicked = Date.now();
          await button("Run it").click();
          await expect(button("Play replay")).toBeVisible({ timeout: 60000 });
          await expect(page.getByTestId("lab-clock")).toHaveText("0.75s");
          return {
            readyMs,
            runToFreezeMs: Date.now() - clicked,
            screenshot: await shot("02-normal-tag-checkpoint"),
            performance: await performanceSnapshot(),
          };
        },
      );
      await check(
        "porcelain and spectral active worlds preserve clock and layer",
        async () => {
          await button("X-ray").click();
          await page
            .getByRole("combobox", { name: "X-ray layer", exact: true })
            .selectOption("responsibilities");
          await page.waitForTimeout(900);
          const porcelain = await shot("03-porcelain-active-075");
          await seek(2.05);
          await page
            .getByRole("combobox", { name: "X-ray layer", exact: true })
            .selectOption("windows");
          await page.waitForTimeout(700);
          const flights = await shot("04-porcelain-windows-205");
          await page.evaluate(() =>
            history.replaceState(null, "", "?debugLab=1&xrayLook=spectral"),
          );
          await page.waitForTimeout(900);
          await expect(page.getByTestId("lab-clock")).toHaveText("2.05s");
          const spectral = await shot("05-spectral-windows-205");
          await seek(0.75);
          await page
            .getByRole("combobox", { name: "X-ray layer", exact: true })
            .selectOption("responsibilities");
          await page.waitForTimeout(700);
          const spectralTag = await shot("06-spectral-active-075");
          await button("X-ray").click();
          await page.evaluate(() =>
            history.replaceState(null, "", "?debugLab=1"),
          );
          await page.waitForTimeout(700);
          return {
            porcelain,
            flights,
            spectral,
            spectralTag,
            performance: await performanceSnapshot(),
            qualification:
              "Screenshots require independent visual review; clock/layer continuity is asserted.",
          };
        },
      );
      await check(
        "world floor tag handle creates bounded timed policy rather than teleport",
        async () => {
          await defender("D3");
          await seek(0.75);
          const before = await save("QA studio before rail");
          await defender("D3");
          const handle = page.getByTestId("tag-floor-handle");
          await expect(handle).toBeVisible();
          const bounds = await handle.boundingBox();
          expect(bounds).not.toBeNull();
          await page.mouse.move(
            bounds!.x + bounds!.width / 2,
            bounds!.y + bounds!.height / 2,
          );
          await page.mouse.down();
          await page.mouse.move(
            bounds!.x + bounds!.width / 2 - 38,
            bounds!.y + bounds!.height / 2 + 15,
            { steps: 8 },
          );
          await page.mouse.up();
          const screenshot = await shot("07-floor-tag-authored");
          const after = await save("QA studio floor rail");
          const cue = after.interventions.find(
            (i) => i.kind === "answer" && Math.abs(i.at - 0.75) < 1e-7,
          );
          expect(cue?.kind).toBe("answer");
          if (cue?.kind === "answer") {
            expect(cue.patch.tagDepth).toBeGreaterThanOrEqual(0);
            expect(cue.patch.tagDepth).toBeLessThanOrEqual(1);
            expect(cue.patch.tagDepth).not.toEqual(before.answer.tagDepth);
          }
          const a = simulate(before),
            b = simulate(after);
          expect(b.frames.filter((f) => f.t < 0.75 - 1e-7)).toEqual(
            a.frames.filter((f) => f.t < 0.75 - 1e-7),
          );
          const p = frameAt(a, 0.75).players.find((p) => p.id === "D3")!,
            q = frameAt(b, 0.75).players.find((p) => p.id === "D3")!;
          expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeLessThan(0.02);
          return { cue, screenshot };
        },
      );
      await check(
        "custom roller and lift coaching compiles complete saved timed rules",
        async () => {
          await defender("D3");
          await page
            .getByText("Coach the roller read", { exact: true })
            .click();
          await page
            .getByRole("checkbox", { name: "Add our roller rule", exact: true })
            .check();
          await range(
            page.getByRole("slider", {
              name: "Roller rule depth",
              exact: true,
            }),
            4.8,
          );
          await page
            .getByRole("combobox", {
              name: "Roller rule response",
              exact: true,
            })
            .selectOption("big-recovers");
          await defender("D4");
          await page.getByText("Coach the lift read", { exact: true }).click();
          await page
            .getByRole("checkbox", { name: "Add our lift rule", exact: true })
            .check();
          await range(
            page.getByRole("slider", { name: "Lift rule rise", exact: true }),
            1.4,
          );
          await page
            .getByRole("combobox", { name: "Lift rule response", exact: true })
            .selectOption("stay-with-lift");
          authored = await save("QA studio custom coached answer");
          const cue = authored.interventions.find(
            (i) => i.kind === "answer" && Math.abs(i.at - 0.75) < 1e-7,
          );
          expect(cue?.kind).toBe("answer");
          if (cue?.kind === "answer")
            expect(cue.patch.coachRules).toEqual([
              { kind: "roller-depth", depth: 4.8, response: "big-recovers" },
              { kind: "lift-rise", rise: 1.4, response: "stay-with-lift" },
            ]);
          await button("Run again").click();
          await expect(button("Play replay")).toBeVisible({ timeout: 60000 });
          await expect(page.getByTestId("lab-clock")).toHaveText("1.40s");
          return { authored, screenshot: await shot("08-custom-rules-replay") };
        },
      );
    }
    await check(
      "Break Mode streams real trajectories then plays to executable witness",
      async () => {
        first = await attack("09-break");
        const evidence = witnessEvidence(first);
        const selected = (await previews()).filter((p) => p.selected).at(-1)!;
        expect(selected).toEqual(
          previewAttackCandidate(first.selected, first.budget.used, true),
        );
        expect(selected.points.length).toBeLessThanOrEqual(33);
        return {
          ...evidence,
          budget: first.budget,
          preview: selected,
          phases: await page.evaluate(
            () => (window as unknown as { qaPhases: unknown[] }).qaPhases,
          ),
        };
      },
    );
    await check(
      "scrub before witness uses paused inspection and replays to same freeze",
      async () => {
        expect(first.selected.witness).not.toBeNull();
        await seek(0.75);
        await expect(page.getByTestId("break-mode")).toHaveAttribute(
          "data-phase",
          "playing",
        );
        await expect(page.getByTestId("attack-evidence")).toContainText(
          "Replay paused",
        );
        await expect(page.getByTestId("attack-evidence")).not.toContainText(
          "Frozen at first exposure",
        );
        await expect(page.locator('[class*="arrivalLabel"]')).toHaveCount(0);
        await shot("10a-before-witness-inspection");
        await button("Play replay").click();
        await expect(page.getByTestId("break-mode")).toHaveAttribute(
          "data-phase",
          "frozen",
          { timeout: 90000 },
        );
        await expect(page.getByTestId("lab-clock")).toHaveText(
          first.selected.witness!.at.toFixed(2) + "s",
        );
        return { screenshot: await shot("10-inspection-refreeze") };
      },
    );
    await check(
      "Fix opens limiting defender and same-opponent retest stays honest",
      async () => {
        await button("Fix it").click();
        await expect(page.getByTestId("break-mode")).toHaveAttribute(
          "data-phase",
          "fixing",
        );
        await expect(page.getByRole("complementary")).toContainText(
          first.selected.witness!.limitingDefenderId,
        );
        const ruleStart = page.getByRole("combobox", {
          name: /^Apply(?: rule)?$/,
          exact: true,
        });
        await expect(ruleStart).toHaveValue("start");
        await closeInspector();
        await defender("D3");
        await page.getByText("Show him where to go", { exact: true }).click();
        await button("Toward rim").focus();
        await page.keyboard.press("Enter");
        await shot("11-fix-floor-move");
        moved = await save("QA studio fixed answer");
        expect(
          moved.interventions.some(
            (i) => i.kind === "move" && i.playerId === "D3",
          ),
        ).toBe(true);
        second = await attack("12-paired-break", true);
        expect(second.pairedRetest).not.toBeNull();
        expect(second.pairedRetest!.sameExperiment).toBe(true);
        expect(second.pairedRetest!.current.opponent).toEqual(
          first.selected.opponent,
        );
        expect(second.pairedRetest!.current.witness).toEqual(
          findAttackWitness(simulate(second.pairedRetest!.current.config)),
        );
        return {
          selected: witnessEvidence(second),
          previous: second.pairedRetest!.previous.witness,
          current: second.pairedRetest!.current.witness,
          sameExperiment: second.pairedRetest!.sameExperiment,
        };
      },
    );
    await check(
      "comparison uses synchronized genuine old defensive world",
      async () => {
        await button("Exit Break Mode").click();
        await closeInspector();
        await button("Compare").click();
        const oldConfig: LabConfig = {
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
        const oldRun = simulate(oldConfig),
          newRun = simulate(second.selected.config),
          comparison = compare(oldRun, newRun);
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
        await seek(
          Math.min(
            second.selected.config.assumptions.duration,
            (first.selected.witness?.at ?? 2.825) + 0.6,
          ),
        );
        const screenshot = await shot("13-world-comparison");
        await button("Close comparison").click();
        return { comparison: comparison.tradeoffs, screenshot };
      },
    );
    await check(
      "saved custom system reload and Teach exclude old attack",
      async () => {
        const exact = await save("QA studio final saved");
        await page.reload({ waitUntil: "domcontentloaded" });
        await ready();
        await button(/^Our system/).click();
        const record = page
          .getByTestId("saved-answer")
          .filter({ hasText: "QA studio final saved" });
        await record.getByRole("button", { name: "Open", exact: true }).click();
        expect(await save("QA studio reopened")).toEqual(exact);
        await button("Teach").click();
        await expect(page.locator("main")).toHaveAttribute(
          "data-mode",
          "teach",
        );
        await button("Model & assumptions").click();
        await expect(page.getByRole("dialog")).not.toContainText(
          "Bounded deterministic high-P&R search:",
        );
        await button("Close dialog").click();
        const screenshot = await shot("14-saved-system-teach");
        await button("Return to Lab").click();
        return { exact, screenshot };
      },
    );
    await check(
      "mobile keyboard modal and coach controls remain usable",
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await button("Model & assumptions").click();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await defender("D3");
        await expect(page.getByRole("complementary")).toBeVisible();
        return {
          screenshot: await shot("15-mobile-coaching"),
          documentWidth: await page.evaluate(
            () => document.documentElement.scrollWidth,
          ),
        };
      },
    );
    await check(
      "renderer diagnostics identify quality without hardware claims",
      async () => {
        await page.setViewportSize({ width: 1280, height: 800 });
        const snapshot = await performanceSnapshot();
        expect(snapshot).toBeTruthy();
        return {
          snapshot,
          environment:
            "Chromium SwiftShader, cloud software rendering; no laptop FPS claim",
          warning:
            "Submission cadence and CPU duration are distinct from GPU completion.",
        };
      },
    );
    await check(
      "public studio performs without remote service requests or runtime errors",
      async () => {
        expect(serviceRequests).toEqual([]);
        expect(errors).toEqual([]);
        expect(failedRequests).toEqual([]);
        return {
          serviceRequests,
          errors,
          failedRequests,
          warnings,
          workerUrls: await page.evaluate(
            () =>
              (window as unknown as { qaWorkerUrls: string[] }).qaWorkerUrls,
          ),
        };
      },
    );
  } catch (error) {
    console.error(
      "Studio verification stopped at failed prerequisite: " + String(error),
    );
  } finally {
    await writeFile(
      path.join(out, "report.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          baseUrl: base,
          production: process.env.PRODUCTION === "1",
          resumed: resume,
          expectedChecks,
          environment:
            "Anonymous Chromium SwiftShader at DPR .75. New studio UI, public Worker message observation; engine recalculation assertions distinguished from screenshots.",
          passed:
            steps.length === expectedChecks && steps.every((s) => s.passed),
          steps,
          errors,
          warnings,
          failedRequests,
          serviceRequests,
        },
        null,
        2,
      ),
    );
    await browser.close();
    if (steps.length !== expectedChecks || steps.some((s) => !s.passed))
      process.exitCode = 1;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
