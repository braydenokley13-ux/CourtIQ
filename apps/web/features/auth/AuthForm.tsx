'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { PrimaryButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { trackSignup } from './analytics'

interface AuthFormProps {
  mode: 'login' | 'signup'
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const isSignup = mode === 'signup'

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isSignup) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (signUpError) throw signUpError
        trackSignup('email')
        router.push('/onboarding')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        router.push('/home')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleOAuth() {
    setError(null)
    setGoogleLoading(true)
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: 'select_account' },
        },
      })
      if (oauthError) throw oauthError
      if (isSignup) trackSignup('google')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.')
      setGoogleLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-8">
        <h1 className="font-display font-bold text-[28px] tracking-[-0.5px] text-foreground">
          {isSignup ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="mt-2 font-ui text-[15px] text-foreground-dim">
          {isSignup
            ? 'Start training your basketball IQ today.'
            : 'Pick up where you left off.'}
        </p>
      </div>

      {/* Google OAuth */}
      <motion.button
        onClick={handleGoogleOAuth}
        disabled={googleLoading || loading}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.08 }}
        className={[
          'w-full h-[52px] rounded-xl border border-hairline-2 bg-bg-1',
          'flex items-center justify-center gap-3',
          'font-ui font-semibold text-[15px] text-foreground',
          'transition-colors hover:bg-bg-2',
          'disabled:opacity-50 disabled:cursor-default',
        ].join(' ')}
      >
        {googleLoading ? (
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.5}/>
            <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"/>
          </svg>
        ) : (
          <>
            <GoogleIcon />
            Continue with Google
          </>
        )}
      </motion.button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-hairline" />
        <span className="font-ui text-[12px] text-foreground-mute uppercase tracking-[0.5px]">or</span>
        <div className="flex-1 h-px bg-hairline" />
      </div>

      {/* Email / Password Form */}
      <form onSubmit={handleEmailSubmit} className="space-y-3">
        <div>
          <label className="block font-ui text-[13px] font-medium text-foreground-dim mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={[
              'w-full h-[48px] px-4 rounded-xl',
              'bg-bg-1 border border-hairline-2',
              'font-ui text-[15px] text-foreground placeholder:text-foreground-mute',
              'focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent',
              'transition-all',
            ].join(' ')}
          />
        </div>

        <div>
          <label className="block font-ui text-[13px] font-medium text-foreground-dim mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              placeholder={isSignup ? 'Min. 8 characters' : '••••••••'}
              className={[
                'w-full h-[48px] pl-4 pr-12 rounded-xl',
                'bg-bg-1 border border-hairline-2',
                'font-ui text-[15px] text-foreground placeholder:text-foreground-mute',
                'focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent',
                'transition-all',
              ].join(' ')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground-mute hover:text-foreground-dim transition-colors"
            >
              <Icon name={showPassword ? 'eye' : 'eye'} size={18} />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.12 }}
              className="flex items-start gap-2.5 p-3 rounded-xl bg-heat/10 border border-heat/20"
            >
              <Icon name="x" size={16} color="var(--heat)" className="mt-0.5 flex-shrink-0" />
              <p className="font-ui text-[13px] text-heat leading-snug">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <PrimaryButton type="submit" loading={loading} className="mt-2">
          {isSignup ? 'Create Account' : 'Sign In'}
        </PrimaryButton>
      </form>

      {/* Toggle link */}
      <p className="text-center font-ui text-[14px] text-foreground-dim pt-1">
        {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
        <a
          href={isSignup ? '/login' : '/signup'}
          className="text-brand font-semibold hover:text-brand-dim transition-colors"
        >
          {isSignup ? 'Sign in' : 'Sign up free'}
        </a>
      </p>

      <p className="text-center font-ui text-[12px] text-foreground-mute pt-2 leading-relaxed">
        By continuing, you agree to our{' '}
        <a href="/terms" className="underline hover:text-foreground-dim transition-colors">Terms</a>
        {' '}and{' '}
        <a href="/privacy" className="underline hover:text-foreground-dim transition-colors">Privacy Policy</a>.
      </p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
