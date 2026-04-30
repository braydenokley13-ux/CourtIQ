import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/auth']

// Phase F0 — `/dev` hosts the screenshot QA preview route. The page
// itself returns 404 in production unless `ENABLE_DEV_ROUTES=1` is
// set, so leaving the prefix outside the auth flow only affects local
// QA. We short-circuit before touching Supabase so the screenshot
// harness can run without configuring env vars.
const DEV_PUBLIC_PREFIX = '/dev'

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function isDevPublicPath(pathname: string) {
  return pathname === DEV_PUBLIC_PREFIX || pathname.startsWith(DEV_PUBLIC_PREFIX + '/')
}

const PROTECTED_PREFIXES = [
  '/home',
  '/profile',
  '/train',
  '/academy',
  '/leaderboard',
  '/settings',
  '/onboarding',
  '/reset-password',
]

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const { pathname } = request.nextUrl

  // Phase F0 — let dev-only QA routes through without touching
  // Supabase. The page guards `NODE_ENV` so a leaked deploy still
  // 404s; keeping middleware out of the path lets local QA run with
  // an empty `.env` file.
  if (isDevPublicPath(pathname)) {
    return supabaseResponse
  }

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

  // Refreshes session — required for Server Components to read auth state correctly
  const { data: { user } } = await supabase.auth.getUser()
  const onboarded = user?.user_metadata?.onboarded === true

  // Root → redirect based on auth + onboarding state
  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = user ? (onboarded ? '/home' : '/onboarding') : '/login'
    return NextResponse.redirect(url)
  }

  // Authenticated users hitting auth pages → send into the app
  // (exception: /auth/callback handles its own redirect)
  if (user && isPublicPath(pathname) && !pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = onboarded ? '/home' : '/onboarding'
    return NextResponse.redirect(url)
  }

  // Unauthenticated users hitting protected routes → send to login
  if (!user && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authenticated but not onboarded → force onboarding
  // (/reset-password is exempt so a user mid-password-reset isn't forced through onboarding)
  if (
    user &&
    !onboarded &&
    isProtectedPath(pathname) &&
    !pathname.startsWith('/onboarding') &&
    !pathname.startsWith('/reset-password')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/onboarding'
    return NextResponse.redirect(url)
  }

  // Already onboarded but visiting /onboarding → send to home
  if (user && onboarded && pathname.startsWith('/onboarding')) {
    const url = request.nextUrl.clone()
    url.pathname = '/home'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.svg|manifest.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
