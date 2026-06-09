/**
 * Shared data layer for bookings, backed by Upstash Redis (provisioned via
 * Vercel → Storage). All access goes through the REST API with plain fetch,
 * so no client library / npm install is needed.
 *
 * Env vars are injected automatically by the Upstash Vercel integration.
 * We accept either the KV_* names (Vercel KV style) or the UPSTASH_* names.
 */
import crypto from 'crypto';

// Find the REST URL/token regardless of any custom prefix the Vercel/Upstash
// integration applied (e.g. PMT_KV_REST_API_URL). We match by suffix so the
// code works whether the vars are named KV_REST_API_URL, UPSTASH_REDIS_REST_URL,
// or <PREFIX>_KV_REST_API_URL.
function findEnvBySuffix(suffixes) {
  const entries = Object.entries(process.env);
  for (const suffix of suffixes) {
    for (const [k, v] of entries) {
      if (!v) continue;
      if (k === suffix || k.endsWith('_' + suffix)) return v;
    }
  }
  return '';
}

const KV_URL = findEnvBySuffix(['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']);
const KV_TOKEN = findEnvBySuffix(['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN']);

export function kvConfigured() {
  return !!(KV_URL && KV_TOKEN);
}

/** Run a single Redis command via the Upstash REST API. */
async function cmd(args) {
  if (!kvConfigured()) throw new Error('KV not configured');
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || (data && data.error)) {
    throw new Error((data && data.error) || `KV error ${r.status}`);
  }
  return data.result;
}

export async function getBooking(id) {
  if (!id) return null;
  const v = await cmd(['GET', `booking:${id}`]);
  if (v == null) return null;
  try {
    return JSON.parse(v);
  } catch (e) {
    return null;
  }
}

export async function saveBooking(b) {
  if (!b || !b.id) throw new Error('booking needs an id');
  b.updatedAt = new Date().toISOString();
  await cmd(['SET', `booking:${b.id}`, JSON.stringify(b)]);
  // Keep an index so the owner can list everything later if needed.
  await cmd(['SADD', 'bookings:index', b.id]).catch(() => {});
  return b;
}

export async function saveReview(review) {
  // Reviews are stored under the booking id when available, plus pushed onto
  // a list so they can all be pulled together.
  const id = review.orderId || `rev-${Date.now()}`;
  await cmd(['SET', `review:${id}`, JSON.stringify(review)]).catch(() => {});
  await cmd(['LPUSH', 'reviews:list', JSON.stringify(review)]).catch(() => {});
}

/* ─── Service stages (single source of truth, shared shape with the UI) ─── */
export const STAGES = [
  { key: 'deposit_paid', label: 'Deposit Paid' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'on_the_way', label: 'On The Way' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'complete', label: 'Complete' },
];
export function stageLabel(key) {
  const s = STAGES.find((x) => x.key === key);
  if (s) return s.label;
  if (key === 'pending_deposit') return 'Awaiting Deposit';
  if (key === 'paid') return 'Paid in Full';
  return key || 'Unknown';
}

/* ─── Owner management token ─────────────────────────────────────────────
 * Signs each booking id so only links we generated can change status. Uses a
 * dedicated secret if present, otherwise falls back to an existing server
 * secret — no new env var required to ship.
 */
const SECRET =
  process.env.MANAGE_SECRET ||
  process.env.RESEND_API_KEY ||
  process.env.SQUARE_ACCESS_TOKEN ||
  'pmt-dev-secret';

export function manageToken(orderId) {
  return crypto
    .createHmac('sha256', SECRET)
    .update('manage:' + orderId)
    .digest('hex')
    .slice(0, 24);
}

export function verifyManageToken(orderId, token) {
  if (!token) return false;
  const expected = manageToken(orderId);
  if (token.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch (e) {
    return false;
  }
}
