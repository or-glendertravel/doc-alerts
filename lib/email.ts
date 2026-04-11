import { DocAlert, ALERT_TYPE_LABELS } from '@/types/alerts'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'alerts@yourdomain.com'
const FROM_NAME = process.env.FROM_NAME ?? 'DOC Track Alerts'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function buildEmailHtml(alerts: DocAlert[]): string {
  const rows = alerts.map(a => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
        <strong style="font-size:14px">${a.track_name ?? a.region}</strong>
        <span style="display:inline-block;margin-right:8px;font-size:11px;padding:2px 8px;border-radius:12px;background:${
          a.alert_type === 'closed' ? '#FCEBEB' :
          a.alert_type === 'weather' ? '#FAEEDA' :
          a.alert_type === 'construction' ? '#EEEDFE' : '#EAF3DE'
        };color:${
          a.alert_type === 'closed' ? '#A32D2D' :
          a.alert_type === 'weather' ? '#854F0B' :
          a.alert_type === 'construction' ? '#3C3489' : '#3B6D11'
        }">${ALERT_TYPE_LABELS[a.alert_type]}</span>
        <br>
        <span style="font-size:13px;color:#666">${a.region}</span>
        <p style="font-size:13px;color:#444;margin:6px 0 0">${a.description}</p>
        ${a.valid_from ? `<p style="font-size:12px;color:#888;margin:4px 0 0">
          תוקף: ${formatDate(a.valid_from)}${a.valid_until ? ` – ${formatDate(a.valid_until)}` : ''}
        </p>` : ''}
      </td>
    </tr>
  `).join('')

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head><meta charset="utf-8"></head>
    <body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9">
      <div style="background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5">
        <div style="background:#1D9E75;padding:20px 24px">
          <h1 style="color:white;font-size:18px;margin:0">DOC Track Alerts — New Zealand</h1>
          <p style="color:#a0e8c8;font-size:13px;margin:4px 0 0">
            ${alerts.length} התרא${alerts.length === 1 ? 'ה חדשה' : 'ות חדשות'} זוהו
          </p>
        </div>
        <table style="width:100%;border-collapse:collapse">
          ${rows}
        </table>
        <div style="padding:16px 24px;background:#f9f9f9;border-top:1px solid #eee">
          <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'}/dashboard"
            style="font-size:13px;color:#185FA5">
            פתח את לוח הבקרה ←
          </a>
          <p style="font-size:11px;color:#aaa;margin:8px 0 0">
            מקור: <a href="https://www.doc.govt.nz/parks-and-recreation/know-before-you-go/alerts/" style="color:#aaa">doc.govt.nz</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}

export async function sendAlertEmails(newAlerts: DocAlert[]): Promise<void> {
  if (!RESEND_API_KEY || newAlerts.length === 0) return

  // Fetch recipients from Supabase
  const { supabaseAdmin } = await import('@/lib/supabase')
  const { data: recipients } = await supabaseAdmin
    .from('email_recipients')
    .select('*')

  if (!recipients || recipients.length === 0) return

  for (const recipient of recipients) {
    // Filter alerts to only types this recipient subscribed to
    const relevantAlerts = newAlerts.filter(a =>
      (recipient.alert_types as string[]).includes(a.alert_type)
    )
    if (relevantAlerts.length === 0) continue

    const subject = relevantAlerts.length === 1
      ? `התראה חדשה: ${relevantAlerts[0].track_name ?? relevantAlerts[0].region}`
      : `${relevantAlerts.length} התראות חדשות מ-DOC ניו זילנד`

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [recipient.email],
        subject,
        html: buildEmailHtml(relevantAlerts),
      }),
    })

    console.log(`[email] Sent to ${recipient.email}: ${relevantAlerts.length} alerts`)
  }
}
