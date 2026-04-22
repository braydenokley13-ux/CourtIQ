import { baseEmail, card, ctaButton } from './base'

export interface BadgeEarnedEmailData {
  name: string
  email: string
  badgeName: string
  badgeSlug: string
  badgeFamily: string
  currentIQ: number
}

const FAMILY_LABELS: Record<string, { emoji: string; color: string; label: string }> = {
  CONCEPT:   { emoji: '🧠', color: '#8B7CF8', label: 'Concept Mastery' },
  MILESTONE: { emoji: '🏆', color: '#F59E0B', label: 'Milestone' },
  ACCURACY:  { emoji: '🎯', color: '#3BE383', label: 'Accuracy' },
}

export function badgeEarnedEmail(data: BadgeEarnedEmailData): { subject: string; html: string } {
  const firstName = data.name.split(' ')[0]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://courtiq.app'
  const family = FAMILY_LABELS[data.badgeFamily] ?? { emoji: '⭐', color: '#3BE383', label: data.badgeFamily }

  const content = `
    <!-- Hero — full-bleed badge moment -->
    <tr>
      <td style="text-align:center;padding:0 0 8px;">
        <div style="background:linear-gradient(135deg,${family.color}22,${family.color}08);border:1px solid ${family.color}44;border-radius:24px;padding:44px 32px;width:100%;box-sizing:border-box;">
          <!-- Badge icon ring -->
          <div style="display:inline-block;width:88px;height:88px;border-radius:50%;background:${family.color}18;border:2px solid ${family.color}66;line-height:88px;font-size:40px;margin-bottom:16px;">${family.emoji}</div>
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:${family.color};">${family.label}</p>
          <h1 style="margin:0 0 8px;font-size:28px;font-weight:900;letter-spacing:-0.5px;color:#F9FAFB;">${data.badgeName}</h1>
          <p style="margin:0;font-size:15px;color:#9CA3AF;">You just unlocked a new badge, ${firstName}.</p>
        </div>
      </td>
    </tr>
    <tr><td style="height:16px;"></td></tr>

    <!-- IQ context -->
    ${card(`
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="text-align:center;padding:8px 0;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#6B7280;">Current IQ</p>
            <p style="margin:0;font-size:48px;font-weight:900;letter-spacing:-2px;color:#3BE383;line-height:1;">${data.currentIQ.toLocaleString()}</p>
            <p style="margin:8px 0 0;font-size:13px;color:#6B7280;">Every badge is proof of real progress.</p>
          </td>
        </tr>
      </table>
      ${ctaButton('View All Badges →', `${appUrl}/profile`)}
    `)}

    <!-- Motivation -->
    <tr>
      <td style="text-align:center;padding:8px 0 0;">
        <p style="margin:0;font-size:13px;color:#4B5563;">Keep training. More badges unlock as you climb.</p>
      </td>
    </tr>
  `

  return {
    subject: `${family.emoji} New badge unlocked: ${data.badgeName}`,
    html: baseEmail(content, `You earned the "${data.badgeName}" badge. View it in your profile.`),
  }
}
