/**
 * POST /api/chat
 * Relays a chat message from the on-site widget to sales@profoundmobiletend.com.
 * Uses FormSubmit.co (same transport as the booking form) so no extra env vars
 * are required. This is fire-and-forget from the client's perspective — the
 * owner sees a threaded email per session.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  const { sessionId, name, email, message, page } = body || {};
  if (!message || !email || !name) {
    res.status(400).json({ error: 'Missing name, email, or message' });
    return;
  }

  const payload = {
    _subject: `Live Chat — ${name} · session ${String(sessionId || '').slice(0, 14)}`,
    _template: 'table',
    _captcha: 'false',
    _replyto: email,
    session_id: sessionId || '',
    visitor_name: name,
    visitor_email: email,
    message,
    from_page: page || '/',
    received_at: new Date().toISOString(),
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
    res.status(500).json({ error: 'Network error: ' + (err && err.message) });
  }
}
