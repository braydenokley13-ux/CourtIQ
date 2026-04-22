import { getTransporter } from './client'

export interface EmailPayload {
  to: string
  subject: string
  html: string
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const transporter = getTransporter()
  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.GMAIL_USER,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  })
}
