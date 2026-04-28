# CourtIQ Phase 1 — Decoder Foundations: Implementation Planning

> Working planning document. Built up across small micro-milestones.
>
> **Status:** in progress.
> **Branch:** `claude/courtiq-phased-planning-aISkN`.
> **Goal:** turn the existing CourtIQ scenario engine into a decoder-driven, 3D playable film-room. Ship one gold-standard scenario (`BDW-01`) end-to-end, then reuse the template for `ESC-01` / `AOR-01` / `SKR-01` / optional `SKR-02`.
>
> Sections 1–4 (Executive Summary, Current-State Assessment, Product Architecture, Scenario Data Architecture) were drafted in chat (PR-1 / PR-2). They are not yet persisted here; backfill is its own micro-milestone when requested. This file currently captures Section 5 onward.

---

## Section 5 — 3D Runtime Architecture

The 3D runtime exists. This section describes the **delta** that turns it into a decoder-aware engine. No file in `apps/web/components/scenario3d/` or `apps/web/lib/scenario3d/` is replaced; each gets a small, well-scoped extension.

### 5.1 Scenario state input

The runtime has one entry contract: a normalised `Scene3D` produced by `apps/web/lib/scenario3d/scene.ts` from the scenario record. That contract is the **only** thing 3D components depend on.

**What flows into the canvas (and only this):**

```ts
// produced once per scenario by useScenarioSceneData(scenario)
type Scene3DInput = {
  scenarioId: string;            // for telemetry / fallback identity only
  court: 'half' | 'full';
  camera: { preset: CameraPreset; anchor?: Vec2Ft };
  players: Player3D[];           // includes exactly one isUser: true
  ball: { start: Vec2Ft; holderId: string };
  movements: Movement3D[];       // pre-freeze setup
  freezeBeforeMovementId?: string;
  answerDemo: Movement3D[];      // best-read replay
  wrongDemos: { choiceId: string; movements: Movement3D[] }[];
  preAnswerOverlays: OverlayPrimitive[];
  postAnswerOverlays: OverlayPrimitive[];
  qualityTier: 1 | 2 | 3;
};
```

**What does *not* flow into the canvas:**

- `decoderTag`, `conceptTags`, `playerRole`, `gameContext`, `questionPrompt`, `choices`, `bestRead`, `acceptableReads`, `badReads`, `commonMissReason`, `whyBestReadWorks`, `lessonConnection`, `decoderTeachingPoint`, `feedback`, `selfReviewChecklist`, `coachValidation`, `sourceResearchBasis`, `progressionMetadata`.

These belong to the train page, the question UI, the feedback panel, the lesson hand-off, and the attempt transaction. They never enter `Scenario3DCanvas`. Keeping them out is what guarantees the canvas stays scenario-agnostic.

**How each runtime concern is fed:**

| Runtime concern | Source field | Consumer |
|---|---|---|
| Player positioning | `players[i].start` (court feet) | `PlayerMarker3D` (mounted by `ScenarioScene3D`) |
| Ball location | `ball.start` + `ball.holderId` | `BallMarker3D` (snaps to holder if resolvable) |
| Camera | `camera.preset`, optional `camera.anchor` | `presets.ts` resolves preset → camera transform; `AutoFitCamera` is bypassed when a preset is set |
| Pre-freeze possession | `movements[]` | `MotionController` in `imperativeScene.ts`; resolved freeze time cached at scene load |
| Freeze stop point | `freezeBeforeMovementId` (optional; defaults to end-of-`movements[]`) | `MotionController.advance()` becomes a no-op once the playhead reaches the resolved freeze time |
| Best-read playback | `answerDemo[]` | `MotionController` re-driven from the snapshotted freeze positions |
| Wrong/acceptable consequence | `wrongDemos[].movements` keyed by `choiceId` | Same; dispatched on the chosen choice id |
| Pre-answer overlays | `preAnswerOverlays[]` | `imperativeTeachingOverlay` controller, mounted once during `setup`, faded in during `playing → frozen` |
| Post-answer overlays | `postAnswerOverlays[]` | Same controller; visibility-flip only — no teardown, no re-mount |

**How this prevents BDW-01 (or any single scenario) being hardcoded into components:**

1. **`scene.ts` is the choke point.** All schema additions land in `scene.ts` first, get normalised into `Scene3DInput`, and only then surface in components. No component reads `scenario.decoderTag` or any other top-level scenario field.
2. **Components are id-blind.** `Scenario3DCanvas`, `Court3D`, `ScenarioScene3D`, `PlayerMarker3D`, `BallMarker3D`, `MotionController`, and the imperative overlay controller never branch on `scenarioId`. They render whatever is in `Scene3DInput`. If a future scenario needs new visual behaviour, the path is: add a primitive in the schema → renderer reads the primitive → author uses it. Never: add an `if (scenarioId === 'BDW-01')` branch.
3. **Movement kinds and overlay primitives are typed unions, not strings of intent.** Adding `back_cut` or `defender_hip_arrow` is a schema-level change with one well-scoped renderer addition; it is never a per-scenario component patch.
4. **Camera presets resolve through `presets.ts`.** A scenario that needs framing the existing presets can't deliver supplies a `camera.anchor` override in feet — never a custom camera component.
5. **Authoring is data, not code.** Once Section 5.1's contract is honoured, ESC-01 / AOR-01 / SKR-01 reuse 100% of the runtime; their differences are entirely inside `Scene3DInput`.

The runtime stays a generic 3D scenario player. The decoder scenarios become the first tenants of that contract; they are not the contract itself.

---

*Sections 5.2 onward, plus Section 6 (Overlay System Plan), Section 7 (BDW-01 Build Plan), and Sections 8–11 are pending micro-milestones.*
