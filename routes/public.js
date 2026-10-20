const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const db = require('../db');
const v = require('../views');
const booking = require('../lib/booking');
const { slots, validDate } = require('../lib/availability');
const { send } = require('../lib/mail');
const { getSettings } = require('../content');
const { DEFAULT_LANG, normLang, t } = require('../i18n');

const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
// API calls come from /api/..., so the page's language travels in an X-Lang header set by site.js.
const langOf = req => normLang(req.get('x-lang'));
const bad = (req, res, key, code = 400, vars) => res.status(code).json({ error: t(langOf(req), key, vars) });
const clean = (s, max) => String(s ?? '').trim().slice(0, max);
const PHONE = /^\+?[\d\s().-]{7,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pages (req.lang is set by the language middleware in server.js)
router.get('/', (req, res) => res.send(v.home(req.lang)));
router.get('/book', (req, res) => res.send(v.book(req.lang)));
router.get('/privacy', (req, res) => res.send(v.privacy(req.lang)));
router.get('/booking/:token', (req, res, next) => {
  const a = booking.byToken(req.params.token);
  if (!a) return next();
  res.send(v.manage(req.lang, a, booking.isLocked(a)));
});

// API
router.get('/api/slots', (req, res) => {
  let ignoreId = 0;
  if (req.query.token) { const a = booking.byToken(req.query.token); if (a) ignoreId = a.id; }
  res.json({ slots: slots({ serviceId: +req.query.service, barberId: +req.query.barber || 0, date: String(req.query.date || ''), ignoreId }) });
});

router.post('/api/book', limit, (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80), phone = clean(b.phone, 20), email = clean(b.email, 120).toLowerCase(), date = clean(b.date, 10);
  if (name.length < 2) return bad(req, res, 'errName');
  if (!PHONE.test(phone)) return bad(req, res, 'errPhone');
  if (!EMAIL.test(email)) return bad(req, res, 'errEmail');
  if (!validDate(date) || !Number.isInteger(b.start_min)) return bad(req, res, 'errDateTime');
  if (b.consent !== true) return bad(req, res, 'errConsent');
  const a = booking.create({ serviceId: +b.service, barberId: +b.barber, date, startMin: b.start_min, name, phone, email, lang: langOf(req) });
  if (!a) return bad(req, res, 'errTaken', 409);
  booking.notify(a, 'booked');
  res.json({ token: a.token });
});

// Customer changes go through the private link from the confirmation email.
function mine(req, res) {
  const a = booking.byToken(req.params.token);
  if (!a || a.status !== 'booked') { bad(req, res, 'errNotFound', 404); return null; }
  if (booking.isLocked(a)) { bad(req, res, 'errLocked', 403, { phone: getSettings().phone }); return null; }
  return a;
}

router.post('/api/booking/:token/move', limit, (req, res) => {
  const a = mine(req, res); if (!a) return;
  const date = clean(req.body?.date, 10), start = req.body?.start_min;
  if (!validDate(date) || !Number.isInteger(start)) return bad(req, res, 'errDateTime');
  if (!booking.move(a, date, start)) return bad(req, res, 'errTaken', 409);
  booking.notify(booking.byId(a.id), 'moved', 'customer');
  res.json({ ok: true });
});

router.post('/api/booking/:token/cancel', limit, (req, res) => {
  const a = mine(req, res); if (!a) return;
  booking.cancel(a.id);
  booking.notify({ ...a, status: 'cancelled' }, 'cancelled', 'customer');
  res.json({ ok: true });
});

router.post('/api/contact', limit, (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot field, filled only by bots
  const name = clean(b.name, 80), phone = clean(b.phone, 20), message = clean(b.message, 2000);
  if (name.length < 2 || message.length < 5) return bad(req, res, 'errMsg');
  if (!PHONE.test(phone)) return bad(req, res, 'errPhone');
  if (b.consent !== true) return bad(req, res, 'errConsent');
  db.prepare('INSERT INTO messages (name, phone, message) VALUES (?,?,?)').run(name, phone, message);
  send(process.env.CONTACT_TO, `Website message from ${name}`, `${name}, ${phone}\n\n${message}`);
  res.json({ ok: true });
});

module.exports = router;
