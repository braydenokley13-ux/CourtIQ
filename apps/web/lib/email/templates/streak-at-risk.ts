import { baseEmail, card, ctaButton } from './base'

export interface StreakAtRiskEmailData {
  name: string
  email: string
  streakDays: number
}

export function streakAtRiskEmail(data: StreakAtRiskEmailData): { subject: string; html: string } {
  const firstName = data.name.split(' ')[0]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://courtiq.app'
  const days = data.streakDays

  const content = `
    <!-- Hero -->
    <tr>
      <td style="text-align:center;padding:0 0 8px;">
        <div style="display:inline-block;background:linear-gradient(135deg,rgba(245,158,11,0.15),rgba(234,88,12,0.05));border:1px solid rgba(245,158,11,0.25);border-radius:24px;padding:40px 32px;width:100%;box-sizing:border-box;">
          <div style="font-size:64px;margin-bottom:8px;">🔥</div>
          <h1 style="margin:0 0 8px;font-size:30px;font-weight:800;letter-spacing:-0.5px;color:#F9FAFB;line-height:1.2;">Your streak is at risk,<br/><span style="color:#F59E0B;">${firstName}.</span></h1>
          <p style="margin:12px 0 0;font-size:16px;color:#9CA3AF;">You haven't trained today. Don't let your streak end tonight.</p>
        </div>
      </td>
    </tr>
    <tr><td style="height:16px;"></td></tr>

    <!-- Streak count -->
    ${card(`
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="text-align:center;padding:8px 0;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#6B7280;">Current Streak</p>
            <p style="margin:0;font-size:72px;font-weight:900;letter-spacing:-3px;line-height:1;">
              <span style="color:#F59E0B;">${days}</span>
            </p>
            <p style="margin:4px 0 0;font-size:14px;color:#6B7280;">${days === 1 ? 'day' : 'days'} 🔥 — don't break the chain</p>
          </td>
        </tr>
      </table>
      ${ctaButton('Save My Streak Now →', `${appUrl}/train`)}
    `, 'border-color:#F59E0B33;')}

    <!-- Info -->
    <tr>
      <td style="text-align:center;padding:8px 0 0;">
        <p style="margin:0;font-size:13px;color:#4B5563;">Sessions take under 5 minutes. You've got this.</p>
      </td>
    </tr>
  `

  return {
    subject: `⚠️ ${firstName}, your ${days}-day streak ends at midnight`,
    html: baseEmail(content, `Quick! Your ${days}-day streak expires tonight. One session saves it.`),
  }
}
