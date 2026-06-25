/**
 * /api/bookings — owner dashboard data (token-gated: manageToken('admin')).
 *
 *   GET  ?token=...                 → all bookings, newest first
 *   POST { action:'cancel', id, token } → cancel a booking. For Detail Day
 *        bookings this also releases the locked time slots so the calendar
 *        frees up for other residents.
 */
import { getBooking, saveBooking, kvSMembers, kvSRem, verifyManageToken, kvConfigured } from './_store.js';

export default async function handler(req, res) {
  if (!kvConfigured()) {
    res.status(200).json({ ok: false, error: 'store not configured' });
    return;
  }

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const token = (req.query && req.query.token || '').toString();
    if (!verifyManageToken('admin', token)) {
      res.status(403).json({ ok: false, error: 'Invalid admin token' });
      return;
    }
    let ids = [];
    try { ids = await kvSMembers('bookings:index'); } catch (e) {}
    const all = [];
    for (const id of ids) {
      try {
        const b = await getBooking(id);
        if (b) all.push(b);
      } catch (e) {}
    }
    all.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const list = all.map((b) => ({
      id: b.id, name: b.name, email: b.email, phone: b.phone,
      service: b.service, dateDisp: b.dateDisp, time: b.time, address: b.address,
      price: b.price, deposit: b.deposit, balance: b.balance,
      depositPaid: !!b.depositPaid, balancePaid: !!b.balancePaid,
      status: b.status, rating: b.rating || null,
      isDetailDay: !!b.detailDay, createdAt: b.createdAt,
    }));
    res.status(200).json({ ok: true, bookings: list });
    return;
  }

  if (req.method === 'POST') {
    let body = {};
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) {}
    if (!verifyManageToken('admin', (body.token || '').toString())) {
      res.status(403).json({ ok: false, error: 'Invalid admin token' });
      return;
    }
    if (body.action !== 'cancel') {
      res.status(400).json({ ok: false, error: 'Unknown action' });
      return;
    }
    const id = (body.id || '').toString().trim();
    const b = await getBooking(id);
    if (!b) {
      res.status(404).json({ ok: false, error: 'Booking not found' });
      return;
    }
    let freed = 0;
    // Release Detail Day slot locks so the calendar opens back up.
    if (b.detailDay && b.detailDay.eventKey && Array.isArray(b.detailDay.slots) && b.detailDay.slots.length) {
      try { await kvSRem(b.detailDay.eventKey, b.detailDay.slots); freed = b.detailDay.slots.length; } catch (e) {}
    }
    b.status = 'cancelled';
    b.cancelledAt = new Date().toISOString();
    b.statusHistory = b.statusHistory || [];
    b.statusHistory.push({ status: 'cancelled', at: b.cancelledAt });
    try { await saveBooking(b); } catch (e) {}
    res.status(200).json({ ok: true, freed });
    return;
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' });
}
