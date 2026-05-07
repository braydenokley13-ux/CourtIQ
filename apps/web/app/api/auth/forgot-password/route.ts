import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/sender'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { recoveryEmail?: string }

  // Always return 200 — never leak whether the email is registered
  if (!body.recoveryEmail || typeof body.recoveryEmail !== 'string') {
    return NextResponse.json({ ok: true })
  }

  const recoveryEmail = body.recoveryEmail.trim().toLowerCase()

  // Reject attempts to use synthetic internal addresses as recovery emails
  if (recoveryEmail.endsWith('@users.courtiq.app')) {
    return NextResponse.json({ ok: true })
  }

  try {
    const user = await prisma.user.findFirst({
      where: { recovery_email: recoveryEmail },
      select: { email: true, username: true, display_name: true },
    })

    if (!user) {
      return NextResponse.json({ ok: true })
    }

    const adminClient = createAdminClient()
    const { data, error } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: user.email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/auth/callback?next=/reset-password`,
      },
    })

    if (error || !data?.properties?.action_link) {
      console.error('[api/auth/forgot-password] generateLink failed', error)
      return NextResponse.json({ ok: true })
    }

    const name = user.display_name ?? user.username ?? 'Player'
    const resetLink = data.properties.action_link

    await sendEmail({
      to: recoveryEmail,
      subject: 'Reset your CourtIQ password',
      html: buildResetEmail({ name, resetLink }),
    })
  } catch (err) {
    console.error('[api/auth/forgot-password]', err)
  }

  return NextResponse.json({ ok: true })
}

function buildResetEmail({ name, resetLink }: { name: string; resetLink: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your CourtIQ password</title>
</head>
<body style="margin:0;padding:0;background:#0D0F12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0F12;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="margin:0;font-size:24px;font-weight:700;color:#F2F4F8;letter-spacing:-0.5px;">
                Court<span style="color:#3BE383;">IQ</span>
              </p>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:#161A1F;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:32px;">
              <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#F2F4F8;">Reset your password</p>
              <p style="margin:0 0 24px;font-size:14px;color:#8B92A3;line-height:1.6;">
                Hey ${name}, we received a request to reset your CourtIQ password.
                Click the button below to set a new one. This link expires in 1 hour.
              </p>
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${resetLink}"
                       style="display:inline-block;background:#3BE383;color:#0D0F12;font-weight:700;font-size:14px;text-decoration:none;border-radius:10px;padding:13px 28px;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;color:#545B68;line-height:1.6;">
                If you didn&apos;t request a password reset, you can safely ignore this email.
                Your password will not change.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:11px;color:#545B68;">
                &copy; CourtIQ. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
