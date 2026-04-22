import { baseEmail, card, ctaButton } from './base'

export interface WelcomeEmailData {
  name: string
  email: string
  startingIQ?: number
}

export function welcomeEmail(data: WelcomeEmailData): { subject: string; html: string } {
  const firstName = data.name.split(' ')[0]
  const iq = data.startingIQ ?? 500
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://courtiq.app'

  const content = `
    <!-- Hero -->
    <tr>
      <td style="text-align:center;padding:0 0 8px;">
        <div style="display:inline-block;background:linear-gradient(135deg,rgba(59,227,131,0.15),rgba(34,197,94,0.05));border:1px solid rgba(59,227,131,0.2);border-radius:24px;padding:40px 32px;width:100%;box-sizing:border-box;">
          <div style="font-size:52px;margin-bottom:8px;">🏀</div>
          <h1 style="margin:0 0 8px;font-size:32px;font-weight:800;letter-spacing:-1px;color:#F9FAFB;line-height:1.1;">Welcome to CourtIQ,<br/><span style="color:#3BE383;">${firstName}.</span></h1>
          <p style="margin:12px 0 0;font-size:16px;color:#9CA3AF;line-height:1.6;">The basketball IQ training platform built to make you a smarter player — one read at a time.</p>
        </div>
      </td>
    </tr>
    <tr><td style="height:16px;"></td></tr>

    <!-- Starting IQ -->
    ${card(`
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#6B7280;">Your Starting IQ</p>
            <p style="margin:0;font-size:56px;font-weight:900;letter-spacing:-3px;color:#3BE383;line-height:1;">${iq}</p>
            <p style="margin:8px 0 0;font-size:13px;color:#6B7280;">Every session moves this score. Train daily to climb the leaderboard.</p>
          </td>
        </tr>
      </table>
      ${ctaButton('Start Your First Session →', `${appUrl}/train`)}
    `)}

    <!-- What to expect -->
    ${card(`
      <p style="margin:0 0 20px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#6B7280;">What to expect</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${['🎯 5 real-game scenarios per session (3–5 min)',
           '📈 Your IQ score updates after every answer',
           '🔥 Build streaks to unlock score multipliers',
           '🏆 Compete on weekly leaderboards'].map(item => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #1F2937;">
            <p style="margin:0;font-size:14px;color:#D1D5DB;line-height:1.5;">${item}</p>
          </td>
        </tr>`).join('')}
      </table>
    `)}

    <!-- Quote -->
    <tr>
      <td style="text-align:center;padding:8px 0 0;">
        <p style="margin:0;font-size:13px;font-style:italic;color:#4B5563;">"The best players see the game before it happens."</p>
      </td>
    </tr>
  `

  return {
    subject: `Welcome to CourtIQ, ${firstName} — your IQ journey starts now 🏀`,
    html: baseEmail(content, `Your starting IQ is ${iq}. Let's get to work.`),
  }
}
