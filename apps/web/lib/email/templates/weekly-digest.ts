import { baseEmail, card, ctaButton, statBox } from './base'

export interface WeeklyDigestEmailData {
  name: string
  email: string
  iqStart: number
  iqEnd: number
  sessionsCompleted: number
  xpEarned: number
  accuracy: number
  streakDays: number
  weeklyRank?: number
  topConcepts: string[]
}

function miniGraph(iqStart: number, iqEnd: number): string {
  const up = iqEnd >= iqStart
  return `<div style="display:inline-block;background:${up ? 'rgba(59,227,131,0.12)' : 'rgba(248,113,113,0.12)'};border:1px solid ${up ? 'rgba(59,227,131,0.25)' : 'rgba(248,113,113,0.25)'};border-radius:8px;padding:4px 10px;font-size:12px;color:${up ? '#3BE383' : '#F87171'};font-weight:700;">${up ? '▲' : '▼'} ${Math.abs(iqEnd - iqStart)} pts this week</div>`
}

export function weeklyDigestEmail(data: WeeklyDigestEmailData): { subject: string; html: string } {
  const firstName = data.name.split(' ')[0]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://courtiq.app'
  const iqDelta = data.iqEnd - data.iqStart
  const iqUp = iqDelta >= 0
  const accuracyPct = Math.round(data.accuracy * 100)

  const weekDate = new Date()
  const weekStr = weekDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

  const content = `
    <!-- Header -->
    <tr>
      <td style="text-align:center;padding:0 0 8px;">
        <div style="background:linear-gradient(135deg,rgba(59,227,131,0.1),rgba(16,185,129,0.03));border:1px solid rgba(59,227,131,0.15);border-radius:24px;padding:36px 32px;width:100%;box-sizing:border-box;">
          <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#6B7280;">Week ending ${weekStr}</p>
          <h1 style="margin:0 0 8px;font-size:30px;font-weight:800;letter-spacing:-0.5px;color:#F9FAFB;line-height:1.2;">Your Weekly IQ Report,<br/><span style="color:#3BE383;">${firstName}</span></h1>
          <div style="margin-top:12px;">${miniGraph(data.iqStart, data.iqEnd)}</div>
        </div>
      </td>
    </tr>
    <tr><td style="height:16px;"></td></tr>

    <!-- Current IQ big stat -->
    ${card(`
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="text-align:center;padding:4px 0 12px;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#6B7280;">Basketball IQ</p>
            <p style="margin:0;font-size:60px;font-weight:900;letter-spacing:-3px;color:#3BE383;line-height:1;">${data.iqEnd.toLocaleString()}</p>
            <p style="margin:6px 0 0;font-size:13px;color:${iqUp ? '#3BE383' : '#F87171'};font-weight:600;">${iqUp ? '↑' : '↓'} ${Math.abs(iqDelta)} from last week</p>
          </td>
        </tr>
      </table>
    `)}

    <!-- Stats grid -->
    ${card(`
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          ${statBox('Sessions', String(data.sessionsCompleted), 'this week')}
          <td style="width:8px;"></td>
          ${statBox('XP Earned', `+${data.xpEarned}`, 'this week')}
          <td style="width:8px;"></td>
          ${statBox('Accuracy', `${accuracyPct}%`, 'all-time', accuracyPct >= 75 ? '#3BE383' : '#F59E0B')}
        </tr>
        <tr><td colspan="5" style="height:16px;"></td></tr>
        <tr>
          ${statBox('Streak', `${data.streakDays}🔥`, `${data.streakDays === 1 ? 'day' : 'days'}`, '#F59E0B')}
          <td style="width:8px;"></td>
          ${data.weeklyRank ? statBox('Weekly Rank', `#${data.weeklyRank}`, 'on leaderboard', '#8B7CF8') : `<td></td>`}
          <td style="width:8px;"></td>
          <td></td>
        </tr>
      </table>
    `)}

    <!-- Top concepts -->
    ${data.topConcepts.length > 0 ? card(`
      <p style="margin:0 0 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#6B7280;">Your Top Concepts This Week</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${data.topConcepts.map((c, i) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #1F2937;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:24px;"><span style="font-size:13px;color:#6B7280;font-weight:600;">${i + 1}</span></td>
                <td><p style="margin:0;font-size:14px;color:#D1D5DB;font-weight:500;">${c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p></td>
              </tr>
            </table>
          </td>
        </tr>`).join('')}
      </table>
    `) : ''}

    <!-- CTA -->
    <tr>
      <td>
        ${ctaButton('Train This Week →', `${appUrl}/train`)}
      </td>
    </tr>
    <tr>
      <td style="text-align:center;padding:8px 0 0;">
        <p style="margin:0;font-size:13px;color:#4B5563;">Keep showing up. The IQ compounds.</p>
      </td>
    </tr>
  `

  return {
    subject: `📊 Your CourtIQ week: ${iqUp ? '+' : ''}${iqDelta} IQ · ${data.sessionsCompleted} sessions`,
    html: baseEmail(content, `You went ${iqUp ? '+' : ''}${iqDelta} IQ this week with ${accuracyPct}% accuracy.`),
  }
}
