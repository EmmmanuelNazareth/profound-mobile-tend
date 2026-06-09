/**
 * POST /api/deposit-paid   { order: "PMT-XXXX" }
 *
 * Fired by the thank-you page after a successful Square deposit payment.
 * Flips the booking to "deposit_paid", emails the customer a confirmation +
 * live tracking link, and emails the owner a "deposit paid" alert with a
 * private link to manage the job's status from their phone. Idempotent — a
 * page refresh won't re-send the emails.
 */
import { sendMail, shell, kvTable, escapeHtml } from './_sendmail.js';
import { getBooking, saveBooking, manageToken, kvConfigured } from './_store.js';

const SITE_URL = process.env.SITE_URL || 'https://profoundmobiletend.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!kvConfigured()) {
    res.status(200).json({ ok: false, error: 'store not configured' });
    return;
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {}
  const id = (body.order || body.orderId || '').toString().trim();
  if (!id) {
    res.status(400).json({ error: 'Missing order id' });
    return;
  }

  let b;
  try {
    b = await getBooking(id);
  } catch (e) {
    res.status(200).json({ ok: false, error: 'lookup failed' });
    return;
  }
  if (!b) {
    res.status(404).json({ ok: false, error: 'booking not found' });
    return;
  }

  // Already processed — don't re-email on refresh.
  if (b.depositPaid) {
    res.status(200).json({ ok: true, already: true, status: b.status });
    return;
  }

  const now = new Date().toISOString();
  b.depositPaid = true;
  b.status = 'deposit_paid';
  b.statusHistory = b.statusHistory || [];
  b.statusHistory.push({ status: 'deposit_paid', at: now });
  try {
    await saveBooking(b);
  } catch (e) {
    console.log('deposit-paid save note:', e && e.message);
  }

  const trackUrl = `${SITE_URL}/track?order=${encodeURIComponent(id)}`;
  const manageUrl = `${SITE_URL}/manage?order=${encodeURIComponent(id)}&token=${manageToken(id)}`;
  const when = [b.dateDisp, b.time].filter(Boolean).join(' · ');

  // ── Customer email ──
  if (b.email) {
    const custHtml = shell(
      'Deposit received — you\'re booked!',
      `<p style="margin:0 0 14px;color:rgba(244,242,238,0.85);">Thank you, ${escapeHtml(b.name || 'there')}! Your 25% deposit is in and your appointment is locked.</p>
       ${kvTable([
         ['Booking ID', b.id],
         ['Service', b.service],
         ['Vehicle', b.vehicleSize || b.vehicle],
         ['When', when],
         ['Deposit paid', `$${Number(b.deposit || 0).toFixed(2)}`],
         ['Balance at service', `$${Number(b.balance || 0).toFixed(2)}`],
       ])}
       <p style="margin:18px 0 10px;color:rgba(244,242,238,0.85);">Follow your service live — we'll update the status as we head out, arrive, and finish:</p>
       <p style="margin:0 0 6px;"><a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:#3C8E39;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:4px;">Track my service →</a></p>
       <p style="margin:16px 0 0;color:#888;font-size:13px;">When your detail is complete, you'll get a link to pay the remaining balance (and add a tip if you'd like). Need to change something? Just reply to this email.</p>`,
      'Profound Mobile Tend — Faith Drives Clean',
    );
    await sendMail({ to: b.email, subject: `✓ Deposit received — ${b.service || 'your booking'} is confirmed`, html: custHtml, replyTo: 'sales@profoundmobiletend.com' });
  }

  // ── Owner email ──
  const ownerHtml = shell(
    `💰 Deposit paid — ${b.name || 'Customer'}`,
    `<p style="margin:0 0 14px;color:rgba(244,242,238,0.85);">A customer just paid their deposit. Tap below to manage the job — advance the status as you go, and hit <strong>Complete</strong> when you're done to auto-send their balance + tip request.</p>
     ${kvTable([
       ['Booking ID', b.id],
       ['Customer', b.name],
       ['Phone', b.phone],
       ['Service', b.service],
       ['Vehicle', b.vehicleSize || b.vehicle],
       ['When', when],
       ['Address', b.address],
       ['Deposit paid', `$${Number(b.deposit || 0).toFixed(2)}`],
       ['Balance due', `$${Number(b.balance || 0).toFixed(2)}`],
     ])}
     <p style="margin:18px 0 0;"><a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:#3C8E39;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:4px;">Manage this job →</a></p>
     <p style="margin:14px 0 0;color:#888;font-size:12px;">Keep this link private — it controls the job status.</p>`,
    'Bookmark the manage link on your phone for quick access during the job.',
  );
  await sendMail({ subject: `💰 Deposit paid — ${b.service || 'Service'} · ${b.name || 'Customer'}`, html: ownerHtml });

  res.status(200).json({ ok: true, status: b.status });
}
