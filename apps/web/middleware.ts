import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/auth']

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
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
