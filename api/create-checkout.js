/**
 * POST /api/create-checkout
 * Creates a Square-hosted payment link for the cart total and returns its URL.
 * The customer is then redirected to Square's secure checkout page.
 *
 * Required Vercel environment variables (Project → Settings → Environment Variables):
 *   SQUARE_ACCESS_TOKEN   — Square access token (Production or Sandbox)
 *   SQUARE_LOCATION_ID    — Your Square Location ID
 *   SQUARE_ENV            — "production" (default) or "sandbox"
 *   SITE_URL              — https://profoundmobiletend.com (for success/cancel redirects)
 *
 * Request body:
 *   { orderId, amount (number, dollars), name, email, phone, address, note, items[] }
 *
 * Response:
 *   200 { url: "https://sandbox.square.link/..." }
 *   4xx/5xx { error: "..." }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const TOKEN = process.env.SQUARE_ACCESS_TOKEN;
  const LOCATION_ID = process.env.SQUARE_LOCATION_ID;
  const ENV = (process.env.SQUARE_ENV || 'production').toLowerCase();
  const SITE_URL = process.env.SITE_URL || 'https://profoundmobiletend.com';

  if (!TOKEN || !LOCATION_ID) {
    res.status(500).json({
      error:
        'Payment not configured. Add SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID to Vercel environment variables.',
    });
    return;
  }

  const host = ENV === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const { orderId, amount, name, email, phone, address, note, items } = body || {};
  const dollars = Number(amount);
  if (!orderId || !dollars || dollars <= 0) {
    res.status(400).json({ error: 'Missing orderId or amount' });
    return;
  }

  const cents = Math.round(dollars * 100);
  const description =
    Array.isArray(items) && items.length
      ? items
          .map(
            (it) =>
              `${it.name}${it.vehicle ? ' — ' + it.vehicle : ''} × ${it.qty}`
          )
          .join('\n')
      : 'Profound Mobile Tend order';

  // Square rejects malformed email/phone with a hard error — sanitize before
  // passing so a customer typo can't block checkout. Square wants E.164-ish
  // phone (+15551234567) and a syntactically-valid email.
  const emailOk = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  let phoneOk;
  if (typeof phone === 'string') {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) phoneOk = '+1' + digits;
    else if (digits.length === 11 && digits.startsWith('1')) phoneOk = '+' + digits;
  }

  const payload = {
    idempotency_key: orderId + '-' + Date.now(),
    quick_pay: {
      name: `Profound Mobile Tend — Order ${orderId}`,
      price_money: { amount: cents, currency: 'USD' },
      location_id: LOCATION_ID,
    },
    description: description.slice(0, 1000),
    pre_populated_data: {
      buyer_email: emailOk ? email : undefined,
      buyer_phone_number: phoneOk || undefined,
      buyer_address: address
        ? { address_line_1: address, country: 'US' }
        : undefined,
    },
    checkout_options: {
      allow_tipping: false,
      redirect_url: `${SITE_URL}/thank-you?order=${encodeURIComponent(orderId)}`,
      ask_for_shipping_address: false,
      merchant_support_email: 'sales@profoundmobiletend.com',
    },
    payment_note: `Order ${orderId} — ${name || 'Customer'}${note ? ' — ' + note : ''}`.slice(0, 500),
  };

  try {
    const r = await fetch(`${host}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Square-Version': '2024-07-17',
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg =
        (data && data.errors && data.errors[0] && data.errors[0].detail) ||
        'Square API error';
      res.status(502).json({ error: msg, details: data });
      return;
    }
    const url = data && data.payment_link && data.payment_link.url;
    if (!url) {
      res.status(502).json({ error: 'No payment URL returned by Square' });
      return;
    }
    res.status(200).json({ url, paymentLinkId: data.payment_link.id });
  } catch (err) {
    res.status(500).json({ error: 'Network error: ' + (err && err.message) });
  }
}
