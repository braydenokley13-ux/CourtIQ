# Real coach test — protocol (checkpoint gate A)

Status: **NOT YET RUN.** Agent walkthroughs (`critique/coach-usability.md`, `scripts/qa-local/golden2.mjs`) are proxies only. This gate is passed only by a real high-school coach.

## Setup (5 minutes, before the coach arrives)
1. Open CourtIQ on an ordinary school/home laptop (not a gaming PC). Use Chrome or Edge, full screen.
2. First open `/?bench` once and note the numbers (see `perf/README.md`). Then open `/` fresh — clear site data so it starts empty (no saved answers).
3. Language stays on **Simple words** (default). Do not explain anything.
4. Start a screen + audio recording (with consent). Keep this sheet out of sight.

## The only instruction
> "Show me how you would guard this."

Then stay quiet. If the coach asks a question, answer with: "What would you try?" Only intervene if he is stuck for more than 90 seconds, and note it.

## Observe — did he, unaided…
| # | Behavior | Time | Unaided? | Notes (what he said) |
|---|---|---|---|---|
| 1 | Choose / recognize an answer (picked a card he recognized, named it) | | Y / N | |
| 2 | Run it (saw the play, reached "Here's the problem") | | Y / N | |
| 3 | Understand what CourtIQ shows — ask him: "What happened there?" Correct = he names the open player and why (e.g. "my helper left his man") | | Y / N | |
| 4 | Change something (picked a fix, clicked a defender, dragged the help spot) | | Y / N | |
| 5 | Rerun it and read the tradeoff ("fixed X, gave up Y") | | Y / N | |
| 6 | Ask his own **"what if…?"** (verbatim) | | Y / N | |
| 7 | Tried Break My Defense | | Y / N | |
| 8 | Saved it under his own word | | Y / N | |
| 9 | Opened Teach and showed one player's job | | Y / N | |

## Listen for
- Words he used for the coverage (record them — they become terminology aliases).
- Any moment he says the basketball is wrong ("nobody plays it like that"). Record the exact time/state — this is the most valuable data.
- Any number he misreads.
- The target reaction: **"Can we use this before our next game?"** — or what he'd need first.

## After (5 minutes)
1. "What would you use this for this week?"
2. "What did it get wrong about basketball?"
3. "What was confusing?"
4. "Would you show this to your players? Which part?"

## Pass criteria for gate A
Behaviors 1–5 unaided within ~5 minutes, and at least one self-generated "what if?" (6). Record failures as issues against the exact screen.

## Known risks going in (be ready to note them)
- Only one problem is installed (high middle ball screen). Other topics show as "Next up".
- ICE is presented as "force away" on a middle screen; some coaches only ICE side screens.
- Hedge is hidden (not yet distinct in the engine).
- Real-device frame rate has not been validated; if the play stutters, note the laptop model and the `?bench` numbers.
