import nodemailer from 'nodemailer'

let _transporter: nodemailer.Transporter | null = null

export function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  })
  return _transporter
}
