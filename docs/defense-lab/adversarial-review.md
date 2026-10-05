# Defense Lab: independent adversarial review

Reviewed 5 October 2026 against the founder's original request, `DECISIONS.md`, research synthesis, and the later ambition reset. This review was independent of the implementation owners. It used source inspection and small deterministic model probes; it did not consume another browser/GPU session or rerun the full test suite. Browser acceptance remains owned by the independent experience QA workstream.

The implementation reviewed here is the pre-remodel slice. Findings are carried forward as acceptance requirements for its replacement, rather than an endorsement of that composition.

## Material defects found and disposition

### P1 — Stay-home backside answer was not executable

**Evidence:** `simulation.ts`, `defenseResponsibilities`, formerly the branch around lines 164–172. Selecting `answer.backside = 'stay'` disabled an exchange after a corner pass, but still gave D4 both `lift:split` and `corner:split` tasks during the low-man tag. The split target moved toward the corner regardless of the selected stay rule.

**Reproduction:** Simulate the default config and a second config differing only in `answer.backside = 'stay'`. At 0.75, 1.50 and 2.00 s, D4's complete physical states were identical; both runs selected `lift → corner → drive`. At 1.50 s the purported Stay answer gave D4 the same help-the-helper split duties as X-out. A coach could select the advertised alternative without changing the first weakside problem they meant to test.

**Resolution:** The engine owner added an explicit Stay branch which guards the lifting receiver throughout the tag. Independently re-probed: at 1.50 s D4 now has only `lift:guard`, with trigger “Stay with the lifting receiver through the tag”; its physical state differs from X-out. **Fixed and locally verified.** Final browser verification remains separate.

### P1 — Zero reaction delay repeatedly reset coverage activation

**Evidence:** `simulation.ts`, observation selection around lines 307–312. With the supported `reactionDelay = 0`, `floor(t / dt)` usually selects the current frame index, which has not yet been appended. The fallback frame used `t: 0`. Floating-point rounding occasionally selected the preceding frame, making Switch alternate between active and inactive coverage.

**Reproduction:** Run Switch with otherwise equal default settings. Delay 0 produced only 74 Switch frames out of 233, and at 1.00 s D1 chased while D5 used Drop containment. Delay 0.001 produced 212 Switch frames and proper Switch ownership at 1.00 s. This is an accepted import assumption and can also be reached by stress settings, so it corrupts purported sensitivity evidence.

**Resolution:** The engine owner now observes the current world at its actual timestamp for zero delay. Independently re-probed: zero delay produces 213 Switch frames with correct D1/D5 exchange at 1.00 s. **Fixed and locally verified.**

### P1 — X-ray colored pass corridors as meaningful open windows

**Evidence:** `LabWorld.tsx`, `updateOverlays`, around lines 282–287. Amber “Passing windows” used only `(option.passClearance ?? -1) > 0`. `analytics.ts` requires graph feasibility, current separation and earliest defender arrival later than the flight-and-gather horizon. The renderer therefore declared openness using a different test from the analytical layer.

**Reproduction:** In the default run at 1.50 s the roller's lane is amber although the nearest defender is 0.704 m away, inside the 1.25 m influence radius, with estimated arrival 0. At 2.00 s the roller remains amber at 1.209 m. Drive has `passClearance = null`, so it could never receive the open color even when the drive opportunity is actionable.

**Resolution agreed with integrator:** Export the analytical option predicate/evidence and consume it in the world. Passing clearance and open opportunity should remain distinct; Drive must not fail a pass-only test. **Accepted for the graphics/analytical remodel owner; implementation not yet independently verified at this review's close.** A renamed “Pass corridors” layer would be an honest alternative only with an explicit clearance legend.

### P2 — Teach taught a conditional recovery as the simultaneous first job

**Evidence:** `DefenseLab.tsx` around lines 111–113 and its Teach checkpoint. `currentJob` joined every selected defender responsibility with ` + `, regardless of priority or conditional availability. That combined string was also the supposedly correct answer to “What is your first job?”

**Reproduction:** Save the default answer, enter Teach for the low man and visit the tag checkpoint. The first-job cue reads “Protect the roller + Take the weak corner”. The engine's second task is a conditional recovery with priority 0.35; it has no deadline before the pass. The UI turns a sensible tag-then-recover rule into an apparent simultaneous instruction, undermining the product's very distinction between actual concurrent conflict and a sequential rotation.

**Resolution agreed with integrator:** Present the primary current job first and conditional recovery separately in basketball language, with the coach's chosen release cue. Describe a split responsibility as splitting receivers rather than two simultaneous take commands. **Accepted for the authoring/Teach remodel; not yet independently verified at this review's close.**

### Build defect — Undefined arrival fallback

**Evidence:** `analytics.ts` line 138 referenced undeclared `responsibility` in `option?.target ?? responsibility?.target`. This was a real typecheck defect and could throw if the fallback were evaluated.

**Resolution:** The fallback now uses the actual option target without the undeclared reference. **Source correction independently inspected.** Full typecheck is owned by the integrator.

## Product and architecture judgment

**The coupled read is real, but bounded.** Defensive motion changes the offensive candidates, the read ranks current geometry, a pass launch fixes its endpoint, and receiver reads continue the actual possession. The default timed shallow-tag experiment changes the first offensive choice from lift to roll and exposes gained/conceded opportunities. This is stronger than substituting seven stored animations. It does not establish proprietary differentiation from VReps or a validated predictive basketball model.

**Causal history has a substantive implementation.** Timed rules and movement cues activate inside a fixed-step world; they do not edit recorded coordinates, and launched pass endpoints stay fixed. Prefix and boundary tests are meaningful. A later movement cue can invalidate a catch and stop possession, which is preferable to silently repairing the flight. The new interaction must preserve these properties.

**The current defensive policy is still a P&R template.** Generic movement, ball flight, formations, actions and continuation graphs are reusable. However, `defenseResponsibilities` assumes fixed situational P&R roles and hardcodes Switch activation at 0.48 s and Show recovery at 1.20 s. Non-catch `ReadNode.trigger` values do not currently evaluate screen use or penetration geometry; they become timed checkpoints. The custom baseline-drive test proves reusable offensive content and stepping, but cannot prove reusable opposing defensive systems: called Switch still activates without a screen. This concern was sent to the integrator for the new engine owner. A bounded data-driven activation cue/coverage response is the material next change; a complete general basketball language is outside this acceptance slice.

**Structural conflict must remain witness-based.** The geometric conflict primitive checks explicit deadlines and both visit orders, which is useful. The first scenario primarily exposes windows and tradeoffs; most tag/split tasks do not carry simultaneous deadlines. Synthetic conflict tests demonstrate the primitive, not an observed structural impossibility in this showcase. Do not label a long opening “incompatible responsibilities” unless a real replay supplies the witness.

**No-film first value and durable teaching have concrete paths.** The Lab opens without film/auth gates; saved answers store executable inputs and versions rather than animation frames, and Teach regenerates the saved revision. Local storage/export are honest for this slice. Retention remains a coach-use hypothesis, not evidence from a save button. The primary/conditional teaching defect above must be repaired before the saved answer is credibly teachable.

**A passed old UI suite would not prove the raised product bar.** The early browser report was explicitly confirmed stale by the QA owner, who is rerunning after the remodel settles. No final browser pass is claimed here. Exceptional athlete animation, a world-led interaction, and Break My Defense must be independently inspected in the remodeled result. Do not retain the previous screen merely because its controls can eventually pass a script.

## Verification handoff

Carry the fixed Stay and zero-delay probes into focused engine regression coverage. Verify that X-ray and analytical windows consume the same evidence, Teach separates present and conditional jobs, and a non-screen fixture cannot activate a screen-only defensive exchange. Preserve the current causal-prefix/immutable-flight regressions. Then run independent browser verification against the stable remodeled product; earlier screenshots and the stale report are not its acceptance evidence.
