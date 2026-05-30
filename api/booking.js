/**
 * POST /api/booking
 * Receives a completed booking from the homepage flow and emails the
 * owner. Accepts any free-form payload — we render whatever keys are
 * present in a clean table so the form fields can evolve without
 * touching this endpoint.
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

  const name    = (body.name || body.full_name || '').toString().trim();
  const email   = (body.email || '').toString().trim();
  const phone   = (body.phone || '').toString().trim();
  const service = (body.service || body.service_name || '').toString().trim();
  const vehicle = (body.vehicle || body.vehicle_size || '').toString().trim();
  const date    = (body.date || body.appointment_date || '').toString().trim();
  const time    = (body.time || body.appointment_time || '').toString().trim();
  const address = (body.address || body.location || '').toString().trim();
  const notes   = (body.notes || body.message || '').toString().trim();

  if (!email && !phone) {
    res.status(400).json({ error: 'Need at least an email or phone to reach the customer.' });
    return;
  }

  // Drop into a stable display order; collect anything extra at the bottom.
  const known = ['name','full_name','email','phone','service','service_name','vehicle','vehicle_size','date','appointment_date','time','appointment_time','address','location','notes','message'];
  const extras = Object.entries(body)
    .filter(([k]) => !known.includes(k) && !k.startsWith('_'))
    .map(([k, v]) => [k.replace(/_/g, ' '), typeof v === 'object' ? JSON.stringify(v) : String(v)]);

  const subject = `📅 Booking — ${service || 'Service'} · ${name || 'Customer'}${date ? ' · ' + date : ''}`;
  const html = shell(
    `New booking: ${name || 'Customer'}`,
    `<p style="margin:0 0 14px;color:rgba(244,242,238,0.85);">You have a new booking. Reply to this email to confirm with the customer directly.</p>
     ${kvTable([
       ['Customer', name],
       ['Email', email],
       ['Phone', phone],
       ['Service', service],
       ['Vehicle size', vehicle],
       ['Date', date],
       ['Time', time],
       ['Address', address],
       ['Notes', notes],
       ...extras,
       ['Received', new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })],
     ])}`,
    email ? `Reply goes to <strong>${escapeHtml(email)}</strong>.` : 'No email on file — call the customer back at the number above.',
  );

  const result = await sendMail({ subject, html, replyTo: email || undefined });
  if (!result.ok) {
    res.status(502).json({ error: result.error });
    return;
  }
  res.status(200).json({ ok: true });
}
