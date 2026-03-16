import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getTenantId } from '@/lib/tenant'
import { createTransport, MAIL_FROM } from '@/lib/mailer'

export async function POST(req: NextRequest) {
  const { phone } = await req.json()
  if (!phone?.trim())
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })

  const supabase = createServerSupabase()
  const tid = getTenantId()

  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, contact, password')
    .eq('contact', phone.trim())
    .eq('tenant_id', tid)
    .maybeSingle()

  // Always respond 200 to prevent phone number enumeration
  if (!user?.email) return NextResponse.json({ ok: true })

  // Generate token with 1-hour expiry
  const token = crypto.randomUUID()
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  await supabase.from('users').update({
    password_reset_token: token,
    password_reset_expires: expires,
  }).eq('id', user.id)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`
  const resetLink = `${appUrl}/reset-password?token=${token}`

  try {
    const transport = createTransport()
    await transport.sendMail({
      from: MAIL_FROM,
      to: user.email,
      subject: 'RGB Admin — Password Reset',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px 24px;background:#fff">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
            <div style="width:36px;height:36px;background:#2563eb;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px">R</div>
            <span style="font-size:18px;font-weight:700;color:#1e293b">RGB Admin</span>
          </div>

          <h2 style="color:#1e293b;font-size:20px;margin:0 0 8px">Password Reset Request</h2>
          <p style="color:#475569;margin:0 0 20px">Hi <strong>${user.name}</strong>, we received a request to reset your password.</p>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:20px">
            <p style="font-size:13px;font-weight:600;color:#64748b;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.05em">Your Current Login Details</p>
            <table style="border-collapse:collapse;width:100%">
              <tr>
                <td style="padding:8px 12px;background:#fff;border:1px solid #e2e8f0;font-weight:600;color:#374151;font-size:14px;width:40%">Phone (Username)</td>
                <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#1e293b;font-size:14px">${user.contact}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#fff;border:1px solid #e2e8f0;font-weight:600;color:#374151;font-size:14px">Current Password</td>
                <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;font-family:monospace">${user.password ?? '—'}</td>
              </tr>
            </table>
          </div>

          <p style="color:#475569;margin:0 0 16px">To set a new password, click the button below. This link expires in <strong>1 hour</strong>.</p>

          <a href="${resetLink}"
            style="display:inline-block;background:#2563eb;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:24px">
            Reset Password
          </a>

          <p style="color:#94a3b8;font-size:12px;border-top:1px solid #f1f5f9;padding-top:16px;margin:0">
            If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error('Failed to send reset email:', err)
    return NextResponse.json({ error: 'Failed to send email. Please contact your administrator.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
