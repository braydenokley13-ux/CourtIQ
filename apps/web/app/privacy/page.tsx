import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — CourtIQ',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 font-display text-[18px] font-bold text-foreground">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="font-ui text-[14px] leading-relaxed text-foreground-dim">{children}</p>
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="font-ui text-[14px] leading-relaxed text-foreground-dim">
      {children}
    </li>
  )
}

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-bg-0 px-5 py-16">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/signup"
            className="mb-8 inline-flex items-center gap-1.5 font-ui text-[13px] font-semibold text-brand transition-opacity hover:opacity-80"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back
          </Link>

          <div className="mt-6 flex items-center gap-3">
            <svg width="28" height="28" viewBox="0 0 40 40" fill="none" aria-hidden>
              <circle cx="20" cy="20" r="19" stroke="#3BE383" strokeWidth="1.5" strokeOpacity="0.6" />
              <path d="M20 1C20 1 20 39 20 39" stroke="#3BE383" strokeWidth="1.5" strokeOpacity="0.4" />
              <path d="M1 20C1 20 39 20 39 20" stroke="#3BE383" strokeWidth="1.5" strokeOpacity="0.4" />
              <path d="M3.5 10C11 14 11 26 3.5 30" stroke="#3BE383" strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" />
              <path d="M36.5 10C29 14 29 26 36.5 30" stroke="#3BE383" strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" />
              <circle cx="20" cy="20" r="7" stroke="#3BE383" strokeWidth="1.5" strokeOpacity="0.5" />
            </svg>
            <h1 className="font-display text-[30px] font-bold tracking-tight text-foreground">
              Privacy Policy
            </h1>
          </div>
          <p className="mt-2 font-ui text-[13px] text-foreground-mute">
            Effective date: May 7, 2026
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-hairline" />

        <Section title="1. Information We Collect">
          <P>We collect the following information when you use CourtIQ:</P>
          <ul className="ml-4 mt-2 list-disc space-y-2 pl-2">
            <Li><strong className="text-foreground">Account information:</strong> your username (chosen at signup), optional display name, and password (stored as a secure hash — we never see your plaintext password).</Li>
            <Li><strong className="text-foreground">Recovery email (optional):</strong> only collected if you choose to add one. Used solely for password reset — we do not use it for marketing without your explicit consent.</Li>
            <Li><strong className="text-foreground">Profile details (optional):</strong> basketball position, skill level, and birth year, collected during onboarding to personalize your training.</Li>
            <Li><strong className="text-foreground">Gameplay data:</strong> scenario attempts, answer choices, response times, IQ scores, XP earned, streaks, badge progress, and session history. This data drives your personalized training and IQ score.</Li>
            <Li><strong className="text-foreground">Usage data:</strong> device type, browser, pages visited, and feature interactions, collected automatically to help us improve the Service.</Li>
            <Li><strong className="text-foreground">Error reports:</strong> anonymous technical data when errors occur, used solely for debugging.</Li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Information">
          <P>We use the information we collect to:</P>
          <ul className="ml-4 mt-2 list-disc space-y-2 pl-2">
            <Li>Create and maintain your account.</Li>
            <Li>Personalize your training based on your skill level, position, and performance history.</Li>
            <Li>Calculate and update your Basketball IQ score.</Li>
            <Li>Send password reset emails (only when you request one, and only if you have provided a recovery email).</Li>
            <Li>Send streak reminders and training summaries (only if you have provided a recovery email and have not opted out).</Li>
            <Li>Analyze usage trends to improve the Service.</Li>
            <Li>Detect and prevent fraud or abuse.</Li>
          </ul>
          <P>We do not sell your personal information to third parties. Ever.</P>
        </Section>

        <Section title="3. Data Sharing">
          <P>
            We share your data only with the service providers necessary to operate CourtIQ. Each provider is bound by data processing agreements and is prohibited from using your data for their own purposes.
          </P>
          <ul className="ml-4 mt-2 list-disc space-y-2 pl-2">
            <Li><strong className="text-foreground">Supabase</strong> — authentication and database hosting. Stores your account credentials and all gameplay data.</Li>
            <Li><strong className="text-foreground">Vercel</strong> — web hosting and edge functions.</Li>
            <Li><strong className="text-foreground">PostHog</strong> — product analytics. Receives anonymized usage events (e.g. &ldquo;scenario completed&rdquo;) to help us understand how the product is used. PostHog is configured to respect Do Not Track signals.</Li>
            <Li><strong className="text-foreground">Sentry</strong> — error tracking. Receives anonymous technical error reports when the app crashes or encounters unexpected states.</Li>
            <Li><strong className="text-foreground">Gmail / Google Workspace</strong> — transactional email delivery. Only used when you have provided a recovery email, to send password reset links or training notifications.</Li>
          </ul>
          <P>
            We may disclose your information if required by law or to protect the rights, property, or safety of CourtIQ or its users.
          </P>
        </Section>

        <Section title="4. Data Retention">
          <P>
            We retain your account and gameplay data for as long as your account is active. If you delete your account, we will delete your personal information within 30 days, except where we are required to retain it by law or for legitimate business purposes (such as resolving disputes).
          </P>
          <P>
            Anonymized or aggregated data (e.g. aggregate accuracy rates across all users for a given scenario) may be retained indefinitely and is not personally identifiable.
          </P>
        </Section>

        <Section title="5. Children&apos;s Privacy">
          <P>
            CourtIQ is designed for basketball players of all ages. We are committed to protecting the privacy of younger users and collect only the minimum information necessary to operate the Service. We do not knowingly collect sensitive personal information from any user beyond what is described in this policy.
          </P>
          <P>
            No email address is required to create an account. A recovery email is optional and only used for password resets. If you believe a child has provided information to us that should be removed, please contact us at <a href="mailto:support@courtiq.app" className="text-brand underline underline-offset-2 hover:opacity-80">support@courtiq.app</a>.
          </P>
        </Section>

        <Section title="6. Security">
          <P>
            We take reasonable technical and organizational measures to protect your data against unauthorized access, alteration, disclosure, or destruction. These include encrypted connections (HTTPS), hashed password storage, and access controls on our database.
          </P>
          <P>
            No method of transmission over the internet or method of electronic storage is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.
          </P>
        </Section>

        <Section title="7. Your Rights">
          <P>You have the right to:</P>
          <ul className="ml-4 mt-2 list-disc space-y-2 pl-2">
            <Li><strong className="text-foreground">Access</strong> the personal data we hold about you.</Li>
            <Li><strong className="text-foreground">Correct</strong> inaccurate data (via your account settings).</Li>
            <Li><strong className="text-foreground">Delete</strong> your account and associated personal data.</Li>
            <Li><strong className="text-foreground">Opt out</strong> of non-essential emails (via your account settings).</Li>
          </ul>
          <P>
            To exercise any of these rights, contact us at{' '}
            <a href="mailto:support@courtiq.app" className="text-brand underline underline-offset-2 hover:opacity-80">
              support@courtiq.app
            </a>
            .
          </P>
        </Section>

        <Section title="8. Changes to This Policy">
          <P>
            We may update this Privacy Policy from time to time. We will notify you of material changes by updating the effective date above. Your continued use of the Service after changes are posted constitutes your acceptance of the revised policy.
          </P>
        </Section>

        <Section title="9. Contact">
          <P>
            Questions or concerns about this Privacy Policy? Contact us at{' '}
            <a href="mailto:support@courtiq.app" className="text-brand underline underline-offset-2 hover:opacity-80">
              support@courtiq.app
            </a>
            .
          </P>
        </Section>

        {/* Footer */}
        <div className="mt-16 border-t border-hairline pt-8 text-center">
          <p className="font-ui text-[12px] text-foreground-mute">
            Also see our{' '}
            <Link href="/terms" className="text-brand underline underline-offset-2 hover:opacity-80">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
