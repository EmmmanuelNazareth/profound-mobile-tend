/**
 * POST /api/review   { order?, rating (1-5), comment, name?, email? }
 *
 * Stores a customer rating/review and emails it to the owner. Works with or
 * without a linked booking. Returns the Google review link (if configured via
 * the GOOGLE_REVIEW_URL env var) so the page can invite a public review next.
 */
import { sendMail, shell, kvTable, escapeHtml } from './_sendmail.js';
import { getBooking, saveBooking, saveReview, kvConfigured } from './_store.js';

const GOOGLE_REVIEW_URL = process.env.GOOGLE_REVIEW_URL || '';

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

  const orderId = (body.order || body.orderId || '').toString().trim();
  const rating = Math.max(0, Math.min(5, parseInt(body.rating, 10) || 0));
  const comment = (body.comment || '').toString().trim().slice(0, 2000);
  let name = (body.name || '').toString().trim();
  let email = (body.email || '').toString().trim();
  let service = '';

  if (!rating) {
    res.status(400).json({ error: 'Please select a star rating.' });
    return;
  }

  // Enrich from the booking if we have one.
  if (orderId && kvConfigured()) {
    try {
      const b = await getBooking(orderId);
      if (b) {
        name = name || b.name || '';
        email = email || b.email || '';
        service = b.service || '';
        b.rating = rating;
        b.reviewComment = comment;
        b.reviewedAt = new Date().toISOString();
        await saveBooking(b);
      }
    } catch (e) {
      console.log('review enrich note:', e && e.message);
    }
  }

  const review = {
    orderId: orderId || '',
    rating,
    comment,
    name,
    email,
    service,
    at: new Date().toISOString(),
  };
  if (kvConfigured()) {
    try { await saveReview(review); } catch (e) { console.log('review save note:', e && e.message); }
  }

  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  const html = shell(
    `New ${rating}-star review`,
    `<p style="margin:0 0 10px;font-size:26px;letter-spacing:3px;color:#52b84f;">${stars}</p>
     ${comment ? `<div style="background:rgba(60,142,57,0.08);border-left:3px solid #52b84f;padding:14px 16px;border-radius:4px;margin:0 0 18px;line-height:1.7;white-space:pre-wrap;color:#fff;">${escapeHtml(comment)}</div>` : '<p style="color:#888;margin:0 0 18px;">No written comment.</p>'}
     ${kvTable([
       ['Rating', `${rating} / 5`],
       ['From', name],
       ['Email', email],
       ['Service', service],
       ['Booking ID', orderId],
       ['Received', new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })],
     ])}`,
    email ? `Reply goes to <strong>${escapeHtml(email)}</strong>.` : '',
  );
  await sendMail({ subject: `⭐ ${rating}-star review${name ? ' from ' + name : ''}`, html, replyTo: email || undefined });

  res.status(200).json({ ok: true, googleReviewUrl: GOOGLE_REVIEW_URL });
}
