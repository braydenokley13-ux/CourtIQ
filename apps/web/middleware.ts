import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const AUTH_ONLY_PATHS = ['/login', '/signup']
const PROTECTED_PREFIXES = ['/home', '/train', '/academy', '/profile', '/leaderboard', '/settings']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(
            ({ name, value, options }: { name: string; value: string; options: CookieOptions }) =>
              supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Authenticated users shouldn't see login/signup
  if (AUTH_ONLY_PATHS.some((p) => pathname.startsWith(p)) && user) {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  // Onboarding requires auth — send unauthenticated users to signup
  if (pathname.startsWith('/onboarding') && !user) {
    return NextResponse.redirect(new URL('/signup', request.url))
  }

  // (app)/* routes require auth
  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) && !user) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
