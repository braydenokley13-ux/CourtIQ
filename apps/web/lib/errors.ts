/**
 * Map raw error codes to friendly, kid-readable messages.
 * Anything we don't recognise falls back to a generic friendly line.
 */
export type FriendlyError = { title: string; message: string }

const FRIENDLY: Record<string, FriendlyError> = {
  CONTENT_NOT_LOADED: {
    title: 'Almost ready',
    message: 'Training is loading. Try again in a few seconds.',
  },
  INVALID_CONCEPT: {
    title: 'Lesson not found',
    message: 'That lesson was not found. Pick another from the Academy.',
  },
  NETWORK_ERROR: {
    title: 'Connection issue',
    message: 'Looks like the internet hiccupped. Try again.',
  },
  Unauthorized: {
    title: 'Sign in first',
    message: 'You need to sign in to keep training.',
  },
  NotFound: {
    title: 'Not found',
    message: 'We couldn’t find that. Head back and try again.',
  },
}

const GENERIC: FriendlyError = {
  title: 'Something went off-script',
  message: 'Try again in a moment. If it keeps happening, refresh the page.',
}

export function friendlyError(code?: string | null, message?: string | null): FriendlyError {
  if (code && FRIENDLY[code]) return FRIENDLY[code]
  if (message && message.length > 0 && message.length < 120) {
    return { title: 'Heads up', message }
  }
  return GENERIC
}
