/**
 * V3 P2 — first-time intro dismiss helpers.
 *
 * Pure wrappers around localStorage so the IntroCardsModal can flip the
 * "seen it" state without sprinkling `try / catch` across the JSX. The
 * helpers degrade silently when storage is disabled (private mode,
 * Safari ITP, permission denied) — the modal still closes for the
 * current session, the dismissal just won't survive a refresh.
 *
 * Versioned key (`-v1`) lets us re-show the walkthrough on a future
 * major rev without losing the previous dismissal log.
 */

export const INTRO_DISMISS_KEY = 'courtiq:intro-dismissed-v1'

export function hasDismissedIntro(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(INTRO_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissIntro(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(INTRO_DISMISS_KEY, '1')
  } catch {
    // Storage disabled — see module note.
  }
}

export function clearIntroDismissal(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(INTRO_DISMISS_KEY)
  } catch {
    // Storage disabled — see module note.
  }
}
