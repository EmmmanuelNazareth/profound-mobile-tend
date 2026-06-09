/**
 * POST /api/booking
 * Receives a booking from the homepage flow. Two jobs:
 *   1. Persist the booking to Redis (status pending_deposit) so the live
 *      tracker, status updates, and balance payment have a source of truth.
 *   2. Email the owner immediately so a lead is never lost, even if the
 *      customer abandons the deposit payment.
 */
import { sendMail, shell, kvTable, escapeHtml } from './_sendmail.js';
import { saveBooking, kvConfigured } from './_store.js';

function num(v) {
  if (typeof v === 'number') return v;
  const m = String(v == null ? '' : v).match(/([\d,]+\.\d{2}|\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : 0;
}

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

  const id      = (body.booking_id || body.id || '').toString().trim();
  const name    = (body.name || body.full_name || '').toString().trim();
  const email   = (body.email || '').toString().trim();
  const phone   = (body.phone || '').toString().trim();
  const service = (body.service || body.service_name || '').toString().trim();
  const serviceId = (body.serviceId || '').toString().trim();
  const vehicle = (body.vehicle || body.vehicle_size || '').toString().trim();
  const vehicleSize = (body.vehicleSize || '').toString().trim();
  const dateDisp = (body.date || body.appointment_date || '').toString().trim();
  const dateRaw = (body.dateRaw || '').toString().trim();
  const time    = (body.time || body.appointment_time || '').toString().trim();
  const address = (body.address || body.location || '').toString().trim();
  const notes   = (body.notes || body.message || '').toString().trim();
  const duration = (body.duration || '').toString().trim();

  const priceNum   = num(body.priceNum != null ? body.priceNum : body.price);
  const depositNum = body.deposit != null && !isNaN(num(body.deposit)) ? num(body.deposit) : Math.round(priceNum * 25) / 100;
  const balanceNum = body.balance != null ? num(body.balance) : Math.round((priceNum - depositNum) * 100) / 100;
  const isQuote = priceNum <= 0;

  if (!email && !phone) {
    res.status(400).json({ error: 'Need at least an email or phone to reach the customer.' });
    return;
  }

  // 1) Persist to Redis (best-effort — never block the booking on a store error).
  if (id && kvConfigured()) {
    const now = new Date().toISOString();
    const booking = {
      id, name, email, phone, address, vehicle, vehicleSize, notes,
      service, serviceId, duration,
      price: priceNum, deposit: isQuote ? 0 : depositNum, balance: isQuote ? 0 : balanceNum,
      isQuote,
      date: dateRaw || dateDisp, dateDisp, time,
      status: isQuote ? 'quote_requested' : 'pending_deposit',
      depositPaid: false, balancePaid: false,
      balanceUrl: '',
      rating: null,
      statusHistory: [{ status: isQuote ? 'quote_requested' : 'pending_deposit', at: now }],
      createdAt: now,
    };
    try {
      await saveBooking(booking);
    } catch (e) {
      console.log('Booking store note:', e && e.message);
    }
  }

  // 2) Email the owner.
  const subject = `📅 Booking — ${service || 'Service'} · ${name || 'Customer'}${dateDisp ? ' · ' + dateDisp : ''}`;
  const html = shell(
    `New booking: ${name || 'Customer'}`,
    `<p style="margin:0 0 14px;color:rgba(244,242,238,0.85);">You have a new booking. Reply to this email to reach the customer directly.</p>
     ${kvTable([
       ['Booking ID', id],
       ['Customer', name],
       ['Email', email],
       ['Phone', phone],
       ['Service', service],
       ['Vehicle', vehicle],
       ['Date', dateDisp],
       ['Time', time],
       ['Address', address],
       ['Notes', notes],
       ['Price', priceNum > 0 ? `$${priceNum.toFixed(2)}` : 'Custom quote'],
       ['Deposit', body.depositLabel || (isQuote ? 'No deposit (quote)' : `$${depositNum.toFixed(2)} (25%)`)],
       ['Status', body.status || (isQuote ? 'Quote requested' : 'Deposit pending')],
       ['Received', new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })],
     ])}`,
    email ? `Reply goes to <strong>${escapeHtml(email)}</strong>.` : 'No email on file — call the customer back at the number above.',
  );

  const result = await sendMail({ subject, html, replyTo: email || undefined });
  if (!result.ok) {
    // The booking is already stored; surface the email issue but don't fail the booking.
    res.status(200).json({ ok: true, emailWarning: result.error });
    return;
  }
  res.status(200).json({ ok: true });
}
