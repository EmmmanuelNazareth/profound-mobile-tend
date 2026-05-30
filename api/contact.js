/**
 * POST /api/contact
 * Receives the homepage contact form ("Quick Message").
 */
import { sendMail, shell, kvTable, escapeHtml } from './_sendmail.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const name    = (body.name || '').toString().trim();
  const email   = (body.email || '').toString().trim();
  const phone   = (body.phone || '').toString().trim();
  const message = (body.message || body.notes || '').toString().trim();
  const subjectLine = (body.subject || '').toString().trim();

  if (!message) {
    res.status(400).json({ error: 'Message is required.' });
    return;
  }
  if (!email && !phone) {
    res.status(400).json({ error: 'Need an email or phone so you can reply.' });
    return;
  }

  const subject = `📨 Contact — ${name || 'Visitor'}${subjectLine ? ' · ' + subjectLine : ''}`;
  const html = shell(
    `Quick message: ${name || 'Visitor'}`,
    `<p style="margin:0 0 14px;color:rgba(244,242,238,0.85);">New message from the contact form.</p>
     <div style="background:rgba(60,142,57,0.08);border-left:3px solid #52b84f;padding:14px 16px;border-radius:4px;margin:0 0 18px;line-height:1.7;white-space:pre-wrap;color:#fff;">${escapeHtml(message)}</div>
     ${kvTable([
       ['From', name],
       ['Email', email],
       ['Phone', phone],
       ['Subject', subjectLine],
       ['Received', new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })],
     ])}`,
    email ? `Reply goes to <strong>${escapeHtml(email)}</strong>.` : '',
  );

  const result = await sendMail({ subject, html, replyTo: email || undefined });
  if (!result.ok) {
    res.status(502).json({ error: result.error });
    return;
  }
  res.status(200).json({ ok: true });
}
