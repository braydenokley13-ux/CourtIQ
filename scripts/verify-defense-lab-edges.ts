import { chromium, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { simulate, frameAt } from "../apps/web/lib/defense-lab/simulation";
const out = path.resolve("docs/defense-lab/qa-raised"),
  key = "courtiq.defense-lab.answers.v1";
const steps: {
  name: string;
  passed: boolean;
  evidence?: unknown;
  error?: string;
}[] = [];
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
  let page: Page;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 0.75,
  });
  async function check(name: string, fn: () => Promise<unknown>) {
    try {
      const evidence = await fn();
      steps.push({ name, passed: true, evidence });
      console.log("PASS " + name);
    } catch (error) {
      steps.push({ name, passed: false, error: String(error) });
      console.error("FAIL " + name + ": " + String(error));
    }
  }
  try {
    page = await context.newPage();
    await page.goto("http://localhost:3000/lab", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.locator("[data-lab-renderer=webgl][data-athlete-type=skinned-glb]"),
    ).toBeVisible({ timeout: 60000 });
    const button = (name: string | RegExp) =>
      page.getByRole("button", { name, exact: typeof name === "string" });
    await check("valid exported collection imports through UI", async () => {
      await button(/^Our system/).click();
      await page
        .locator("input[type=file]")
        .setInputFiles(path.join(out, "answers-export.json"));
      await expect(
        page
          .getByTestId("saved-answer")
          .filter({ hasText: "QA moved exact answer" }),
      ).toBeVisible();
      await page
        .getByTestId("saved-answer")
        .filter({ hasText: "QA moved exact answer" })
        .getByRole("button", { name: "Open", exact: true })
        .click();
      return {
        count: await page.evaluate(
          (k) => JSON.parse(localStorage.getItem(k)!).answers.length,
          key,
        ),
      };
    });
    await check(
      "court pointer drag creates floor target and preserves causal prefix",
      async () => {
        await button("Build our answer").click();
        await page
          .getByRole("combobox", { name: "Coach a defender", exact: true })
          .selectOption("D3");
        const slider = page.getByRole("slider", {
          name: "Replay time",
          exact: true,
        });
        await slider.evaluate((node) => {
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          )!.set!.call(node, "1.4");
          node.dispatchEvent(new Event("input", { bubbles: true }));
          node.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await expect(page.getByTestId("lab-clock")).toHaveText("1.40s");
        const before = await page.evaluate(
          (k) =>
            JSON.parse(localStorage.getItem(k)!).answers.find(
              (a: { name: string }) => a.name === "QA moved exact answer",
            ).config,
          key,
        );
        const leader = page.locator('svg[class*="anchorLeader"]');
        await expect(leader).toBeVisible();
        const foot = await leader.locator("circle").evaluate((node) => {
          const circle = node as SVGCircleElement;
          const r = node.ownerSVGElement!.getBoundingClientRect();
          return {
            x: r.left + circle.cx.baseVal.value,
            y: r.top + circle.cy.baseVal.value,
          };
        });
        await page.mouse.move(foot.x, foot.y - 32);
        await page.mouse.down();
        await page.mouse.move(foot.x - 44, foot.y + 24, { steps: 8 });
        await page.mouse.up();
        await expect(
          page
            .getByRole("status")
            .filter({ hasText: "D3 has a new movement cue" }),
        ).toBeVisible();
        await page.screenshot({
          path: path.join(out, "14-pointer-floor-target.png"),
          fullPage: true,
        });
        await button("Close inspector").click();
        await button("Save / teach").click();
        await page
          .getByRole("textbox", { name: "Answer name", exact: true })
          .fill("QA pointer target");
        await button("Save answer").click();
        const after = await page.evaluate(
          (k) =>
            JSON.parse(localStorage.getItem(k)!).answers.find(
              (a: { name: string }) => a.name === "QA pointer target",
            ).config,
          key,
        );
        const targetBefore = before.interventions.find(
            (i: { kind: string }) => i.kind === "move",
          ).target,
          targetAfter = after.interventions.find(
            (i: { kind: string }) => i.kind === "move",
          ).target;
        expect(targetAfter).not.toEqual(targetBefore);
        const a = simulate(before),
          b = simulate(after);
        expect(b.frames.filter((f) => f.t < 1.4 - 1e-7)).toEqual(
          a.frames.filter((f) => f.t < 1.4 - 1e-7),
        );
        const at = frameAt(b, 1.4).players.find((p) => p.id === "D3")!,
          prior = frameAt(a, 1.4).players.find((p) => p.id === "D3")!;
        expect(Math.hypot(at.x - prior.x, at.z - prior.z)).toBeLessThan(0.02);
        return {
          foot,
          targetBefore,
          targetAfter,
          instantDisplacement: Math.hypot(at.x - prior.x, at.z - prior.z),
        };
      },
    );
    await page.close();
    await context.close();
    const fallback = await browser.newContext({
      viewport: { width: 960, height: 800 },
    });
    await fallback.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        kind: string,
        ...args: unknown[]
      ) {
        if (/webgl/.test(kind)) return null;
        return (get as (...args: unknown[]) => unknown).apply(this, [
          kind,
          ...args,
        ]);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    page = await fallback.newPage();
    await check(
      "WebGL unavailable still gives usable court and replay",
      async () => {
        await page.goto("http://localhost:3000/lab", {
          waitUntil: "domcontentloaded",
        });
        await expect(
          page.locator("[data-lab-renderer=fallback] svg"),
        ).toBeVisible({ timeout: 60000 });
        await page.getByRole("button", { name: "Run it", exact: true }).click();
        await expect(page.getByTestId("lab-clock")).toHaveText("0.75s", {
          timeout: 15000,
        });
        await page.screenshot({
          path: path.join(out, "15-webgl-fallback.png"),
          fullPage: true,
        });
        return { clock: await page.getByTestId("lab-clock").innerText() };
      },
    );
    await fallback.close();
  } finally {
    await writeFile(
      path.join(out, "edges-report.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          passed: steps.every((s) => s.passed),
          steps,
        },
        null,
        2,
      ),
    );
    await browser.close();
    if (steps.some((s) => !s.passed)) process.exitCode = 1;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
