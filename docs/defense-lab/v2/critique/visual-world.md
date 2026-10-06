# CourtIQ visual / world critique (adversarial art direction)

Scope: composition and camera, light and materials, athletes, the four X-Ray lenses, compare ghosts, Break Mode, labels and panels, mobile.
Evidence: `shots/visual-*.png` (1440x900 unless noted). Mockups = `images/1-5.webp`.
Capture caveat: software GL at about 1 fps, resolution scale x0.60 (the debug footer shows it), CPU load average about 14 while I shot. I could judge stills, framing and legibility. I could NOT judge motion, footskate or the animated Break search. Those need a real-GPU pass.
Bar: the mockups show hero-scale players (25-35% of frame height), one glowing red lane laser, one blue ring. The build shows about 7% height players in a mostly empty dark gym, with the key analytical layer missing.

## P0 (ship-blockers against "mockups are the floor")

### P0-1 Three of four X-Ray lenses render no marks at all
Evidence: `visual-02-lens-ownership-empty.png`, `visual-03-lens-passes-empty.png`, `visual-04-lens-drive-empty.png`. I waited 14-20 s per lens in 4 runs, the world paused at the moment.
- "Who has who" should draw 5 tethers + rings. "Who can get there" should draw 10 reach discs (I captured it in an earlier run, same result, and never re-shot it long). "Open passes" should draw lanes. "Room to drive" should draw 2 wedges.
- What I see: the room goes near-black, defenders turn blue, offense turns gold, and nothing else. "Passes" shows only a faint grey wedge by the ball handler. All four lenses look identical, so none reveals ONE idea. The older `g3/07-why.png` shows the same emptiness, so this is not a one-off.
- Game-view marks (rings, paths) do render in the same session, so it is not GL. Suspects: marks sit at y=0.022-0.026 under the lens-dimmed `analyticalFloor`/transparent sort order in `labEnvironment.ts`/`setLabEnvironmentAnalytical`, or the lens marks fade (`age`/`fade`) is never re-rendered after the world pauses (`dirty` is not set once `animating` falls to false).
- Fix: (1) assert in a Playwright test that `scene.marks.length > 0` per lens, and that the mark layer's draw calls increase by at least N. (2) Render marks with `depthTest:false`, `renderOrder` 20, after the floor. (3) Force `dirty = true` for 600 ms after any lens change. Treat this as the single most important defect.

### P0-2 The camera menu is hidden under the "Here's the problem" panel, so Overhead / Baseline / Defender's eyes are unreachable by mouse
Evidence: `visual-01-default-camera-moment.png`. The CAMERA header peeks out at y=275, and the options sit behind the 400px panel. Real clicks hit the panel. A forced click on the buttons did nothing visible and X-Ray silently reset. I only got the three views by DOM-clicking.
- Fix: dock lens + camera as ONE vertical world-edge rail (right edge, 44px icon-only, label on hover, `z-index` above the panel), or anchor them to the bottom transport bar. Never stack two cards in the top-right while the panel is on the right. Cap panel height to `min(60vh, 460px)` and `top: 150`.

### P0-3 The default camera frames the gym, not the basketball problem
Evidence: `visual-01-default-camera-moment.png`. About 40% of the frame (top) is black wall, banners and bleachers. The rim is forced into frame (`minZ = Math.min(minZ, 1.2)` in `camera.ts`), which pushes the 5 involved players to the lower-left at about 70px tall. The panel then sits on the other half.
- Fix in `camera.ts` director: azimuth 0.62 → 0.42, elevation 0.50 → 0.36 (about 21°, a broadcast low-high angle, players read as bodies, not heads), `fov` 38 → 30 (telephoto compresses depth, hero scale). Drop the unconditional rim sample. Include the rim only if `moment.kind` involves the rim (the layup threat), and then as a small `Vector3(0,3.05,1.575)` sample with 25% weight. Min distance 9 → 6.5. Frame ball handler, screener, low man and open shooter (4 bodies) inside the safe rect, offset so the centroid sits at 38% x, 56% y of the safe region.
- Expected result: players about 18-22% of frame height, the court floor fills the lower two thirds, the rim sits at the top edge as a landmark. This is the mockup-3 framing.

### P0-4 Baseline and Defender's-eyes cameras are broken as basketball views
Evidence: `visual-06-cam-baseline.png`, `visual-07-cam-defender-eyes.png`.
- Baseline: eye at (0,5.4,-3.2) sits behind the backboard. The stanchion and base pad fill the bottom 45% of the frame, with the hoop net in the foreground. The helper, the shooter and the ball are barely visible. Move the eye to (3.4, 2.6, -1.8), target (-0.6, 1.1, 6.0), fov 48, so it looks past the post. Also fade the stanchion/pad to 20% alpha (dither) when the eye is within 4 m of them.
- Defender's eyes: it shows a huge back-turned #3 and a basketball at hip height, a neck-high view of one person. A helper's job is TWO assignments, and the camera should show both. Eye at (p.x, 1.78, p.z) + 0.10 forward (head height, inside the head), fov 66, target = midpoint of the two assignments (the top two `responsibilities`) at y=1.2. Hide the POV athlete's head/torso mesh (layer mask) and keep the hands. Add a 10-degree peripheral blur vignette, plus two screen-edge chevrons for any assignment outside the frustum. The tag-guide panel (left, 330px) should not open on POV entry.
- Overhead: the target ignores `safe`/`inset`. The ball handler lands under the "Needs 0.8 s" pill, hard against the nav bar, and the rim is behind the X-Ray menu (`visual-05-cam-overhead.png`). Fit the focus bodies into the safe rect exactly as the director does, and use elevation 78° rather than 90° so bodies keep faces and numbers.

## P1

### P1-1 Marks are additive "light", which dies on a bright floor
Evidence: `visual-01-default-camera-moment.png` (yellow dashed line and orange ring on orange wood), `visual-08-compare.png`.
- `MeshBasicMaterial` + `AdditiveBlending` + `toneMapped:false` is great on the dark X-Ray floor and nearly invisible on the lit maple. The moment route (`warn` #ffb238) and ring (`threat` #ff5a3c) are the same hue family as the wood.
- Fix: draw every ribbon/ring in two passes: an underlay in `NormalBlending`, black, opacity 0.45, width x1.7 (a "stroke"), then the colour on top. Switch the colour pass to `NormalBlending` when `xray < 0.5`. Move `threat` to #ff2e63 (pink-red, off the wood hue), `warn` to #ffe14d, `defense` to #3fb0ff. Only the halo should stay additive.

### P1-2 Floating labels are disembodied
Evidence: `visual-01-default-camera-moment.png` ("Open 1.0 s", "Needs 0.81 s" float 40-90px from their bodies, with no leader), `visual-08-compare.png` (a clipped "F..." chip collides with "Ball to the rim closed 1.00→0.00 s"), `visual-10-break-result.png` (a player's head disappears behind the title chips).
- Fix: labels must hang off a pin. Render each label with a 1px leader line to the top of the head (y=2.15, projected) and a 5px dot, anchored 28px up and flipped away from the nearest neighbouring label (greedy collision with 6px padding). Cap label text at 3 words + a number ("Open 1.0 s", "Late by 0.43"). Compare labels become a single pill per divergence ("Rim: closed"), the long wording goes to the panel.
- Move the problem title and chips out of the 3D top-left (they overlap heads in several shots). Put them in the transport bar's left slot or a 28px strip.

### P1-3 Athletes: good silhouettes, weak acting
Evidence: `visual-01`, `visual-02`, `visual-06`.
- Frozen stances look like mannequins. Defenders at the moment stand in the same arms-wide "defend" pose (players #3, #5, #1), offensive players on the left both sit in the same deep skier squat, and hands are mitten-blobs. The jersey numbers and trim are good.
- The faces are dark flats with no brow/eye read; at 18-22% frame height (see P0-3) this will show.
- Fix (labAthlete.ts): (a) per-athlete pose seed so the squat depth, hand height and torso lean vary by +/-8% (`hands` param exists); (b) defenders get a head turn toward their man (look-at on the head bone, max 55 degrees) so ownership reads in the body, not only in the X-Ray; (c) the low man should visibly "see ball AND man": head toward the ball, one palm toward his man (pointing hand, 20 degrees outward); (d) add a 0.04 m outline/rim-light to the white jerseys, which blow out under the hot spot (`visual-01`, #5 and #1).
- Contrast: teal jerseys on the teal-grey paint (`#2f5a58`-ish) merge in X-Ray (`visual-02`). Paint to a charcoal #2a3036 at 70% roughness, or lighten the defender colour to #1fc7c0 in X-Ray.

### P1-4 Compare ghosts are cotton smears, not alternate worlds
Evidence: `visual-08-compare.png`, `visual-09-fix-hover-ghosts.png`.
- The "alternate world" is rendered as pale white blobs with dotted trails. You cannot tell which blob is which defender, and the divergence ribbons are long white swooshes that look like lens flares crossing the paint. There is no "I moved the helper here, so this closed, but this opened" read. The panel does the explaining, the world does not.
- Fix: draw the ghost with the same skinned mesh in a hologram material (fresnel rim `#b9c7ff`, alpha 0.22, additive, a 6 px scanline modulated by world y, `depthWrite:false`). For each divergent defender draw a "pin": a vertical 2.1 m line at the ghost position, a 0.28 m ring on the floor, and a curved arrow ghost-foot to real-foot (use `path` with `lift: 0.02`, `arrow:true`, width 0.07), labelled with the delta in metres ("1.4 m shallower"). Cap divergence trails to 0.9 s, not 1.6 s, and fade by age. Window discs (closed/opened) must carry a 3-character label at the disc ("-0.2 s" in good/threat colour), otherwise the green disc is mute.
- Add a seam: a vertical translucent plane (x = pass lane or screen line), world-left shows "before", world-right "after". See concept D below.

### P1-5 Panels are SaaS cards bolted to a 3D scene
Evidence: `visual-01`, `visual-08`, `visual-09`, `visual-10`.
- The 400px right-docked panel covers the right third on every step. The three stat tiles (0.38 / 0.81 / +0.43) have 4-line wrapped captions ("Closest / defender / needs") in tall mostly-empty cards. The fix list (`visual-09`) is 5 stacked bordered cards with tiny delta chips: a card grid, the thing the founder said to avoid. The left "Helper under the basket" form (`visual-05`) is a 330px form with a slider, floating nowhere near the player.
- Fix: (a) the problem becomes ONE sentence, 22px, pinned to the open player with a leader, plus one stat strip, three numbers on one 28px line ("0.38 layup · 0.81 closest · +0.43 late"). (b) the fix list becomes a floor-level radial or a bottom "film strip" of 5 thumbnails (live mini-worlds of each fix's end state, as in mockup 2 step 4); hovering one drives the ghost; clicking commits. (c) the low-man form becomes a world popover: 220px, anchored by a leader to his head, 3 controls max (help / how far = drag handle on the floor / return trigger), no title bar.

### P1-6 Timeline bar clutter
Evidence: `visual-09-fix-hover-ghosts.png`: "SCREEN PASSPROBLEM" collide. "PASS PASS 2" labels are 9px and collide at 1.8 s. Fix: show only the label of the nearest marker, 11px, with 8px side padding. The dev badge "N" sits on top of the bar on mobile.

### P1-7 Lens menu gives no hint of the idea and truncates it
Evidence: `visual-01-default-camera-moment.png` (the lens `idea` caption is clipped under the panel at y=280 in `g3/07-why.png`). Fix: show the idea as a 14px caption under the lens rail only for 4 s after change, in the world's top-centre; never behind a panel.

## P2

### P2-1 Gym dressing is flat
Evidence: `visual-01`, `visual-06`. Bleachers are black stairs, banners are flat decals, the side wall is an unbroken teal pad line, and there is no crowd/light haze beyond the vignette. The mockups' screens, scorer's table, a visible scoreboard (mockup 1 has "24") and a darker gym with practice-light pools read as a real gym. Fix: a scoreboard emissive texture on the far wall, 6 overhead pool lights as additive cones (cheap sprites), bleachers in 2 tones with 40 small dark capsule "bodies" at 25% fill. Keep it dark; the court should be the only warm thing.

### P2-2 Floor
The hot spot (right of the key) over-warms the wood to #d2893f in the right third and clips the paint to a muddy olive. Reduce spot intensity 15% and widen the cone angle 8 degrees, and add 0.06 roughness variation along the grain to avoid a plastic gloss on the far side.

### P2-3 Debug footer
"1 fps · cpu · calls · tris · x0.60" is visible in every screenshot (`?debug`). Fine in dev, but make sure it is off in the product build.

### P2-4 Mobile
Evidence: `visual-12-mobile.png` (390x780).
- The panel covers about 60% of the viewport, the world is a 25% strip, the top nav wraps ("Our System" on two lines), the right nav pill is clipped, the transport bar's "Run it" is cut off at the right edge, and the X-Ray/Camera menus are lost behind the sheet.
- Fix: the panel becomes a bottom sheet with a 22vh peek (one-sentence problem + one chip), draggable to 60vh. The lens rail becomes a horizontal chip row above the transport bar. Nav collapses to a logo + 3 icons. Director `inset` for mobile: `{top: 90, bottom: 0.3*vh}` so the focus sits in the top 60%. Pinch/drag to orbit remains off while the sheet is dragged.

## Break Mode drama
Evidence: `visual-10-break-result.png`, `visual-11-break-search.png`. (The animated search could not be captured at 1 fps; the golden-path shot at +2.5 s already shows the final state.)
- It is still "button → report". The world answer is one pink floor arrow, a red ring on the open man and a red edge vignette. There is no sense of 26 attempts, no cost to the defense, no moment of cracking. The camera lands on the screener's back (`visual-10`), a 2/3 body in the foreground, the actual hole is off-frame. The panel title "THEY BROKE IT" is good but arrives as a card, not a beat.
- The pink `attack` #ff3d6e path uses width 0.14, fine, but the grey "held" attempts at opacity 0.22 are invisible.
- Fix 1 (cheap, do now): show the search as a volley. Stagger the 26 `atk-*` paths 70 ms apart with `grow: 420`, held ones end in a 0.3 m blue "shield" ring (`defense`, 220 ms pulse) at the defender who stopped it, broke ones end in a red ring plus a 4 px camera shake (decay 250 ms). Keep a live counter "26 tried · 3 broke" bottom-centre, 40px display type.
- Fix 2: put the camera behind the defense for Break (azimuth about 3.14±0.3, elevation 0.30, fov 34) so the attack comes toward the viewer. Choose the framing from the witness: the open player + the late defender + the ball handler.

## Three better X-Ray concepts (implementable with existing primitives plus tiny additions)
Principle: the floor and the bodies carry the idea; text is a number at most.

### A. "Arrival map" (reach through time), replaces the 10 discs
- One idea: where could anyone get to, by when. Floor shader: for each of the 5 defenders pass `pos, vel, accel, maxSpeed, reaction` as uniforms (5 x vec4). Per fragment compute `t_i = travelTime(dist_i)` and `T = min_i t_i`. Colour by `floor(T/0.25)` bands (0-0.25 bright blue #3fb0ff at 30% → 1.0 s+ transparent). Result is a topographic map of "when someone arrives", re-computed every frame as the play moves.
- The ball's pass is a `path` (arrow, `lift 0.9`) with a moving comet. The receiver's ring is 'threat' if `T_receiver > t_ball`. A single red island appears exactly where the shooter stands. That red island IS the problem.
- Marks needed: none new (floor shader uniform + existing ring + path). Fallback with primitives only: 4 concentric `ring` marks per defender at r(0.25..1.0 s), `edge:true`, opacity 0.5/0.35/0.2/0.1, with the ring at the ball's flight time highlighted `focus`.

### B. "Duty strings" (ownership, transfers, conflict)
- One idea: every defender is tied to a job. Draw each tether at chest height (y 1.15) as a thin catenary ribbon (12 segments, sag 0.12 m) from his chest to his assignment's chest, width by priority (0.05/0.09). A torn defender gets 2 strings pulling opposite ways and his floor ring becomes an ellipse stretched along the two strings (ring with `radius` x 1.6 along one axis, tone `threat`), shown with a small "pulled" shake.
- Transfers are the show: when the assignment changes (switch, helper leaves, rotation) the string visibly detaches from the old man and whips across to the new man over 0.35 s (`path` with `grow`, then the tether takes over). Scrubbing time shows the strings re-tie.
- Open man = the one gold figure with no string, with a pulsing 'threat' ring and his one-liner "nobody is tied to him".
- Marks: `tether` with `lift` (y) + `sag` params (small addition), `ring` with `aspect`/`rotation` (small addition); existing `path` for the whip.

### C. "Glass corridors" (passes and drive space in one volume language)
- One idea: where can the ball go. Each pass is an extruded translucent prism following the actual flight arc (apex 2.2 m, passer's hand to receiver's catch point), thickness = time margin (`width = clamp(margin*1.2, 0.06, 0.7)`). Blocked lanes are hatched and grey, open lanes are bright 'good' glass with moving chevrons. A defender's reach hands cut a bite out of any lane they could get a hand on (a darker notch where `reach(t_ball)` intersects the lane).
- Drive space: the same glass as a lane from the ball handler to the rim with "gates" where the gap between defenders' reach discs is narrower than 1.0 m (draw a gate as two 1 m posts + a number).
- Marks: upgrade `lane` to take `arc` (y-apex) and `notch` (a list of t-values), plus `ring` for gates. The current flat lane at y 1.15-1.25 reads like a ribbon, not a volume.

### D (compare, bonus). "Seam"
A vertical translucent plane through the play lets viewers see before-world to the left, after-world to the right, with one hologram ghost per divergent defender and a pin line to his new spot; scrub the seam with a drag.

## Two Break Mode staging concepts

### 1. "Siege"
- Camera pulls behind the defense, low (az about 3.14, el 0.30), letterbox bars 6% top/bottom, background down 30%. Each defender wears a thin shield arc on the floor (blue ring, opacity 0.55).
- 26 attacks launch as red comets 70 ms apart (path + `grow: 420`, each with a bright head, `focus` tone). A held attack ends at a defender: his shield flares blue and the comet shatters into 6 grey sparks. A broken one lands on an open man: ring flash, a 4 px camera impulse and a 120 ms hit-stop.
- The winning attack replays at 0.25x for 0.6 s, then 1x. The key duty string snaps (concept B). Counter bottom-centre ("26 tried · 3 broke"). The panel appears only after the snap, title "They broke it" at 28px.

### 2. "Swarm replay"
- Freeze the play at the break moment. Fade in all 26 attempt-worlds as faint ghost pawns (instanced capsules for the screener/cutter only, ghost tone, 6% alpha), converging on the same frame, like a probability cloud around the offence.
- Broken attempts glow red and drift forward; held ones fade out. The cloud collapses onto the single worst attack, which steps out, solid, and plays out at full fidelity with the defender's string tearing.
- Camera: slow 40-degree orbit during the swarm, then a cut to the director framing (P0-3) for the replay. Cost: one InstancedMesh, no new GLB skeletons.

## Order of work
1. P0-1 lens marks render.
2. P0-2 control rail above the panel.
3. P0-3 director framing.
4. P0-4 baseline/POV/overhead cameras.
5. P1-1 stroke + hue split on marks.
6. P1-2 pinned labels.
7. P1-4 hologram ghosts and pins.
8. P1-5 panel to world-popover.
9. Break volley + behind-the-defense camera.
10. Mobile bottom sheet.
