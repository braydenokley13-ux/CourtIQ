export function baseEmail(content: string, previewText = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>CourtIQ</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    body { margin: 0; padding: 0; background-color: #09111E; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
    table { border-collapse: collapse; }
    img { display: block; border: 0; }
    a { text-decoration: none; }
    .brand { color: #3BE383 !important; }
    .muted { color: #6B7280 !important; }
    @media only screen and (max-width: 600px) {
      .email-body { padding: 16px !important; }
      .card { border-radius: 16px !important; }
      .stat-col { width: 100% !important; display: block !important; margin-bottom: 12px !important; }
    }
  </style>
</head>
<body>
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;color:#09111E;font-size:1px;">${previewText}&nbsp;‌&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;</div>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#09111E;min-height:100vh;">
    <tr>
      <td align="center" class="email-body" style="padding:40px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

          <!-- HEADER -->
          <tr>
            <td style="padding-bottom:28px;" align="center">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:10px;vertical-align:middle;">
                    <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="20" cy="20" r="19" stroke="#3BE383" stroke-width="1.5" stroke-opacity="0.6"/>
                      <path d="M20 1C20 1 20 39 20 39" stroke="#3BE383" stroke-width="1.5" stroke-opacity="0.4"/>
                      <path d="M1 20C1 20 39 20 39 20" stroke="#3BE383" stroke-width="1.5" stroke-opacity="0.4"/>
                      <path d="M3.5 10C11 14 11 26 3.5 30" stroke="#3BE383" stroke-width="1.5" stroke-opacity="0.4" stroke-linecap="round"/>
                      <path d="M36.5 10C29 14 29 26 36.5 30" stroke="#3BE383" stroke-width="1.5" stroke-opacity="0.4" stroke-linecap="round"/>
                      <circle cx="20" cy="20" r="7" stroke="#3BE383" stroke-width="1.5" stroke-opacity="0.5"/>
                    </svg>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#F9FAFB;">Court<span style="color:#3BE383;">IQ</span></span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CONTENT -->
          ${content}

          <!-- FOOTER -->
          <tr>
            <td style="padding-top:40px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#374151;">© ${new Date().getFullYear()} CourtIQ · Training your basketball IQ</p>
              <p style="margin:0;font-size:11px;color:#374151;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://courtiq.app'}/settings" style="color:#4B5563;text-decoration:underline;">Manage notifications</a>
                &nbsp;·&nbsp;
                <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://courtiq.app'}" style="color:#4B5563;text-decoration:underline;">Open App</a>
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

export function card(content: string, style = ''): string {
  return `<tr>
    <td class="card" style="background:#111827;border:1px solid #1F2937;border-radius:20px;padding:28px 28px;margin-bottom:16px;${style}">
      ${content}
    </td>
  </tr>
  <tr><td style="height:12px;"></td></tr>`
}

export function ctaButton(label: string, href: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
    <tr>
      <td style="border-radius:12px;background:linear-gradient(135deg,#3BE383 0%,#22C55E 100%);box-shadow:0 0 24px rgba(59,227,131,0.35);">
        <a href="${href}" style="display:block;padding:15px 36px;font-size:15px;font-weight:700;color:#09111E;letter-spacing:0.01em;text-align:center;">${label}</a>
      </td>
    </tr>
  </table>`
}

export function statBox(label: string, value: string, sub = '', accent = '#3BE383'): string {
  return `<td class="stat-col" style="text-align:center;padding:16px 12px;background:#0D1B2A;border:1px solid #1F2937;border-radius:14px;">
    <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#6B7280;">${label}</p>
    <p style="margin:0;font-size:32px;font-weight:800;letter-spacing:-1px;color:${accent};">${value}</p>
    ${sub ? `<p style="margin:4px 0 0;font-size:11px;color:#4B5563;">${sub}</p>` : ''}
  </td>`
}

export function divider(): string {
  return `<tr><td style="height:1px;background:#1F2937;margin:16px 0;"></td></tr>`
}
