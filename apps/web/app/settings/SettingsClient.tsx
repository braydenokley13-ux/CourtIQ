'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { resetIdentity } from '@/features/auth/analytics'
import type { Position, SkillLevel } from '@courtiq/core'

const ease = [0.22, 1, 0.36, 1]

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease, delay: i * 0.06 },
  }),
}

interface SettingsClientProps {
  email: string
  displayName: string
  emailUnsubscribed: boolean
  position: Position | null
  skillLevel: SkillLevel | null
}

export function SettingsClient({
  email,
  displayName: initialDisplayName,
  emailUnsubscribed: initialEmailUnsubscribed,
  position,
  skillLevel,
}: SettingsClientProps) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [emailUnsubscribed, setEmailUnsubscribed] = useState(initialEmailUnsubscribed)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [signingOut, setSigningOut] = useState(false)

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ display_name: displayName, email_unsubscribed: emailUnsubscribed }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Save failed')
      }
      setProfileMsg({ type: 'ok', text: 'Saved.' })
    } catch (err) {
      setProfileMsg({ type: 'err', text: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setProfileSaving(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordMsg(null)
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'err', text: 'Password must be at least 8 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'err', text: 'Passwords do not match.' })
      return
    }
    setPasswordSaving(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setPasswordMsg({ type: 'err', text: error.message })
    } else {
      setPasswordMsg({ type: 'ok', text: 'Password updated.' })
      setNewPassword('')
      setConfirmPassword('')
    }
    setPasswordSaving(false)
  }

  async function signOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    resetIdentity()
    router.push('/login')
    router.refresh()
  }

  return (
    <main className="min-h-dvh bg-bg-0 text-text">
      <div className="mx-auto max-w-xl px-5 pb-24 pt-10">
        <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp} className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[1.5px] text-text-dim">Settings</p>
            <h1 className="mt-1 font-display text-[28px] font-black tracking-tight">Your account</h1>
          </div>
          <Link href="/home" className="text-sm text-text-dim hover:text-text">← Home</Link>
        </motion.div>

        <motion.section custom={1} initial="hidden" animate="show" variants={fadeUp} className="mb-5 rounded-2xl border border-hairline-2 bg-bg-1 p-5">
          <h2 className="mb-3 font-display text-[16px] font-bold">Profile</h2>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block font-ui text-[12px] font-medium uppercase tracking-wide text-text-dim">Email</label>
              <div className="rounded-xl border border-hairline bg-bg-2 px-4 py-3 text-[14px] text-text-dim">{email}</div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="name" className="block font-ui text-[12px] font-medium uppercase tracking-wide text-text-dim">Display name</label>
              <input
                id="name"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="What should we call you?"
                className="block h-[46px] w-full rounded-xl border border-hairline-2 bg-bg-2 px-4 font-ui text-[14px] text-foreground placeholder:text-foreground-mute transition-colors hover:border-hairline focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>
            {(position || skillLevel) && (
              <div className="grid grid-cols-2 gap-3">
                {position && (
                  <div className="rounded-xl border border-hairline bg-bg-2 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-text-dim">Position</p>
                    <p className="mt-0.5 text-[14px] font-semibold">{position}</p>
                  </div>
                )}
                {skillLevel && (
                  <div className="rounded-xl border border-hairline bg-bg-2 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-text-dim">Level</p>
                    <p className="mt-0.5 text-[14px] font-semibold">{skillLevel}</p>
                  </div>
                )}
              </div>
            )}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-hairline bg-bg-2 p-4">
              <input
                type="checkbox"
                checked={!emailUnsubscribed}
                onChange={e => setEmailUnsubscribed(!e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span>
                <span className="block text-[14px] font-semibold">Email updates</span>
                <span className="mt-0.5 block text-[12px] text-text-dim">Session summaries, weekly digest, streak reminders.</span>
              </span>
            </label>
            <AnimatePresence>
              {profileMsg && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className={`font-ui text-[13px] ${profileMsg.type === 'ok' ? 'text-brand' : 'text-[#FF4D6D]'}`}
                >
                  {profileMsg.text}
                </motion.p>
              )}
            </AnimatePresence>
            <button
              type="submit"
              disabled={profileSaving}
              className="w-full rounded-xl bg-brand py-3 font-display text-[14px] font-bold uppercase tracking-[0.3px] text-brand-ink disabled:opacity-50"
            >
              {profileSaving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </motion.section>

        <motion.section custom={2} initial="hidden" animate="show" variants={fadeUp} className="mb-5 rounded-2xl border border-hairline-2 bg-bg-1 p-5">
          <h2 className="mb-3 font-display text-[16px] font-bold">Change password</h2>
          <form onSubmit={changePassword} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="new-pw" className="block font-ui text-[12px] font-medium uppercase tracking-wide text-text-dim">New password</label>
              <input
                id="new-pw"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="block h-[46px] w-full rounded-xl border border-hairline-2 bg-bg-2 px-4 font-ui text-[14px] text-foreground placeholder:text-foreground-mute transition-colors hover:border-hairline focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirm-pw" className="block font-ui text-[12px] font-medium uppercase tracking-wide text-text-dim">Confirm password</label>
              <input
                id="confirm-pw"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="block h-[46px] w-full rounded-xl border border-hairline-2 bg-bg-2 px-4 font-ui text-[14px] text-foreground placeholder:text-foreground-mute transition-colors hover:border-hairline focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>
            <AnimatePresence>
              {passwordMsg && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className={`font-ui text-[13px] ${passwordMsg.type === 'ok' ? 'text-brand' : 'text-[#FF4D6D]'}`}
                >
                  {passwordMsg.text}
                </motion.p>
              )}
            </AnimatePresence>
            <button
              type="submit"
              disabled={passwordSaving || newPassword.length === 0}
              className="w-full rounded-xl border border-hairline bg-bg-2 py-3 font-display text-[14px] font-bold uppercase tracking-[0.3px] text-foreground transition-colors hover:bg-bg-3 disabled:opacity-50"
            >
              {passwordSaving ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </motion.section>

        <motion.section custom={3} initial="hidden" animate="show" variants={fadeUp} className="rounded-2xl border border-hairline-2 bg-bg-1 p-5">
          <h2 className="mb-3 font-display text-[16px] font-bold">Session</h2>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="w-full rounded-xl border border-[rgba(255,77,109,0.3)] bg-[rgba(255,77,109,0.06)] py-3 font-display text-[14px] font-bold uppercase tracking-[0.3px] text-[#FF4D6D] transition-colors hover:bg-[rgba(255,77,109,0.12)] disabled:opacity-50"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </motion.section>
      </div>
    </main>
  )
}
