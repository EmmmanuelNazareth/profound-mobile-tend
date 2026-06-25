/**
 * /api/detail-day  — editable, self-booking Detail Day event.
 *
 *   GET                         → { config, slots[], booked[] } for the page
 *   POST {token, ...config}     → owner saves the event (property/date/services)
 *   POST {action:'book', ...}   → a resident reserves a time (public). Locks the
 *                                 consecutive 45-min slots the service needs, so
 *                                 it shows filled to everyone else. Emails owner.
 *
 * Hours (business rule): 8:00 AM–7:00 PM Mon–Sat, Wed until 4:50 PM, closed Sun.
 * Base slot = 45 min (Express Wash). A service's minutes / 45 (rounded up) =
 * how many back-to-back slots it locks (Full Detail 90 min = 2 slots).
 */
import { kvGetJSON, kvSetJSON, kvSMembers, kvSAdd, kvSRem, saveBooking, verifyManageToken, kvConfigured } from './_store.js';
import { sendMail, shell, kvTable, escapeHtml } from './_sendmail.js';
import { createSquarePaymentLink } from './create-checkout.js';

const SITE_URL = process.env.SITE_URL || 'https://profoundmobiletend.com';
const DEPOSIT_RATE = 0.5; // Detail Day collects 50% up front
const CONFIG_KEY = 'detailday:config';
const SLOT_MIN = 45;
const OPEN_MIN = 8 * 60;            // 8:00 AM
const CLOSE_DEFAULT = 19 * 60;      // 7:00 PM
const CLOSE_WED = 16 * 60 + 50;     // 4:50 PM
const WD = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function label(min) {
  let h = Math.floor(min / 60), m = min % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  const dh = h % 12 === 0 ? 12 : h % 12;
  return `${dh}:${String(m).padStart(2, '0')} ${ap}`;
}
function closeFor(weekday) {
  if (weekday === 0) return null;            // Sunday closed
  return weekday === 3 ? CLOSE_WED : CLOSE_DEFAULT;
}
function weekdayOf(dateStr) {
  // noon avoids any timezone day-shift
  const d = new Date(dateStr + 'T12:00:00');
  return isNaN(d) ? null : d.getDay();
}
function genSlots(dateStr) {
  const wd = weekdayOf(dateStr);
  if (wd == null) return { slots: [], close: null, wd: null };
  const close = closeFor(wd);
  if (close == null) return { slots: [], close: null, wd };
  const slots = [];
  for (let m = OPEN_MIN; m + SLOT_MIN <= close; m += SLOT_MIN) slots.push({ min: m, label: label(m) });
  return { slots, close, wd };
}
function slotsNeeded(mins) {
  const n = Number(mins) || SLOT_MIN;
  return Math.max(1, Math.ceil(n / SLOT_MIN));
}
function displayDate(dateStr) {
  const wd = weekdayOf(dateStr);
  if (wd == null) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const close = closeFor(wd);
  const hours = close == null ? 'Closed' : `${label(OPEN_MIN)} – ${label(close)}`;
  return `${WD[wd]}, ${MON[d.getMonth()]} ${d.getDate()} · ${hours}`;
}
function eventKey(cfg) {
  const slug = (cfg.property || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `detailday:booked:${cfg.eventDate || 'nodate'}:${slug}`.slice(0, 90);
}

export default async function handler(req, res) {
  if (!kvConfigured()) {
    res.status(200).json({ ok: false, error: 'store not configured' });
    return;
  }

  // ── GET: page data ──
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const cfg = (await kvGetJSON(CONFIG_KEY)) || null;
    let slots = [], booked = [];
    if (cfg && cfg.eventDate) {
      slots = genSlots(cfg.eventDate).slots;
      try {
        booked = (await kvSMembers(eventKey(cfg))).map(Number);
      } catch (e) {}
    }
    const out = cfg ? { ...cfg, displayDate: cfg.eventDate ? displayDate(cfg.eventDate) : (cfg.date || '') } : null;
    res.status(200).json({ ok: true, config: out, slots, booked });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    res.status(400).json({ ok: false, error: 'Invalid JSON' });
    return;
  }

  // ── POST book: resident reserves a slot (public) ──
  if (body.action === 'book') {
    const cfg = await kvGetJSON(CONFIG_KEY);
    if (!cfg || !cfg.eventDate) {
      res.status(409).json({ ok: false, error: 'No active event right now.' });
      return;
    }
    const serviceName = (body.service || '').toString().trim();
    const startMin = parseInt(body.startMin, 10);
    const name = (body.name || '').toString().trim();
    const email = (body.email || '').toString().trim();
    const phone = (body.phone || '').toString().trim();
    const vehicle = (body.vehicle || '').toString().trim();
    const unit = (body.unit || '').toString().trim();

    if (!serviceName || isNaN(startMin) || !name || (!email && !phone)) {
      res.status(400).json({ ok: false, error: 'Missing required booking details.' });
      return;
    }

    const svc = (cfg.services || []).find((s) => s.name === serviceName);
    if (!svc) {
      res.status(400).json({ ok: false, error: 'Unknown service.' });
      return;
    }
    const need = slotsNeeded(svc.mins);
    const { slots } = genSlots(cfg.eventDate);
    const startIdx = slots.findIndex((s) => s.min === startMin);
    if (startIdx < 0 || startIdx + need > slots.length) {
      res.status(400).json({ ok: false, error: 'That time does not fit this service before closing.' });
      return;
    }
    const required = slots.slice(startIdx, startIdx + need).map((s) => s.min);

    const key = eventKey(cfg);
    const booked = (await kvSMembers(key)).map(Number);
    const clash = required.some((m) => booked.includes(m));
    if (clash) {
      res.status(409).json({ ok: false, error: 'Sorry — that time was just booked. Please pick another.', booked });
      return;
    }
    // Lock the slots first so a parallel request can't grab them while we set up payment.
    await kvSAdd(key, required);
    const newBooked = booked.concat(required);

    const when = `${label(startMin)} – ${label(startMin + need * SLOT_MIN)}`;
    const priceMatch = String(svc.price || '').match(/([\d,]+\.\d{2}|\d+(?:\.\d+)?)/);
    const priceNum = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;
    const deposit = Math.round(priceNum * DEPOSIT_RATE * 100) / 100;
    const balance = Math.round((priceNum - deposit) * 100) / 100;

    const bookingId = 'PMT-' + Date.now().toString(36).toUpperCase().slice(-6);
    const now = new Date().toISOString();
    const addr = (cfg.property || '') + (cfg.location ? ' — ' + cfg.location : '');

    // For priced services, take a 50% deposit through Square and route the
    // resident into the live tracking pipeline (deposit → track → balance → review).
    let payUrl = null;
    if (priceNum > 0) {
      const pay = await createSquarePaymentLink({
        orderId: bookingId,
        amount: deposit,
        name, email, phone, address: addr,
        note: `Detail Day 50% deposit — ${svc.name} @ ${when} · ${cfg.property || ''}`,
        items: [{ name: `Deposit (50%) — ${svc.name} · Detail Day`, qty: 1 }],
      });
      if (!pay.ok) {
        await kvSRem(key, required); // release the lock — payment couldn't start
        res.status(502).json({ ok: false, error: pay.error || 'Could not start payment. Please try again.' });
        return;
      }
      payUrl = pay.url;
    }

    const booking = {
      id: bookingId, name, email, phone,
      address: addr, vehicle, vehicleSize: '', notes: unit ? ('Unit/Apt: ' + unit) : '',
      service: svc.name, serviceId: 'detail-day', duration: need * SLOT_MIN + ' min',
      price: priceNum, deposit, balance, isQuote: false,
      date: cfg.eventDate, dateDisp: displayDate(cfg.eventDate), time: when,
      status: priceNum > 0 ? 'pending_deposit' : 'scheduled',
      depositPaid: priceNum > 0 ? false : true, balancePaid: false, balanceUrl: '',
      rating: null,
      statusHistory: [{ status: priceNum > 0 ? 'pending_deposit' : 'scheduled', at: now }],
      createdAt: now,
      detailDay: { property: cfg.property, eventDate: cfg.eventDate, startMin, slots: required, eventKey: key },
    };
    try { await saveBooking(booking); } catch (e) { console.log('detail-day booking save note:', e && e.message); }

    // Notify the owner now (lead is captured even if the deposit is abandoned).
    const html = shell(
      `Detail Day booking — ${cfg.property || ''}`,
      `<p style="margin:0 0 14px;color:rgba(244,242,238,0.85);">New Detail Day reservation${priceNum > 0 ? ' — resident was sent to pay the 50% deposit' : ''}.</p>
       ${kvTable([
         ['Booking ID', bookingId],
         ['Property', cfg.property],
         ['Event date', displayDate(cfg.eventDate)],
         ['Service', `${svc.name}${svc.price ? ' (' + svc.price + ')' : ''}`],
         ['Time', when],
         ['Name', name],
         ['Unit / Apt', unit],
         ['Phone', phone],
         ['Email', email],
         ['Vehicle', vehicle],
         ['Deposit (50%)', priceNum > 0 ? `$${deposit.toFixed(2)}` : 'n/a'],
         ['Balance', priceNum > 0 ? `$${balance.toFixed(2)}` : 'n/a'],
         ['Status', priceNum > 0 ? 'Deposit pending' : 'Reserved'],
       ])}`,
      email ? `Reply goes to <strong>${escapeHtml(email)}</strong>.` : 'No email — call the number above to confirm.',
    );
    await sendMail({ subject: `📅 Detail Day — ${name} · ${label(startMin)} · ${cfg.property || ''}`, html, replyTo: email || undefined });

    res.status(200).json({ ok: true, booked: newBooked, when, url: payUrl, orderId: bookingId });
    return;
  }

  // ── POST save config: owner only ──
  if (!verifyManageToken('detailday', (body.token || '').toString())) {
    res.status(403).json({ ok: false, error: 'Invalid editor token' });
    return;
  }
  const property = (body.property || '').toString().trim().slice(0, 120);
  const eventDate = (body.eventDate || '').toString().trim().slice(0, 10);
  const location = (body.location || '').toString().trim().slice(0, 160);
  if (!property || !eventDate || weekdayOf(eventDate) == null) {
    res.status(400).json({ ok: false, error: 'Property name and a valid date are required.' });
    return;
  }
  if (closeFor(weekdayOf(eventDate)) == null) {
    res.status(400).json({ ok: false, error: 'That date is a Sunday — we are closed. Pick Mon–Sat.' });
    return;
  }
  const services = Array.isArray(body.services)
    ? body.services
        .map((s) => ({
          name: (s.name || '').toString().trim().slice(0, 80),
          desc: (s.desc || '').toString().trim().slice(0, 160),
          price: (s.price || '').toString().trim().slice(0, 24),
          was: (s.was || '').toString().trim().slice(0, 24),
          mins: Math.max(15, Math.min(480, parseInt(s.mins, 10) || SLOT_MIN)),
        }))
        .filter((s) => s.name)
        .slice(0, 12)
    : [];

  const config = { property, eventDate, location, services, updatedAt: new Date().toISOString() };
  try {
    await kvSetJSON(CONFIG_KEY, config);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'Could not save config.' });
    return;
  }
  res.status(200).json({ ok: true, config: { ...config, displayDate: displayDate(eventDate) } });
}
