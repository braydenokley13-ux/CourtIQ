# CourtIQ Defense Lab: visual and interaction decisions

This is a design critique and implementation recommendation, not market evidence. It uses the supplied product brief, the SEAM III artifact, and the existing CourtIQ source/screenshots. The attached HTML is a prototype substrate; its interface is not a requirement.

## What the current artifacts teach us

SEAM III's court is constrained by a permanent 326 px inspector, seven equally weighted offensive branch buttons, multiple always-visible explanations, and text frequently between 6 and 10 px. The useful causal editing model is expressed as “fork,” “paired worlds,” and “nominal assumptions.” That language asks a coach to learn the research apparatus before testing a basketball answer. Keep the engine's history preservation; expose it as “Change from this moment.”

The existing CourtIQ shell emphasizes dark glass, neon progression, replay modules, and player recognition quizzes. Those are sensible for a training game but establish the wrong hierarchy for a coach's strategy work. The inspected fullscreen screenshot also leaves most of the viewport black while the court occupies a shallow strip. A full-size canvas is insufficient: camera framing must fill the space with meaningful basketball geometry.

## Three independently viable directions

### 1. Editorial sports science

**Composition:** warm paper surrounds a sunlit court. A 62 px masthead, one typographic problem title, an almost unframed court, and a two-line experiment deck. No sidebar in the default state. Text sits on paper, not on translucent cards. Results read as a short basketball explanation with a thin evidence link.

**Type:** a calm contemporary sans for the interface, a heavier compact sans for 28–32 px problem titles, and tabular numbers only for time. Inter/system UI are acceptable fallbacks. Interface labels remain 12–14 px; metadata never drops below 10 px. Serif decorative headlines would slow scanning and make the product feel like a publication.

**Palette:** paper `#f5f4ef`, warm white `#fffefa`, ink `#182d34`, muted `#667873`, soft rule `#d7ddd7`, vermilion action `#d75135`, defensive teal `#0d7872`. Materials and court shadows provide depth. No neon or glow.

**Controls:** “Drop · Over · Tag · X-out” is one editable basketball sentence. A visible Run button owns the deck. X-ray toggles one relevant spatial layer. Selecting a rule opens a temporary compact drawer.

**Strength:** highest first-use clarity and coach trust. Weakness: if the gym and players are weak, tasteful paper styling makes the simulation feel more obviously synthetic. It must not become a report page with a court illustration.

### 2. Premium broadcast technology

**Composition:** a dramatic but naturally lit gym fills the viewport below a white masthead. Small opaque white broadcast controls sit at safe edges. A lower-third explanation appears only at the stress point. Playback has a confident central control; cameras favor broadcast and sideline framing.

**Type:** a condensed sports headline could make the moment feel decisive, paired with an ordinary sans for all control language. Avoid all-caps sentences and densely tracked microtype.

**Palette:** bright white chrome, charcoal court surrounds, natural maple, teal defense, warm neutral offense, and a disciplined red-orange action accent. Contrast comes from materials and light rather than phosphorescent markers.

**Controls:** large Run/play control, timestamped replay chapters, camera presets, and brief animated responsibility transfers. The offense's continuation is presented at the current read rather than in a seven-button scoreboard.

**Strength:** strongest emotional demonstration and teaching replay. Weakness: broadcast framing implies “watch this play.” Persistent lower-thirds and HUD elements compete with direct manipulation, and a dramatic camera can conceal weakside responsibility. Better as a presentation/teaching camera language than as the main authoring shell.

### 3. Spatial engineering workbench

**Composition:** one large spatial workspace on warm gray paper, with the court as an object that the coach can inspect. A narrow left tool group, top camera presets, and a low experiment deck. Selection reveals context next to the object or in a temporary 280–320 px drawer. The timeline is treated as a causal boundary, not a media scrubber alone.

**Type:** neutral sans, restrained tabular time, clear sentence-case verbs. Engineering clarity without CAD terminology, coordinate tables, or graph editors.

**Palette:** paper `#f5f4ef`, ink navy, subdued teal for selected defensive structure, vermilion for an applied change/run, and pale gray for the previous answer. X-ray uses solid/dashed paths and transparent geometric volumes with a small explanatory legend.

**Controls:** click a defender, read the responsibility, freeze, drag a movement target, and Run again. The target appears as a floor mark plus route; the athlete stays at the frozen position until execution resumes. A vertical “From this moment” boundary and prior-answer ghost make causality understandable. Nudge controls give keyboard and non-drag alternatives.

**Strength:** highest manipulability and spatial understanding. Weakness: importing CAD conventions too literally creates a difficult software workbench. Every selector must remain a basketball decision (“Tag depth,” “First rotation”), and diagnostic geometry stays behind Why.

## Comparison and synthesis

| Criterion | Editorial science | Broadcast technology | Spatial workbench |
|---|---|---|---|
| Court prominence | Strong if nearly unframed | Strong, but overlays can compete | Strongest with transient inspector |
| Manipulation | Clear but needs affordances | Often reads as passive viewing | Strongest selection/target grammar |
| Coach confidence | Strongest language and hierarchy | Visceral, can overstate certainty | Strong if physics assumptions stay secondary |
| Spatial understanding | Clean comparison | Camera can obscure weakside detail | Strongest time + role + geometry connection |
| Experiment speed | Strong focused deck | Replay controls can dominate | Strong direct edit/run cycle |
| Main failure | Beautiful static illustration | Sports HUD / replay product | CAD application wearing basketball words |

**Recommendation:** use the spatial workbench's behavior, the editorial direction's shell, and broadcast cinematography in the world. Do not average all three interfaces. The default is a bright, quiet workspace; after Run, the athletes and one meaningful stress point carry the energy.

## Concrete desktop geometry

At 1280 × 800, budget about 62 px for the masthead, 70 px for the problem title/context, 130 px for the experiment deck, and 22 px for the quiet status/footer. The court retains about 516 px of height and nearly the full width. Its transport floats along the bottom and is at most 60 px tall. A larger display should enlarge the world rather than inflate controls or introduce additional panels.

- Masthead: wordmark and “Defense Lab” at left; Lab / Teach only if both work; Saved answers and a compact coach identity at right. Do not duplicate the same mode in two navigation systems.
- Problem context: “BALL SCREEN / HELP & ROTATION” in a 10 px eyebrow; “High P&R → Weakside lift” in 28–32 px type; one short line explaining the current test. This text remains outside the court's central playing area.
- Court: compact camera group at upper right; a three-tool Select / X-ray / Compare group at upper left or a horizontal equivalent; no permanently open analysis column. Default labels show stable numbers, while selection reveals full role names.
- Experiment deck: current answer and an Edit rules action, followed by coverage options and four short rule summaries. Run is the largest filled action. Save becomes useful after one executed answer; Teach and Stress testing open their own focused temporary surfaces.
- Stress insight: one short headline and one supporting sentence. The relevant defender and threat are emphasized in the world. A small “Why?” exposes assumptions and evidence. Avoid multiple metric cards.
- Rule drawer: temporary, no wider than 320 px. It shows the selected basketball rule, 2–4 concrete choices or one semantic slider, and Run again. It closes on Escape and restores focus to its opener. At narrow desktop widths it overlays the edge, leaving the court usable rather than permanently shrinking it.

## Coaching authoring and onboarding

The first screen already contains a ten-player high P&R situation and an executable Drop / Over / Tag / X-out answer. Ask only “How do you guard high ball screens?” Choosing a coverage immediately changes the editable rules and visible responsibilities. Run takes the coach to the first useful observation without a team profile, film upload, roster, project name, or onboarding carousel.

Rules are progressive: coverage first; POA, big, low man, and first rotation next; timing and custom cues after the coach selects a player or freezes a moment. Terminology aliases belong in team preferences later. The underlying engine may use conditions and transitions, but the coach sees “On the skip, who takes the corner?”

Coverage changes from the beginning and edits from a frozen moment are visibly different. The latter reads “Change from 1.20 s”; past timeline frames become subtly muted and immutable. A target marker denotes an instruction, not an instantaneous relocation. The before-answer ghost is an explicitly labeled comparison, not a second live athlete.

The offense should feel connected: “Roll → low-man tag → weakside lift → skip → extra pass” appears as a continuation with a selected read. Counter selection changes the next basketball response. Seven unrelated cards would teach a finite movie library instead of an adversarial model.

## Player teaching cues

Teach is a deliberate role view with one highlighted defender and one responsibility sentence: “Low man: tag the roller, then take the lift as the backside defender takes the corner.” Other players stay visible for context. A thin outlined next-responsibility mark and brief transfer arrow make who-owns-what legible without redrawing the entire defense.

Use one checkpoint at a time, for example “The skip leaves the handler. Who owns the corner now?” Pausing, role selection, overhead, player view, and slow motion serve that prompt. Do not carry coach experiment controls, saved-answer lists, or analytics into the player view. Share/save a canonical answer first, then teach it with the same engine state.

## Accessibility and performance acceptance criteria

- Every button has a text label or accessible name; active modes expose pressed state. Team color also has stable player identifiers and distinct path patterns. Holds / Thin / Breaks always appear as words.
- Focus treatment uses a clear teal/ink ring against paper. Controls have 36–44 px interaction areas; labels remain legible at 100% scale. Contrast targets WCAG AA for text and 3:1 for control boundaries and selected states.
- Space toggles play outside text inputs. Left/right arrows step time when the timeline is focused. Escape closes drawers/modal modes. Direct movement has arrow/nudge alternatives and announces the selected role and change.
- Reduced-motion users get instant camera changes and no decorative pulses; playback remains explicitly controlled. A short readable DOM summary mirrors the current responsibility and result so the canvas is not the only source of meaning.
- Avoid permanent backdrop blur and heavy full-screen shadow stacks. The world should degrade shadow/antialiasing quality before changing the authoring layout. Camera framing, responsive resize, and render resolution need verification at both 1280 × 800 and 1440 × 900.

## Visual review gates

Reject a screen if the court occupies less than the main visual field, if the selected rule is unclear, if the next Run requires searching, if all x-ray layers appear simultaneously, if five metrics distract from one tradeoff, or if a selected athlete is mistaken for an instant relocation. Verify the resting screen, paused stress point, edited target, compared answer, and Teach role—not merely the prettiest initial frame.
