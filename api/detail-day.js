/**
 * /api/detail-day
 *   GET  → returns the current Detail Day event config (public, read-only).
 *   POST → saves a new config (owner only — requires the management token).
 *
 * Lets the owner reconfigure the single shareable /detail-day page per
 * property/event without any code changes. Token is HMAC-signed for the
 * fixed id "detailday".
 */
import { kvGetJSON, kvSetJSON, verifyManageToken, kvConfigured } from './_store.js';

const KEY = 'detailday:config';

export default async function handler(req, res) {
  if (!kvConfigured()) {
    res.status(200).json({ ok: false, error: 'store not configured' });
    return;
  }

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    let cfg = null;
    try { cfg = await kvGetJSON(KEY); } catch (e) {}
    res.status(200).json({ ok: true, config: cfg });
    return;
  }

  if (req.method === 'POST') {
    let body = {};
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (e) {
      res.status(400).json({ ok: false, error: 'Invalid JSON' });
      return;
    }
    if (!verifyManageToken('detailday', (body.token || '').toString())) {
      res.status(403).json({ ok: false, error: 'Invalid editor token' });
      return;
    }

    const property = (body.property || '').toString().trim().slice(0, 120);
    const date = (body.date || '').toString().trim().slice(0, 120);
    const location = (body.location || '').toString().trim().slice(0, 160);
    if (!property || !date) {
      res.status(400).json({ ok: false, error: 'Property name and date are required.' });
      return;
    }

    // Services: array of {name, desc, price}
    const services = Array.isArray(body.services)
      ? body.services
          .map((s) => ({
            name: (s.name || '').toString().trim().slice(0, 80),
            desc: (s.desc || '').toString().trim().slice(0, 160),
            price: (s.price || '').toString().trim().slice(0, 24),
          }))
          .filter((s) => s.name)
          .slice(0, 12)
      : [];

    // Slots: array of {t, taken}
    const slots = Array.isArray(body.slots)
      ? body.slots
          .map((s) => ({ t: (s.t || '').toString().trim().slice(0, 24), taken: !!s.taken }))
          .filter((s) => s.t)
          .slice(0, 40)
      : [];

    const config = { property, date, location, services, slots, updatedAt: new Date().toISOString() };
    try {
      await kvSetJSON(KEY, config);
    } catch (e) {
      res.status(502).json({ ok: false, error: 'Could not save config.' });
      return;
    }
    res.status(200).json({ ok: true, config });
    return;
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' });
}
