import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service — CourtIQ',
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

export default function TermsPage() {
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
              Terms of Service
            </h1>
          </div>
          <p className="mt-2 font-ui text-[13px] text-foreground-mute">
            Effective date: May 7, 2026
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-hairline" />

        <Section title="1. Acceptance of Terms">
          <P>
            By creating an account or using CourtIQ (the &ldquo;Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
          </P>
          <P>
            If you are under 18, you represent that a parent or guardian has reviewed and agreed to these Terms on your behalf.
          </P>
        </Section>

        <Section title="2. Description of Service">
          <P>
            CourtIQ is a basketball IQ training platform that helps players develop their basketball decision-making through interactive scenarios, adaptive learning, and gamified progression. The Service includes scenario-based training, skill assessments, leaderboards, and related features.
          </P>
        </Section>

        <Section title="3. User Accounts">
          <P>You must create an account to access most features of the Service. When creating your account:</P>
          <ul className="ml-4 mt-2 list-disc space-y-2 pl-2">
            <Li>Choose a username that is not offensive, impersonating, or misleading.</Li>
            <Li>Keep your password secure. You are responsible for all activity under your account.</Li>
            <Li>You may only create one account per person.</Li>
            <Li>Notify us immediately at <a href="mailto:support@courtiq.app" className="text-brand underline underline-offset-2 hover:opacity-80">support@courtiq.app</a> if you suspect unauthorized access to your account.</Li>
          </ul>
          <P>
            We reserve the right to suspend or terminate accounts that violate these Terms.
          </P>
        </Section>

        <Section title="4. Acceptable Use">
          <P>You agree not to:</P>
          <ul className="ml-4 mt-2 list-disc space-y-2 pl-2">
            <Li>Use the Service for any unlawful purpose or in violation of any applicable laws.</Li>
            <Li>Attempt to reverse-engineer, scrape, or extract content or data from the Service.</Li>
            <Li>Interfere with or disrupt the integrity or performance of the Service.</Li>
            <Li>Upload or transmit viruses, malicious code, or harmful content.</Li>
            <Li>Harass, abuse, or harm other users.</Li>
            <Li>Use automated scripts, bots, or tools to interact with the Service without our prior written consent.</Li>
          </ul>
        </Section>

        <Section title="5. Intellectual Property">
          <P>
            All content, features, and functionality of the Service — including but not limited to scenarios, graphics, design, text, logos, and training algorithms — are owned by CourtIQ and are protected by applicable intellectual property laws.
          </P>
          <P>
            You are granted a limited, non-exclusive, non-transferable license to access and use the Service for personal, non-commercial purposes. This license does not include the right to reproduce, distribute, modify, or create derivative works from any Service content.
          </P>
          <P>
            Your account data (scores, progress, badges) belongs to you. By using the Service, you grant CourtIQ a license to use this data to operate and improve the Service.
          </P>
        </Section>

        <Section title="6. Disclaimer of Warranties">
          <P>
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, either express or implied. CourtIQ does not warrant that the Service will be uninterrupted, error-free, or free of harmful components. Your use of the Service is at your sole risk.
          </P>
        </Section>

        <Section title="7. Limitation of Liability">
          <P>
            To the fullest extent permitted by law, CourtIQ and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Service, even if CourtIQ has been advised of the possibility of such damages.
          </P>
        </Section>

        <Section title="8. Termination">
          <P>
            You may stop using the Service at any time. We may suspend or terminate your access at our discretion, with or without notice, if we believe you have violated these Terms or if we discontinue the Service.
          </P>
          <P>
            Upon termination, your right to use the Service ceases immediately. Provisions that by their nature should survive termination will survive, including ownership provisions, warranty disclaimers, and limitations of liability.
          </P>
        </Section>

        <Section title="9. Changes to These Terms">
          <P>
            We may update these Terms from time to time. We will notify you of significant changes by updating the effective date above. Your continued use of the Service after changes are posted constitutes your acceptance of the revised Terms.
          </P>
        </Section>

        <Section title="10. Contact">
          <P>
            Questions about these Terms? Contact us at{' '}
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
            <Link href="/privacy" className="text-brand underline underline-offset-2 hover:opacity-80">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
