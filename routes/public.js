const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const db = require('../db');
const v = require('../views');
const booking = require('../lib/booking');
const { slots, validDate } = require('../lib/availability');
const { send } = require('../lib/mail');
const { getSettings } = require('../content');

const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const clean = (s, max) => String(s ?? '').trim().slice(0, max);
const PHONE = /^\+?[\d\s().-]{7,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pages
router.get('/', (req, res) => res.send(v.home()));
router.get('/book', (req, res) => res.send(v.book()));
router.get('/booking/:token', (req, res, next) => {
  const a = booking.byToken(req.params.token);
  if (!a) return next();
  res.send(v.manage(a, booking.isLocked(a)));
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
  if (name.length < 2) return bad(res, 'Enter your name.');
  if (!PHONE.test(phone)) return bad(res, 'Enter a valid phone number.');
  if (!EMAIL.test(email)) return bad(res, 'Enter a valid email address. Your confirmation is sent there.');
  if (!validDate(date) || !Number.isInteger(b.start_min)) return bad(res, 'Choose a date and a time.');
  const a = booking.create({ serviceId: +b.service, barberId: +b.barber, date, startMin: b.start_min, name, phone, email });
  if (!a) return bad(res, 'That time is no longer available. Choose another.', 409);
  booking.notify(a, 'booked');
  res.json({ token: a.token });
});

// Customer changes go through the private link from the confirmation email.
function mine(req, res) {
  const a = booking.byToken(req.params.token);
  if (!a || a.status !== 'booked') { bad(res, 'Appointment not found.', 404); return null; }
  if (booking.isLocked(a)) { bad(res, `Online changes close 2 hours before. Call ${getSettings().phone}.`, 403); return null; }
  return a;
}

router.post('/api/booking/:token/move', limit, (req, res) => {
  const a = mine(req, res); if (!a) return;
  const date = clean(req.body?.date, 10), start = req.body?.start_min;
  if (!validDate(date) || !Number.isInteger(start)) return bad(res, 'Choose a date and a time.');
  if (!booking.move(a, date, start)) return bad(res, 'That time is no longer available. Choose another.', 409);
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
  if (name.length < 2 || message.length < 5) return bad(res, 'Enter your name and a message.');
  if (!PHONE.test(phone)) return bad(res, 'Enter a valid phone number.');
  db.prepare('INSERT INTO messages (name, phone, message) VALUES (?,?,?)').run(name, phone, message);
  send(process.env.CONTACT_TO, `Website message from ${name}`, `${name}, ${phone}\n\n${message}`);
  res.json({ ok: true });
});

module.exports = router;
