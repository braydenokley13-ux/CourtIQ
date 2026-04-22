import { baseEmail, card, ctaButton } from './base'

export interface NewContentEmailData {
  name: string
  email: string
  moduleTitle: string
  moduleSlug: string
  conceptName: string
  difficulty: number
  xpAvailable: number
}

const DIFFICULTY_LABELS = ['', 'Rookie', 'Varsity', 'Varsity+', 'Elite', 'Elite+']
const DIFFICULTY_COLORS = ['', '#3BE383', '#3BE383', '#F59E0B', '#F97316', '#F87171']

export function newContentEmail(data: NewContentEmailData): { subject: string; html: string } {
  const firstName = data.name.split(' ')[0]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://courtiq.app'
  const diffLabel = DIFFICULTY_LABELS[data.difficulty] ?? 'All Levels'
  const diffColor = DIFFICULTY_COLORS[data.difficulty] ?? '#3BE383'

  const content = `
    <!-- Hero — DROP announcement -->
    <tr>
      <td style="text-align:center;padding:0 0 8px;">
        <div style="background:linear-gradient(135deg,rgba(139,124,248,0.15),rgba(59,227,131,0.05));border:1px solid rgba(139,124,248,0.25);border-radius:24px;padding:40px 32px;width:100%;box-sizing:border-box;">
          <p style="margin:0 0 12px;font-size:11px;text-transform:uppercase;letter-spacing:3px;font-weight:800;color:#8B7CF8;">New Drop</p>
          <h1 style="margin:0 0 8px;font-size:30px;font-weight:900;letter-spacing:-0.5px;color:#F9FAFB;line-height:1.2;">${data.moduleTitle}</h1>
          <p style="margin:0;font-size:15px;color:#9CA3AF;">A new training module is now live in IQ Academy.</p>
        </div>
      </td>
    </tr>
    <tr><td style="height:16px;"></td></tr>

    <!-- Module card -->
    ${card(`
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0 20px;">
            <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#6B7280;">Concept</p>
            <p style="margin:0;font-size:20px;font-weight:700;color:#F9FAFB;">${data.conceptName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
          </td>
        </tr>
        <tr>
          <td>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:12px;">
                  <div style="display:inline-block;padding:4px 12px;border-radius:20px;background:${diffColor}18;border:1px solid ${diffColor}44;font-size:12px;font-weight:700;color:${diffColor};">${diffLabel}</div>
                </td>
                <td>
                  <div style="display:inline-block;padding:4px 12px;border-radius:20px;background:rgba(59,227,131,0.1);border:1px solid rgba(59,227,131,0.2);font-size:12px;font-weight:700;color:#3BE383;">+${data.xpAvailable} XP</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      ${ctaButton('Start This Module →', `${appUrl}/academy`)}
    `)}

    <tr>
      <td style="text-align:center;padding:8px 0 0;">
        <p style="margin:0;font-size:13px;color:#4B5563;">New content drops weekly. Stay ahead of the game, ${firstName}.</p>
      </td>
    </tr>
  `

  return {
    subject: `🆕 New module: "${data.moduleTitle}" is now live`,
    html: baseEmail(content, `New IQ Academy module: ${data.moduleTitle}. Train it now.`),
  }
}
