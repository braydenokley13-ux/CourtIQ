'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// PII guardrail (ARCHITECTURE.md §10): only email + display_name are permitted.
// Redact anything that looks like an email in arbitrary event property values.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

function sanitizeProperties(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    out[k] =
      typeof v === 'string' && k !== 'email' && EMAIL_RE.test(v)
        ? '[redacted]'
        : v
    EMAIL_RE.lastIndex = 0
  }
  return out
}

function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ph = usePostHog()

  useEffect(() => {
    if (!pathname || !ph) return
    const qs = searchParams.toString()
    ph.capture('$pageview', {
      $current_url: window.location.origin + pathname + (qs ? `?${qs}` : ''),
    })
  }, [pathname, searchParams, ph])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
      capture_pageview: false,
      sanitize_properties: sanitizeProperties,
      loaded(ph) {
        if (process.env.NODE_ENV === 'development') ph.debug()
      },
    })
  }, [])

  // Tie the PostHog identity to the Supabase session so events downstream are
  // attached to a real user. PII guardrail (ARCHITECTURE.md §10): only email +
  // display_name are sent as traits.
  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (user) {
        posthog.identify(user.id, {
          email: user.email ?? '',
          name: (user.user_metadata?.full_name as string | undefined) ?? '',
        })
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
        const user = session.user
        posthog.identify(user.id, {
          email: user.email ?? '',
          name: (user.user_metadata?.full_name as string | undefined) ?? '',
        })
      }
      if (event === 'SIGNED_OUT') {
        posthog.reset()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <PHProvider client={posthog}>
      <Suspense>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  )
}
