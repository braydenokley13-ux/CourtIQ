# Rewards & dopamine system

CourtIQ's core loop is **Learn → Practice → Win → Level Up → Come Back**. The
reward system exists to make every right answer feel good and every wrong
answer feel recoverable.

## Five reward signals

| Signal              | Where it shows up                                        | Service                          |
| ------------------- | -------------------------------------------------------- | -------------------------------- |
| **XP**              | floating toast in `/train`, summary card, home dashboard | `lib/services/xpService.ts`      |
| **IQ**              | header in `/train`, IQ delta on summary, home headline   | `lib/services/iqService.ts`      |
| **Streak (🔥)**     | header in `/train`, home stat card                       | `lib/services/streakService.ts`  |
| **Mastery**         | "% right" on `/academy` cards, mastered checkmark        | `lib/services/masteryService.ts` |
| **Badges**          | inline in `/train` feedback, email + home (when added)   | `lib/services/badgeService.ts`   |

## In-session feedback

In `/train`:

1. Picking a choice immediately shows a feedback panel with:
   - **Praise text** ("Nice read!", "Smart move!" / "So close.", "Not quite.")
   - **+XP** delta (orange) and **IQ** delta (purple)
   - The correct choice highlighted in green; a wrong pick highlighted in red
2. A floating reward toast pops at the top of the screen with `+XP`. It
   auto-dismisses.
3. After 2 correct in a row, a **combo flame** banner appears: "3 in a row 🔥".
4. The streak count is shown in the top header so kids see the flame growing.

## End-of-session screen (`/train/summary`)

Shows:

- Headline rank ("Lights out", "Big game", "Solid effort", "Keep working", "Let's run it back") based on accuracy
- Score (`correct / total`)
- Accuracy %, duration in seconds
- XP earned, IQ change
- "What just happened" recap (plays, XP, IQ, mastery)
- "Try next" suggestion — the next in-progress / new module that isn't the one
  just trained, fetched live from `/api/academy/modules`
- Two big actions: **Play again** (same concept) and **Back to lessons**

## Tone rules

Every reward string is short and uses kid-friendly language:

- Bad: "Module mastery threshold achieved."
- Good: "You mastered this lesson."

- Bad: "Your weak-side defender has shifted visual attention."
- Good: "Your defender looked away. What do you do?"

If a string is more than ~80 characters or uses jargon, rewrite it.

## Wiring a new reward

1. Compute the new signal in the appropriate service inside the
   `prisma.$transaction` of `app/api/session/[id]/attempt/route.ts`.
2. Add it to the JSON response.
3. Surface it in `/train` (header, feedback panel, or floating toast) and in
   `/train/summary` (recap line or stat card).
4. Keep copy under 6 words. Use one of the existing accent colors
   (`brand`, `xp`, `iq`, `heat`, `info`).
