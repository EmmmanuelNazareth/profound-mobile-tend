/**
 * GET /api/status?order=PMT-XXXX
 *
 * Public, read-only status for the customer tracker page. Returns only a safe
 * subset (no phone, address, email, or notes) so a shared link can't leak
 * personal details. The tracker polls this to show live progress.
 */
import { getBooking, STAGES, stageLabel, kvConfigured } from './_store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!kvConfigured()) {
    res.status(200).json({ ok: false, error: 'store not configured' });
    return;
  }
  const id = (req.query && (req.query.order || req.query.orderId) || '').toString().trim();
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing order id' });
    return;
  }

  let b;
  try {
    b = await getBooking(id);
  } catch (e) {
    res.status(200).json({ ok: false, error: 'lookup failed' });
    return;
  }
  if (!b) {
    res.status(404).json({ ok: false, error: 'not found' });
    return;
  }

  const firstName = (b.name || '').toString().split(' ')[0] || '';
  const idx = STAGES.findIndex((s) => s.key === b.status);
  const when = [b.dateDisp, b.time].filter(Boolean).join(' · ');

  res.status(200).json({
    ok: true,
    id: b.id,
    firstName,
    service: b.service || '',
    vehicle: b.vehicleSize || b.vehicle || '',
    when,
    status: b.status,
    statusLabel: stageLabel(b.status),
    stageIndex: idx, // -1 if before deposit_paid
    stages: STAGES.map((s) => ({ key: s.key, label: s.label })),
    depositPaid: !!b.depositPaid,
    balancePaid: !!b.balancePaid,
    deposit: Number(b.deposit || 0),
    balance: Number(b.balance || 0),
    price: Number(b.price || 0),
    // Only expose the pay link once the job is complete and unpaid.
    balanceUrl: b.status === 'complete' && !b.balancePaid ? (b.balanceUrl || '') : '',
    isQuote: !!b.isQuote,
  });
}
