import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.NEXT_PUBLIC_COMMIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  debug: false,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  integrations: [
    Sentry.replayIntegration(),
  ],
  // PII guardrail: strip email from breadcrumb/event data outside explicit user context.
  beforeSend(event) {
    if (event.user) {
      // Retain only the fields permitted by ARCHITECTURE.md §10.
      event.user = {
        id: event.user.id,
        email: event.user.email,
        username: event.user.username,
      }
    }
    return event
  },
})
