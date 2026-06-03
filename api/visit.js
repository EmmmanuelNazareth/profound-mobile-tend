/**
 * POST /api/visit
 * Fires once per browser session from pmt-engage.js. Vercel's edge
 * headers give us the visitor's city/region/country/timezone without
 * any third-party geo lookup. We email the owner via Resend.
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
  } catch (e) {}

  const h = req.headers || {};
  const country = decodeURIComponent(h['x-vercel-ip-country'] || '') || 'Unknown';
  const region  = decodeURIComponent(h['x-vercel-ip-country-region'] || '') || '';
  const city    = decodeURIComponent(h['x-vercel-ip-city'] || '') || 'Unknown city';
  const lat     = h['x-vercel-ip-latitude'] || '';
  const lon     = h['x-vercel-ip-longitude'] || '';
  const tz      = decodeURIComponent(h['x-vercel-ip-timezone'] || '') || '';

  // Full visitor IP — this is the owner's own analytics, so show it in full.
  const ip = (h['x-forwarded-for'] || '').toString().split(',')[0].trim() || (h['x-real-ip'] || '').toString();

  const ua = (h['user-agent'] || '').toString();

  // Skip crawlers/bots so the owner only hears about real human visitors.
  // Covers Googlebot, Bingbot, social-media link unfurlers, uptime checks,
  // and generic scrapers. We still return ok:true so the client script
  // doesn't treat it as an error.
  const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|facebot|embedly|quora|pinterest|vkshare|whatsapp|telegrambot|discordbot|slackbot|twitterbot|linkedinbot|google-?(read-?aloud|other|site|favicon)|mediapartners|apis-google|feedfetcher|duckduckbot|yandex|baiduspider|sogou|exabot|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot|amazonbot|applebot|headless|monitor|uptime|pingdom|statuscake|curl|wget|python-requests|axios|go-http|java\/|okhttp|phantomjs/i;
  if (!ua || BOT_RE.test(ua)) {
    res.status(200).json({ ok: true, skipped: 'bot' });
    return;
  }

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

  const page   = (body.page || '/').toString().slice(0, 200);
  const ref    = (body.referrer || 'Direct').toString().slice(0, 200);
  const screen = (body.screen || '').toString().slice(0, 30);
  const lang   = (body.lang || (h['accept-language'] || '').toString().split(',')[0]).slice(0, 16);

  const niceLocation = [city, region, country].filter(Boolean).join(', ');
  const mapsUrl = (lat && lon) ? `https://www.google.com/maps?q=${lat},${lon}&z=11` : '';
  const niceTime = new Date().toLocaleString('en-US', { timeZone: tz || 'America/New_York' });

  const subject = `🌐 New visitor — ${niceLocation}`;
  const html = shell(
    `New visitor from ${city}`,
    `<p style="margin:0 0 14px;color:rgba(244,242,238,0.85);">Someone just opened your site. Here's where they're coming from:</p>
     ${kvTable([
       ['Location', niceLocation],
       ['Local time', niceTime],
       ['Timezone', tz],
       ['On page', page],
       ['Referrer', ref],
       ['Device', `${device} · ${os} · ${browser}`],
       ['Screen', screen],
       ['Language', lang],
       ['IP address', ip || 'unknown'],
     ])}
     ${mapsUrl ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(mapsUrl)}" style="color:#52b84f;text-decoration:none;font-weight:600;">View on map →</a></p>` : ''}`,
    'Visitor pings fire once per browser session, so you won\'t get spammed by page-to-page navigation.',
  );

  const result = await sendMail({ subject, html });
  if (!result.ok) {
    res.status(502).json({ error: result.error });
    return;
  }
  res.status(200).json({ ok: true });
}
