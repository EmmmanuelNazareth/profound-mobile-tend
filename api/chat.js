/**
 * POST /api/chat
 * Relays a chat message from the on-site widget to the owner via Resend.
 * Replying from the inbox sends back to the visitor's address via reply_to.
 */
import { sendMail, shell, kvTable, escapeHtml } from './_sendmail.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  const { sessionId, name, email, message, page } = body || {};
  if (!message || !email || !name) {
    res.status(400).json({ error: 'Missing name, email, or message' });
    return;
  }

  const subject = `💬 Chat from ${name}`;
  const html = shell(
    `Live chat: ${name}`,
    `<p style="margin:0 0 14px;color:rgba(244,242,238,0.85);font-size:15px;">A visitor just sent a chat message. Reply to this email and it'll go straight to them.</p>
     <div style="background:rgba(60,142,57,0.08);border-left:3px solid #52b84f;padding:14px 16px;border-radius:4px;margin:0 0 18px;font-size:15px;line-height:1.7;color:#fff;white-space:pre-wrap;">${escapeHtml(message)}</div>
     ${kvTable([
       ['From', name],
       ['Email', email],
       ['On page', page || '/'],
       ['Session', String(sessionId || '').slice(0, 18)],
       ['Received', new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })],
     ])}`,
    `Replying to this email sends back to <strong>${escapeHtml(email)}</strong>.`,
  );

  const result = await sendMail({ subject, html, replyTo: email });
  if (!result.ok) {
    res.status(502).json({ error: result.error });
    return;
  }
  res.status(200).json({ ok: true });
}
