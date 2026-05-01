/**
 * POST /api/visit
 * Records a new visitor and emails sales@profoundmobiletend.com with
 * geo + device info. Vercel automatically sets x-vercel-ip-* headers
 * based on the visitor's IP, so no external geo service is needed.
 *
 * The client (pmt-engage.js) fires this once per browser session so
 * the owner doesn't get spammed by every page-to-page navigation.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {}

  const h = req.headers || {};
  const country = decodeURIComponent(h['x-vercel-ip-country'] || '') || 'Unknown';
  const region  = decodeURIComponent(h['x-vercel-ip-country-region'] || '') || '';
  const city    = decodeURIComponent(h['x-vercel-ip-city'] || '') || 'Unknown city';
  const lat     = h['x-vercel-ip-latitude'] || '';
  const lon     = h['x-vercel-ip-longitude'] || '';
  const tz      = decodeURIComponent(h['x-vercel-ip-timezone'] || '') || '';

  // Truncate IP for privacy (keep first three octets) so the email isn't
  // a creepy full address but is still useful for distinguishing visitors.
  let ip = (h['x-forwarded-for'] || '').toString().split(',')[0].trim() || (h['x-real-ip'] || '').toString();
  if (ip && ip.indexOf('.') > -1) {
    const parts = ip.split('.');
    if (parts.length === 4) ip = parts.slice(0, 3).join('.') + '.x';
  }

  const ua = (h['user-agent'] || '').toString();
  // Quick OS / browser sniff — readable, not bulletproof.
  const os =
    /iPhone|iPad/.test(ua) ? 'iPhone/iPad' :
    /Android/.test(ua) ? 'Android' :
    /Mac OS X/.test(ua) ? 'Mac' :
    /Windows/.test(ua) ? 'Windows' :
    /Linux/.test(ua) ? 'Linux' : 'Unknown';
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' : 'Unknown';
  const device = /Mobile|Android|iPhone/.test(ua) ? 'Mobile' : 'Desktop';

  const page = (body.page || '/').toString().slice(0, 200);
  const ref  = (body.referrer || 'Direct').toString().slice(0, 200);
  const screen = (body.screen || '').toString().slice(0, 30);
  const lang = (body.lang || (h['accept-language'] || '').toString().split(',')[0]).slice(0, 16);

  const niceLocation = [city, region, country].filter(Boolean).join(', ');
  const mapsUrl = (lat && lon) ? `https://www.google.com/maps?q=${lat},${lon}&z=11` : '';

  const payload = {
    _subject: `Site visitor — ${niceLocation}`,
    _template: 'table',
    _captcha: 'false',
    location: niceLocation,
    city,
    region,
    country,
    coordinates: (lat && lon) ? `${lat}, ${lon}` : '',
    map_link: mapsUrl,
    timezone: tz,
    page_visited: page,
    referrer: ref,
    device,
    os,
    browser,
    screen,
    language: lang,
    ip_partial: ip || 'unknown',
    visited_at: new Date().toISOString(),
  };

  try {
    const r = await fetch('https://formsubmit.co/ajax/sales@profoundmobiletend.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      res.status(502).json({ error: 'Relay failed' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Network error' });
  }
}
