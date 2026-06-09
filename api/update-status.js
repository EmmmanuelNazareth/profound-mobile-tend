/**
 * POST /api/update-status   { order, token, status }
 *
 * Owner-only (token-protected) status advance for the live tracker. When the
 * status is set to "complete", we generate a Square balance payment link with
 * tipping enabled and email the customer to pay the remaining balance + leave
 * a review. Other transitions just update the timeline; "on_the_way" also
 * pings the customer so they know we're inbound.
 */
import { sendMail, shell, kvTable, escapeHtml } from './_sendmail.js';
import { getBooking, saveBooking, verifyManageToken, STAGES, stageLabel, kvConfigured } from './_store.js';
import { createSquarePaymentLink } from './create-checkout.js';

const SITE_URL = process.env.SITE_URL || 'https://profoundmobiletend.com';
const VALID = STAGES.map((s) => s.key); // deposit_paid, scheduled, on_the_way, in_progress, complete

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!kvConfigured()) {
    res.status(503).json({ ok: false, error: 'store not configured' });
    return;
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {}
  const id = (body.order || body.orderId || '').toString().trim();
  const token = (body.token || '').toString().trim();
  const status = (body.status || '').toString().trim();

  if (!id || !token) {
    res.status(400).json({ ok: false, error: 'Missing order or token' });
    return;
  }
  if (!verifyManageToken(id, token)) {
    res.status(403).json({ ok: false, error: 'Invalid management token' });
    return;
  }
  if (!VALID.includes(status)) {
    res.status(400).json({ ok: false, error: 'Unknown status' });
    return;
  }

  let b = await getBooking(id);
  if (!b) {
    res.status(404).json({ ok: false, error: 'booking not found' });
    return;
  }

  const now = new Date().toISOString();
  const prevStatus = b.status;
  b.status = status;
  b.statusHistory = b.statusHistory || [];
  if (prevStatus !== status) b.statusHistory.push({ status, at: now });

  const when = [b.dateDisp, b.time].filter(Boolean).join(' · ');

  // ── COMPLETE → create balance payment link (with tipping) + notify customer ──
  if (status === 'complete') {
    const balance = Number(b.balance || 0);
    if (balance > 0 && !b.balanceUrl) {
      const pay = await createSquarePaymentLink({
        orderId: `${b.id}-BAL`,
        amount: balance,
        name: b.name,
        email: b.email,
        phone: b.phone,
        address: b.address,
        note: `Balance for ${b.service}${b.vehicleSize ? ' (' + b.vehicleSize + ')' : ''} — ${when}`,
        items: [{ name: `Balance — ${b.service}`, vehicle: b.vehicleSize || '', qty: 1 }],
        tipping: true,
        redirectUrl: `${SITE_URL}/thank-you?order=${encodeURIComponent(b.id)}&type=balance`,
      });
      if (pay.ok) b.balanceUrl = pay.url;
      else console.log('balance link error:', pay.error);
    }

    try { await saveBooking(b); } catch (e) { console.log('save note:', e && e.message); }

    if (b.email) {
      const payBtn = b.balanceUrl
        ? `<p style="margin:0 0 6px;"><a href="${escapeHtml(b.balanceUrl)}" style="display:inline-block;background:#3C8E39;color:#fff;text-decoration:none;font-weight:600;padding:13px 24px;border-radius:4px;">Pay balance${Number(b.balance) ? ' ($' + Number(b.balance).toFixed(2) + ')' : ''} + add a tip →</a></p>
           <p style="margin:6px 0 0;color:#888;font-size:13px;">You can add a tip for your detailer on the payment screen — totally optional and always appreciated.</p>`
        : `<p style="margin:0;color:rgba(244,242,238,0.85);">We'll follow up shortly with your balance total.</p>`;
      const reviewUrl = `${SITE_URL}/review?order=${encodeURIComponent(b.id)}`;
      const html = shell(
        'Your detail is complete! ✨',
        `<p style="margin:0 0 14px;color:rgba(244,242,238,0.85);">All done, ${escapeHtml((b.name || '').split(' ')[0] || 'there')}! Your ${escapeHtml(b.service || 'service')} is finished. Here's the last step:</p>
         ${payBtn}
         <p style="margin:20px 0 8px;color:rgba(244,242,238,0.85);">And we'd love your feedback — it means the world to a local business:</p>
         <p style="margin:0;"><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;border:1px solid #3C8E39;color:#52b84f;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:4px;">Rate your experience →</a></p>`,
        'Thank you for choosing Profound Mobile Tend — Faith Drives Clean.',
      );
      await sendMail({ to: b.email, subject: `✨ ${b.service || 'Your detail'} is complete — finish up & tip`, html, replyTo: 'sales@profoundmobiletend.com' });
    }

    res.status(200).json({ ok: true, status: b.status, balanceUrl: b.balanceUrl || '' });
    return;
  }

  // ── Non-complete transitions ──
  try { await saveBooking(b); } catch (e) { console.log('save note:', e && e.message); }

  // Friendly heads-up when we're heading out.
  if (status === 'on_the_way' && b.email && prevStatus !== 'on_the_way') {
    const trackUrl = `${SITE_URL}/track?order=${encodeURIComponent(b.id)}`;
    const html = shell(
      'We\'re on the way! 🚗',
      `<p style="margin:0 0 14px;color:rgba(244,242,238,0.85);">Hi ${escapeHtml((b.name || '').split(' ')[0] || 'there')} — your detailer is heading to your location now for your ${escapeHtml(b.service || 'service')}.</p>
       <p style="margin:0;"><a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:#3C8E39;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:4px;">Track live →</a></p>`,
      'Profound Mobile Tend',
    );
    await sendMail({ to: b.email, subject: '🚗 Your detailer is on the way', html, replyTo: 'sales@profoundmobiletend.com' });
  }

  res.status(200).json({ ok: true, status: b.status, statusLabel: stageLabel(b.status) });
}
