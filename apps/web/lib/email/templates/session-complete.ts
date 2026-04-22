import { baseEmail, card, ctaButton, statBox } from './base'

export interface SessionCompleteEmailData {
  name: string
  email: string
  correctCount: number
  totalScenarios: number
  xpEarned: number
  iqDelta: number
  iqAfter: number
  streakDays: number
}

const MOTIVATIONAL_QUOTES = [
  'Every rep makes you sharper.',
  'The best players study the game they love.',
  'See it before it happens.',
  'IQ is built, not born.',
  'One session at a time.',
]

export function sessionCompleteEmail(data: SessionCompleteEmailData): { subject: string; html: string } {
  const firstName = data.name.split(' ')[0]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://courtiq.app'
  const accuracy = Math.round((data.correctCount / data.totalScenarios) * 100)
  const iqUp = data.iqDelta >= 0
  const iqColor = iqUp ? '#3BE383' : '#F87171'
  const iqSign = iqUp ? '+' : ''
  const quote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)]

  const content = `
    <!-- Hero -->
    <tr>
      <td style="text-align:center;padding:0 0 8px;">
        <div style="display:inline-block;background:linear-gradient(135deg,rgba(59,227,131,0.12),rgba(16,185,129,0.04));border:1px solid rgba(59,227,131,0.18);border-radius:24px;padding:36px 32px;width:100%;box-sizing:border-box;">
          <div style="font-size:42px;margin-bottom:8px;">${accuracy === 100 ? '🏆' : accuracy >= 80 ? '🎯' : '📈'}</div>
          <h1 style="margin:0 0 6px;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#F9FAFB;line-height:1.2;">Session complete, ${firstName}!</h1>
          <p style="margin:0;font-size:15px;color:#9CA3AF;">Here's how you did today.</p>
        </div>
      </td>
    </tr>
    <tr><td style="height:16px;"></td></tr>

    <!-- IQ delta highlight -->
    ${card(`
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="text-align:center;padding:8px 0;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#6B7280;">IQ Change</p>
            <p style="margin:0;font-size:64px;font-weight:900;letter-spacing:-3px;color:${iqColor};line-height:1;">${iqSign}${data.iqDelta}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#6B7280;">New IQ: <span style="font-weight:700;color:#F9FAFB;">${data.iqAfter.toLocaleString()}</span></p>
          </td>
        </tr>
      </table>
    `)}

    <!-- Stats row -->
    ${card(`
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr style="gap:8px;">
          ${statBox('Accuracy', `${accuracy}%`, `${data.correctCount}/${data.totalScenarios} correct`, accuracy >= 80 ? '#3BE383' : '#F59E0B')}
          <td style="width:8px;"></td>
          ${statBox('XP Earned', `+${data.xpEarned}`, 'this session')}
          <td style="width:8px;"></td>
          ${statBox('Streak', `${data.streakDays}🔥`, `${data.streakDays === 1 ? 'day' : 'days'} running`, '#F59E0B')}
        </tr>
      </table>
    `)}

    <!-- CTA -->
    <tr>
      <td style="text-align:center;padding:8px 0;">
        <p style="margin:0 0 4px;font-size:13px;font-style:italic;color:#4B5563;">"${quote}"</p>
      </td>
    </tr>
    <tr>
      <td>
        ${ctaButton('Train Again Tomorrow →', `${appUrl}/train`)}
      </td>
    </tr>
  `

  const subjectEmoji = accuracy === 100 ? '🏆' : iqUp ? '📈' : '💪'
  return {
    subject: `${subjectEmoji} Session recap — ${iqSign}${data.iqDelta} IQ · ${accuracy}% accuracy`,
    html: baseEmail(content, `You went ${iqSign}${data.iqDelta} IQ with ${accuracy}% accuracy. Keep it up.`),
  }
}
