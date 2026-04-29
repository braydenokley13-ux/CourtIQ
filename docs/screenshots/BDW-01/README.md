# BDW-01 — Premium Learning Loop Upgrade

Scope: small-commit upgrade pass that lifts BDW-01 (THE BACKDOOR
WINDOW) from working prototype into a premium interactive learning
product. No new scenarios, no architecture changes — every change is
constrained to the `/train` surface, the four BDW-specific train
components, and the supporting copy. Builds on the prior visual
upgrade pass and the founder-pack content seeds.

## Phase A–E learning loop

The rep is now structured as a clean five-phase loop. Every phase is
visible to the user via the new `PhaseTracker` chip strip above the
court (Watch → Read → Pick → Learn) and reinforced through pacing,
copy, and motion.

### Phase A — Watch
- "Watch the play" pulse + dot in the timer slot while the scene is
  playing toward freeze. Tells the kid the scene is intentionally
  unfolding instead of stalled.
- Decoder chip names the read ("Decoder · The Backdoor Window") so
  the kid enters the rep with framing.
- Tracker chip 1 ("Watch") pulses; chips 2–4 are dim.

### Phase B — Freeze + Think
- Freeze fires on the authored `freezeAtMs`; the question prompt +
  premium choice cards animate in on the freeze beat (300ms motion
  curve, no jump).
- New 700ms "settle" window: the response timer holds for 700ms after
  freeze so the kid gets to read the play before the clock starts.
- Tracker chip 2 ("Read") pulses.

### Phase C — Choose
- New `ChoiceCard` component replaces the legacy bordered button.
  Each card has a real letter pill (A/B/C/D), a hover/tap state, a
  tap target sized for kids' fingers, and confidence-colored states
  after submit.
- Submit fires the per-choice consequence/replay flow inside the
  3D canvas (unchanged).
- Tracker chip 3 ("Pick") pulses; on submit, it locks to ✓.

### Phase D — Learn Consequence
- The 3D scene drives the consequence leg for wrong picks (red
  caption "Defender deflects the reversal." / "Defender rides the
  cut.") and short-circuits to the best-read leg for the correct
  pick.
- Caption pill is now red on consequence and brand-green on the
  best-read leg, animated in/out so the kid feels the difference.
- Tracker chip 4 ("Learn") pulses through both consequence and the
  best-read replay.

### Phase E — Win Moment
- New `WinBurst` celebration card pops above the feedback panel on
  correct picks: brand-glow shell, spark ring, decoder-specific
  micro-praise ("You saw the help defender."), and a row of XP / IQ
  / streak chips that scale-in one-by-one.
- Premium `FeedbackPanel` replaces the legacy box: header pill with
  ✓ / ! glyph, "Why" body in its own subtle card, dual replay CTAs
  ("Watch the right read", "Show what I did" on a miss).
- Decoder hand-off + self-review surface below the feedback so the
  kid lands on "here's the move + here's how to grade your own rep."

## Better teaching UI

### Copy upgrades
- Praise rotation: `Great read.` / `Locked in.` / `Smart move.` /
  `You saw it.` / `Big brain.`
- Recover rotation: `Almost.` / `So close.` / `Not quite.` /
  `Try the next one.` / `Reset.`
- Per-decoder micro-praise on the win burst (BDW-01: `You saw the
  help defender.`).
- Per-decoder miss note under the feedback headline (BDW-01: `Read
  the defender, not the spot.`).
- Loading state: `Setting the play…` (was `Getting the gym ready…`).

### Layout upgrades
- Header chips: XP / IQ / streak each on their own pill with a
  consistent border + bg. Streak pill animates a `scale + opacity`
  pop when it ticks up.
- Combo flame: brand-bordered pill with a flame glyph that does not
  collide with the win burst (only renders during the active prompt).
- Quit is now a tap pill with a hit target instead of bare text.
- Phase tracker step strip with active-step pulse + completed-step
  filled state.

## Make choices feel great

- `ChoiceCard.tsx` replaces the legacy button. States:
  - `idle` — neutral chrome, hover lifts y by 1px and brightens the
    letter pill toward brand.
  - `selected` — brand ring while submit is in flight.
  - `correct` — brand ring + ✓ pill + "Best read" tag + bottom
    progress bar swiping in left-to-right.
  - `wrong` — heat ring + ✕ pill, dimmed copy.
  - `reveal-correct` — brand ring + ✓ pill on the correct option
    after a wrong pick.
  - `dimmed` — non-picked options after submit fade to 55% opacity
    so the eye lands on the picked + correct rows.
- All states animate via framer-motion `whileHover` + `whileTap` so
  the cards feel tactile.
- `deriveChoiceState` helper centralizes the state machine for the
  cards; small unit-testable function exported from `page.tsx`.

## Improve replay teaching

- Decoder caption pill now renders during BOTH the consequence and
  best-read replay legs (was previously gated only by the legacy
  `replayMode === 'answer'`).
- Caption is heat-colored on consequence ("Defender deflects the
  reversal.") and brand-colored on the best-read replay ("Plant and
  back-cut. Layup before x4 rotates."), animated in/out per caption
  change so the kid follows the cue beats.
- "Watch the right read" CTA in the feedback panel re-fires the
  best-read replay; on a miss, a secondary "Show what I did" CTA is
  available for context (wired to the same replay counter — the
  `imperativeScene` already retains the picked-choice consequence
  inside the replay state machine).

## Motivation layer

- `WinBurst` celebration card on correct answers (XP / IQ / streak
  pills + spark ring + decoder-specific praise).
- Streak chip pop in the header when the streak ticks up.
- Combo chip ("3 in a row 🔥") in brand-bordered pill, only during
  the active prompt.
- Recovery toast for misses ("Keep going") on the heat color so a
  miss still has a visible respond-and-continue beat without
  competing with the success state.

## ADHD / focus pass

- 700ms post-freeze settle window before the response timer starts
  ticking.
- "Watch the play" pulsing dot during pre-freeze playback so the
  kid knows the scene is intentionally unfolding.
- Animated mount of the prompt + question on the freeze beat (was
  a hard cut-in).
- Win burst chips scale-in one-by-one (XP first, then IQ, then
  streak) so reward attention is staged, not slammed.
- Phase tracker bar makes the rep feel like four small steps instead
  of one big one.
- Dropped the duplicate XP toast that fired on top of the win burst
  on correct answers.

## Polish bugs fixed

- Caption visibility gate: was hiding the consequence/replay caption
  on the decoder path because the legacy `replayMode === 'answer'`
  predicate did not match `'intro'`-mode decoder scenes.
- `replayDone` and `setReplayDone` were declared but never read —
  removed.
- Loading state copy was inconsistent between the suspense fallback
  and the in-page spinner — both now read `Setting the play…`.

## Remaining known issues

- No new scenarios were added — BDW-01 remains the only
  fully-decoded scenario in the founder pack.
- Live Playwright screenshots could not be captured in this sandbox
  because the `/train` route requires authenticated Supabase
  credentials and the build pipeline is the source of truth for the
  font subset. The CI/preview pipeline still exercises this capture
  path (see `pnpm screenshot:bdw`).
- Authenticated visual QA (`pnpm qa:auth` → `pnpm qa:screenshot`) is
  not yet wired in this branch — there's no `.auth/courtiq-user.json`
  or `qa:auth` script in `package.json`. Adding the auth bootstrap
  + storage-state plumbing is the unblocker for a visual-QA polish
  pass.
- The "Show what I did" CTA on a miss is currently wired to the same
  best-read replay counter — the imperative scene's state machine
  retains the picked choice across replay resets, but a follow-up
  pass could surface an explicit consequence-only replay action.
- Build fails locally on Google Fonts fetch in this sandbox
  (`SELF_SIGNED_CERT_IN_CHAIN` on `fonts.googleapis.com`); same
  environmental limit as the baseline pass. Code-level validations
  (typecheck, lint, test) are clean.

## Build issue history

- The earlier Vercel build error
  `"deriveChoiceState" is not a valid Page export field` came from a
  pre-fix commit. Resolved in `0c6d31e` by relocating
  `deriveChoiceState` from `app/train/page.tsx` into
  `app/train/ChoiceCard.tsx` so the page module only exports
  `default`. The current branch tip compiles.

## Validation

| check                       | status  |
| --------------------------- | ------- |
| `pnpm typecheck`            | clean   |
| `pnpm lint`                 | clean   |
| `pnpm test` (96 tests)      | passing |
| `pnpm build`                | env-blocked on Google Fonts only |
