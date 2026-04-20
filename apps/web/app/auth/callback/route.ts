import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/onboarding'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      const { user } = data

      // Ensure User + Profile rows exist (safety net alongside the DB trigger).
      await prisma.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          email: user.email!,
          display_name: user.user_metadata?.full_name ?? null,
          profile: {
            create: {
              iq_score: 500,
              xp_total: 0,
              level: 1,
              current_streak: 0,
              longest_streak: 0,
              streak_freeze_count: 0,
            },
          },
        },
        update: {},
      })

      // Check if onboarding is complete (profile has been calibrated)
      const profile = await prisma.profile.findUnique({
        where: { user_id: user.id },
        select: { iq_score: true },
      })

      // If IQ > 500 the calibration has already been set — go home
      const destination = profile && profile.iq_score > 500 ? '/home' : next
      return NextResponse.redirect(new URL(destination, origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin))
}
