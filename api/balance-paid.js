/**
 * POST /api/balance-paid   { order: "PMT-XXXX" }
 *
 * Fired by the thank-you page after the customer pays their balance (Square
 * redirect with ?type=balance). Marks the booking paid-in-full and alerts the
 * owner. Idempotent. Actual tip amount lives in Square's dashboard (no webhook
 * needed for this lightweight flow).
 */
import { sendMail, shell, kvTable } from './_sendmail.js';
import { getBooking, saveBooking, kvConfigured } from './_store.js';

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

  let b = await getBooking(id);
  if (!b) {
    res.status(404).json({ ok: false, error: 'not found' });
    return;
  }
  if (b.balancePaid) {
    res.status(200).json({ ok: true, already: true });
    return;
  }

  const now = new Date().toISOString();
  b.balancePaid = true;
  b.status = 'paid';
  b.statusHistory = b.statusHistory || [];
  b.statusHistory.push({ status: 'paid', at: now });
  try { await saveBooking(b); } catch (e) { console.log('balance-paid save note:', e && e.message); }

  const html = shell(
    `✅ Paid in full — ${b.name || 'Customer'}`,
    `<p style="margin:0 0 14px;color:rgba(244,242,238,0.85);">The customer just paid their balance through Square. Any tip they added shows on your Square dashboard.</p>
     ${kvTable([
       ['Booking ID', b.id],
       ['Customer', b.name],
       ['Service', b.service],
       ['Deposit', `$${Number(b.deposit || 0).toFixed(2)}`],
       ['Balance', `$${Number(b.balance || 0).toFixed(2)}`],
       ['Paid at', new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })],
     ])}`,
    'Tip amounts are handled by Square — check your Square dashboard for the total.',
  );
  await sendMail({ subject: `✅ Paid in full — ${b.service || 'Service'} · ${b.name || 'Customer'}`, html });

  res.status(200).json({ ok: true });
}
