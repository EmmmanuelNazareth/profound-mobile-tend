/**
 * Square hosted-checkout helper + endpoint.
 *
 * Exports createSquarePaymentLink() so other endpoints (e.g. the balance
 * payment when a job is marked complete) can generate a Square link with the
 * same robust sanitize/retry logic. The default export is the public
 * POST /api/create-checkout handler used by the shop cart and booking deposit.
 *
 * Required Vercel env vars:
 *   SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_ENV ("production"|"sandbox"),
 *   SITE_URL (for the post-payment redirect).
 */

const SQUARE_VERSION = '2024-07-17';

/**
 * Create a Square payment link.
 * @param {object} o
 * @param {string} o.orderId
 * @param {number} o.amount        dollars
 * @param {string} [o.name]
 * @param {string} [o.email]
 * @param {string} [o.phone]
 * @param {string} [o.address]
 * @param {string} [o.note]
 * @param {Array}  [o.items]
 * @param {boolean}[o.tipping]      show Square's tip prompt (used for balance)
 * @param {string} [o.redirectUrl] override the post-payment redirect
 * @returns {Promise<{ok:boolean, url?:string, paymentLinkId?:string, status?:number, error?:string, details?:any}>}
 */
export async function createSquarePaymentLink(o) {
  const TOKEN = process.env.SQUARE_ACCESS_TOKEN;
  const LOCATION_ID = process.env.SQUARE_LOCATION_ID;
  const ENV = (process.env.SQUARE_ENV || 'production').toLowerCase();
  const SITE_URL = process.env.SITE_URL || 'https://profoundmobiletend.com';

  if (!TOKEN || !LOCATION_ID) {
    return { ok: false, status: 500, error: 'Payment not configured (missing Square keys).' };
  }

  const dollars = Number(o.amount);
  if (!o.orderId || !dollars || dollars <= 0) {
    return { ok: false, status: 400, error: 'Missing orderId or amount' };
  }

  const host = ENV === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  const cents = Math.round(dollars * 100);

  const description =
    Array.isArray(o.items) && o.items.length
      ? o.items.map((it) => `${it.name}${it.vehicle ? ' — ' + it.vehicle : ''} × ${it.qty || 1}`).join('\n')
      : 'Profound Mobile Tend order';

  const emailOk = typeof o.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email);
  let phoneOk;
  if (typeof o.phone === 'string') {
    const digits = o.phone.replace(/\D/g, '');
    if (digits.length === 10) phoneOk = '+1' + digits;
    else if (digits.length === 11 && digits.startsWith('1')) phoneOk = '+' + digits;
  }

  const redirect = o.redirectUrl || `${SITE_URL}/thank-you?order=${encodeURIComponent(o.orderId)}`;

  const payload = {
    idempotency_key: o.orderId + '-' + Date.now(),
    quick_pay: {
      name: `Profound Mobile Tend — Order ${o.orderId}`,
      price_money: { amount: cents, currency: 'USD' },
      location_id: LOCATION_ID,
    },
    description: description.slice(0, 1000),
    pre_populated_data: {
      buyer_email: emailOk ? o.email : undefined,
      buyer_phone_number: phoneOk || undefined,
      buyer_address: o.address ? { address_line_1: o.address, country: 'US' } : undefined,
    },
    checkout_options: {
      allow_tipping: !!o.tipping,
      redirect_url: redirect,
      ask_for_shipping_address: false,
      merchant_support_email: 'sales@profoundmobiletend.com',
    },
    payment_note: `Order ${o.orderId} — ${o.name || 'Customer'}${o.note ? ' — ' + o.note : ''}`.slice(0, 500),
  };

  async function callSquare(reqBody) {
    const r = await fetch(`${host}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Square-Version': SQUARE_VERSION,
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(reqBody),
    });
    const data = await r.json();
    return { ok: r.ok, status: r.status, data };
  }

  try {
    let attempt = await callSquare(payload);
    for (let i = 0; i < 2 && !attempt.ok; i++) {
      const code = attempt.data?.errors?.[0]?.code;
      if (code === 'INVALID_EMAIL_ADDRESS' && payload.pre_populated_data.buyer_email) {
        delete payload.pre_populated_data.buyer_email;
      } else if (code === 'INVALID_PHONE_NUMBER' && payload.pre_populated_data.buyer_phone_number) {
        delete payload.pre_populated_data.buyer_phone_number;
      } else {
        break;
      }
      payload.idempotency_key = o.orderId + '-' + Date.now() + '-r' + i;
      attempt = await callSquare(payload);
    }

    if (!attempt.ok) {
      const msg = attempt.data?.errors?.[0]?.detail || 'Square API error';
      return { ok: false, status: 502, error: msg, details: attempt.data };
    }
    const url = attempt.data?.payment_link?.url;
    if (!url) return { ok: false, status: 502, error: 'No payment URL returned by Square' };
    return { ok: true, url, paymentLinkId: attempt.data.payment_link.id };
  } catch (err) {
    return { ok: false, status: 500, error: 'Network error: ' + (err && err.message) };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  const { orderId, amount, name, email, phone, address, note, items, tipping } = body || {};
  const result = await createSquarePaymentLink({ orderId, amount, name, email, phone, address, note, items, tipping });
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, details: result.details });
    return;
  }
  res.status(200).json({ url: result.url, paymentLinkId: result.paymentLinkId });
}
