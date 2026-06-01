/**
 * Shared Resend transport. All API endpoints route through this so we
 * have one place to swap providers or tweak the From identity.
 *
 * Required Vercel env vars:
 *   RESEND_API_KEY  — re_... key from resend.com → API Keys
 *   OWNER_EMAIL     — defaults to sales@profoundmobiletend.com if unset
 *
 * Resend's free `onboarding@resend.dev` sender works without domain
 * verification, which lets the site send mail the moment the API key
 * lands in Vercel. Replies from the owner's inbox go back to the
 * visitor's address via reply_to.
 */
const RESEND_URL = 'https://api.resend.com/emails';
const FROM = 'Profound Mobile Tend <sales@profoundmobiletend.com>';

export async function sendMail({ subject, html, replyTo, to }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }
  const recipient = to || process.env.OWNER_EMAIL || 'sales@profoundmobiletend.com';
  const body = {
    from: FROM,
    to: Array.isArray(recipient) ? recipient : [recipient],
    subject,
    html,
  };
  if (replyTo) body.reply_to = replyTo;

  try {
    const r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, error: data?.message || 'Resend error', details: data };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    return { ok: false, error: 'Network error: ' + (err && err.message) };
  }
}

/** Helper — wraps content in a branded HTML shell so emails look intentional. */
export function shell(title, bodyHtml, footerNote) {
  return `<!DOCTYPE html>
<html><body style="margin:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f4f2ee;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="border-left:3px solid #3C8E39;padding:6px 0 6px 14px;margin-bottom:24px;">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#52b84f;font-weight:600;">Profound Mobile Tend</div>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:600;letter-spacing:-0.01em;">${escapeHtml(title)}</h1>
    </div>
    <div style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:22px;font-size:15px;line-height:1.6;">
      ${bodyHtml}
    </div>
    ${footerNote ? `<div style="margin-top:18px;color:#888;font-size:12px;line-height:1.5;">${footerNote}</div>` : ''}
    <div style="margin-top:24px;color:#666;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Faith Drives Clean · Baltimore &amp; DMV</div>
  </div>
</body></html>`;
}

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Renders a key/value table for email bodies. */
export function kvTable(rows) {
  const trs = rows
    .filter((r) => r && r[1] != null && r[1] !== '')
    .map(
      ([k, v]) => `<tr>
        <td style="padding:8px 12px;color:#52b84f;font-weight:600;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.05);width:34%;vertical-align:top;">${escapeHtml(k)}</td>
        <td style="padding:8px 12px;color:#f4f2ee;border-bottom:1px solid rgba(255,255,255,0.05);word-break:break-word;">${escapeHtml(v)}</td>
      </tr>`,
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;">${trs}</table>`;
}
