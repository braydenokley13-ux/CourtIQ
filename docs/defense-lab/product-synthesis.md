# CourtIQ Defense Lab: product decisions and evidence

Research inspected 5 October 2026. The founder's supplied request governs this work. Older CourtIQ plans describe the previous youth IQ training product and are historical context; they do not govern the Defense Lab.

## Decision

Enter through one high-school varsity coaching question: **Can our five rules coexist against high pick-and-roll, a low-man tag, and the weakside lift/skip?**

CourtIQ's product unit is a basketball problem with a saved team answer. It is not a project, playbook, rating, film upload, or curriculum session. The first visit should begin inside the court with Drop / over / tag / X-out already runnable. Ask the coach to describe their answer through basketball controls; defer accounts, team rosters, film, full system authoring, payment, and configuration wizards.

The minimum valuable loop is: run → locate the stress point → reveal the responsibility conflict → change one rule → rerun against the same opponent intent and assumptions → inspect the tradeoff → save → teach a role. When the coach changes tag depth, the offensive opportunity structure must change through the coupled engine. Merely substituting another prerecorded route fails the product thesis.

## Competitive evidence and implications

These are inspected first-party product claims, not independently verified capability/performance assessments. An omitted feature is not proof the vendor cannot do it.

| Product / owned job | Evidence on inspected pages | CourtIQ overlap | Explicit decision |
| --- | --- | --- | --- |
| Hudl: capture, analysis, film sharing and preparation | The basketball and high-school basketball pages describe automatic recording, Assist breakdowns, stats tied to video, clip comments/drawings, custom tags and playlists. | Coaches explain defensive execution and prepare players. | No capture, video tagging, stats dashboard, athlete monitoring, or opponent scouting build. An optional future film reference can identify a problem instance; the Lab must work without it. |
| FastDraw / Fastmodel: draw, organize and communicate the plan | Current Fastmodel page describes diagramming/animation, mobile delivery, player understanding, integrated scouting/recruiting. A 2025 FastDraw article describes folders/tags, labels and sharing. The old fastmodelsports.com/fastdraw URL resolves to Hudl's Fastmodel surface. | Authored actions, rules, labels, saved program knowledge and teaching. | Do not lead with a diagram editor or playbook manager. Save executable input rules and evidence-bearing experiments, not arrows or a video. |
| VReps: 3D learning and team rehearsal | Homepage explicitly advertises a free 3D custom builder, reads/looks/decisions, non-linear if-then scenarios, branches, coaching cues, timing/spacing control, private team playbooks, assignments and progress. Players and core coach features are advertised as free. | Nearly all simple “3D playbook plus Teach” features already overlap. | The differentiation test is adversarial response, computed responsibility conflict, causality-preserving intervention and paired uncertainty. 3D, branches, player POV, replay and teaching alone are insufficient. |
| Genius / Second Spectrum: data capture, AI understanding, performance analysis and digital twins | GeniusIQ describes live action converted to a digital twin through high-fidelity mesh tracking, multiple large-scale data sources and ML. Perform describes data/video analysis and automatically pairing events with video. | Spatial understanding, tactical analysis and rich 3D presentation. | Do not become a cheaper tracking/ML imitation. Explicit authored behavior + deterministic geometry is the first engine. Never imply professional tracking validation or learned basketball prediction. |

Competitive distinction is an engineering acceptance test, not a claim of unique ownership of a category. The coach must see a changed defensive rule close one computed opportunity while opening another, and see the offense respond to that opening. Teaching is the downstream use of the answer, not the initial moat.

## High-school workflow: supported signals and working hypotheses

The inspected Hudl high-school page provides attributable coach testimonials and describes preparation, teaching, custom tags and playlists. It supports that film sharing and coachable moments are established jobs. It does not establish a typical staff size, discretionary budget, weekly preparation schedule or adoption rate.

Hudl's “Winning the Week” article is authored by a coach and interviews **college** coaches. It describes action families, limited player-facing information, templates, short teaching sessions and saving preparation time. Its “25 hours” claim is vendor-hosted anecdote; do not transfer that number to high-school coaches or CourtIQ. VReps' five-to-ten-minute session framing is also a vendor assertion, not measured high-school demand.

The following workflow is therefore a product hypothesis to validate with high-school varsity coaches:

1. The coach recognizes a recurring problem from a game, clinic or practice, without uploading film.
2. They choose their current coverage and two help rules, then run immediately.
3. CourtIQ stops at the first consequential read rather than demanding a full possession review.
4. The coach compares one plausible adjustment against the same assumptions.
5. They save “Our drop vs lift” and present the low-man or backside responsibility at practice.
6. On the next visit, they reopen that answer, vary an offensive counter or execution assumption, and revise the team rule.

Design consequence: treat limited attention and practice time as constraints. Keep one clearly named stress point, one explanatory sentence, one relevant X-ray layer, and one principal adjustment in view. Advanced numerical assumptions and provenance belong behind Why. Never make a coach first construct a roster or a giant system.

## Onboarding and teaching decisions

- Open the first problem in a ready-to-run state. No mandatory signup or film.
- Ask “How do you guard the high ball screen?” rather than asking the coach to create a strategy graph. Initial complete answers include Drop, Switch and Blitz; unavailable coverages must be labeled rather than simulated by a misleading preset.
- Display canonical labels and allow local team aliases. An alias changes presentation, never underlying responsibility identity.
- Show the consequence before requesting more setup. A shallower tag should visibly produce the lift/roller tradeoff under stated assumptions.
- Save the inputs, seed, model/content versions and time-specific interventions. Teach regenerates the canonical replay through the same engine. Role selection highlights that player's current and transferred responsibilities; it does not fabricate a separate scripted teaching animation.
- A role cue is a short if/then instruction attached to a concrete moment. Support overhead replay and slow motion before quizzes, XP, streaks, roster analytics or assessment claims.
- Browser-local saving must say “Saved on this device.” Export is the honest backup/transfer path. Storage denial or quota must preserve the active answer in memory and say it will be lost on reload unless exported.

## Commercial and retention decisions

The founder has selected annual program software with unlimited experimentation as the preferred model. No payment infrastructure or fabricated price belongs in this slice. Current VReps positioning makes “cheaper 3D teaching” an especially weak commercial thesis because its player/core coach offering is advertised as free.

Pricing is unresolved. Validate willingness to pay after coaches demonstrate repeated decision value. Interview/observe varsity coaches, include girls and boys programs and different resources/coverage philosophies, and ask about a real annual purchasing process. A schoolwide expansion hypothesis is not evidence of budget authority or demand.

Retention must derive from saved answers that the coach revisits and improves, team terminology that makes teaching quicker, and season-to-season continuity. Do not borrow the old youth-product streak, IQ score or leaderboard model. The first slice must make the **same** basketball problem worth reopening: ask a different counter, vary an assumption, preserve an earlier answer, teach another role, or compare a later revision. Future curated problems compound that utility only if each passes a basketball and engine review gate.

Suggested evaluation protocol (not established targets): observe time to first run and first useful edit; ask the coach to explain the tradeoff in their own words; record whether they changed a practice/game-plan rule; request an unprompted second use before adding payment. Count saved-answer revisions, counter tests and role teaching; page views and time on a beautiful court are weaker signals. Do not implement background telemetry in this slice.

## Platform path

The long-term team system is a set of versioned answers over canonical basketball problems, plus team-specific vocabulary and rule variants. It is not one monolithic playbook. Answers link to reusable primitives and retain the exact execution context needed to review a prior decision.

V1 keeps this representation portable as versioned JSON and local browser storage. A future authenticated service can add program/season ownership, staff permissions and revision history behind the same repository boundary. Problem/content versions, engine versions and a separate schema version prevent model upgrades from silently rewriting what the coach originally saved. Film links and learned models are optional observations/adapters, not prerequisites of world execution.

The corpus expansion gate is quality: research source and date, coaching alternatives, offensive reads/counters, coherent role responsibilities, geometry/assumption tests, teach checkpoints, and a coach review. Do not generate a thousand shallow scenarios to claim a library moat.

## Adversarial product checks

1. **Secretly VReps?** If branches ignore defense and only animate predefined choices, yes. Fix the coupled read/geometry path before adding more Teach features.
2. **Secretly a dashboard?** If the court is a picture surrounded by settings/metrics, yes. Put the stress point, causal edit and comparison in the world.
3. **Reason to return?** If the coach cannot persist, reopen, revise and teach an answer, no. Local durable records plus honest export are required now.
4. **Trustworthy?** Exact geometry is not exact basketball prediction. Numbers must reveal assumptions, model version and structural meaning. No score or win guarantee.
5. **Could Hudl absorb it?** A surface replay widget could be copied. A defensible thesis requires reusable interacting rules, a reviewed executable corpus and accumulating team knowledge. Those are long-term execution goals, not a claim of a moat achieved by one slice.

## Inspected source log

All successful pages fetched through the managed environment proxy on **2026-10-05** and read as extracted HTML text. Source assertions above are limited to the visible claims inspected here.

- Hudl basketball: https://www.hudl.com/sports/basketball
- Hudl high-school basketball: https://www.hudl.com/solutions/high-school/basketball
- Hudl Fastmodel: https://www.hudl.com/products/fastmodel (also destination of https://www.fastmodelsports.com/fastdraw)
- FastDraw article, published 2025-07-10: https://www.hudl.com/blog/how-fastdraw-elevates-your-playbook
- Coaching workflow article, published 2026-01-23: https://www.hudl.com/blog/basketball-modern-game-prep
- VReps homepage: https://vreps.us/
- VReps features: https://vreps.us/en/features
- GeniusIQ: https://www.geniussports.com/geniusiq/
- Genius Perform: https://www.geniussports.com/perform/

Inspection limitations: https://www.secondspectrum.com/ returned only a short denial response, so no direct current capability claim was inferred from it. https://www.geniussports.com/second-spectrum/, https://www.hudl.com/products/fastdraw and the guessed Hudl high-school package URL returned not-found pages and are not evidence. VReps /en/coach did not expose the authenticated editor. No competitor editor was interactively tested, no independent customer study was performed, and no coach was contacted.
