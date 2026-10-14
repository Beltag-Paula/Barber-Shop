const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const db = require('../db');
const C = require('../content');
const v = require('../views');
const booking = require('../lib/booking');
const { upload, saveImage, removeUpload } = require('../lib/images');
const { validDate, hhmm, ymd } = require('../lib/availability');

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
const str = (val, max, label, required = false) => { const s = String(val ?? '').trim().slice(0, max); if (required && !s) fail(`${label} is required.`); return s; };
const int = (val, min, max, label) => { const n = Number(val); if (!Number.isInteger(n) || n < min || n > max) fail(`${label} must be a whole number from ${min} to ${max}.`); return n; };
const wrap = fn => (req, res, next) => { try { Promise.resolve(fn(req, res, next)).catch(next); } catch (e) { next(e); } };
const isOwner = req => !req.session.user.barber_id;
const owner = (req, res, next) => (isOwner(req) ? next() : res.status(403).json({ error: 'Only the owner can do that.' }));
const exists = (table, id) => !!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);

router.get('/login', (req, res) => (req.session.user ? res.redirect('/admin') : res.send(v.login())));

router.post('/api/login', loginLimit, wrap((req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const u = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email);
  if (!u || !bcrypt.compareSync(String(req.body?.password || ''), u.password_hash)) fail('Wrong email or password.', 401);
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not sign in. Try again.' });
    req.session.user = { id: u.id, email: u.email, barber_id: u.barber_id };
    res.json({ ok: true });
  });
}));

// Everything below needs a signed-in owner or barber.
router.use((req, res, next) => {
  if (req.session.user) return next();
  return req.path.startsWith('/api') ? res.status(401).json({ error: 'Sign in required.' }) : res.redirect('/admin/login');
});

router.get('/', (req, res) => res.send(v.admin(req.session.user)));
router.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

router.post('/api/password', wrap((req, res) => {
  const u = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.session.user.id);
  if (!bcrypt.compareSync(String(req.body?.current || ''), u.password_hash)) fail('Your current password is wrong.', 403);
  const next = String(req.body?.next || '');
  if (next.length < 10) fail('Use at least 10 characters for the new password.');
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 12), u.id);
  res.json({ ok: true });
}));

// ---- Appointments. A barber account sees only its own column; the owner sees everyone. ----
router.get('/api/appointments', wrap((req, res) => {
  const date = String(req.query.date || '');
  if (!validDate(date)) fail('Invalid date.');
  const own = req.session.user.barber_id;
  const rows = db.prepare(`SELECT a.*, b.name AS barber_name, s.name AS service_name
    FROM appointments a JOIN barbers b ON b.id = a.barber_id JOIN services s ON s.id = a.service_id
    WHERE a.date = ? AND a.status = 'booked' ${own ? 'AND a.barber_id = ?' : ''}
    ORDER BY b.id, a.start_min`).all(...(own ? [date, own] : [date]));
  res.json({ appointments: rows.map(r => ({ ...r, start: hhmm(r.start_min), end: hhmm(r.end_min) })) });
}));

function ownedAppt(req) {
  const a = booking.byId(+req.params.id);
  const own = req.session.user.barber_id;
  if (!a || a.status !== 'booked' || (own && a.barber_id !== own)) fail('Appointment not found.', 404);
  return a;
}
router.post('/api/appointments/:id/move', wrap((req, res) => {
  const a = ownedAppt(req);
  const date = String(req.body?.date || ''), start = req.body?.start_min;
  if (!validDate(date) || !Number.isInteger(start)) fail('Choose a date and a time.');
  if (!booking.move(a, date, start)) fail('That time is not free.', 409);
  booking.notify(booking.byId(a.id), 'moved', 'shop');
  res.json({ ok: true });
}));
router.post('/api/appointments/:id/cancel', wrap((req, res) => {
  const a = ownedAppt(req);
  booking.cancel(a.id);
  booking.notify({ ...a, status: 'cancelled' }, 'cancelled', 'shop');
  res.json({ ok: true });
}));

// ---- Site text and location ----
router.get('/api/settings', owner, (req, res) => res.json({ fields: C.FIELDS, values: C.getSettings() }));
router.put('/api/settings', owner, wrap((req, res) => {
  try { C.setSettings(req.body || {}); } catch (e) { fail(e.message); }
  res.json({ values: C.getSettings() });
}));

// ---- Section background images ----
router.get('/api/images', owner, (req, res) => res.json({ images: Object.entries(C.IMAGE_SLOTS).map(([slot, s]) =>
  ({ slot, label: s.label, hint: s.hint, url: C.slotUrl(slot) || s.def, custom: !!C.slotUrl(slot) })) }));
router.post('/api/images/:slot', owner, upload.single('photo'), wrap(async (req, res) => {
  const s = C.IMAGE_SLOTS[req.params.slot];
  if (!s) fail('Unknown image.', 404);
  const url = await saveImage(req.file, { maxWidth: s.maxWidth });
  const old = C.slotUrl(req.params.slot);
  C.setSlot(req.params.slot, url);
  removeUpload(old);
  res.json({ url });
}));
router.delete('/api/images/:slot', owner, wrap((req, res) => {
  if (!C.IMAGE_SLOTS[req.params.slot]) fail('Unknown image.', 404);
  removeUpload(C.slotUrl(req.params.slot));
  C.clearSlot(req.params.slot);
  res.json({ ok: true });
}));

// ---- Services ----
const linkBarbers = (serviceId, ids) => {
  db.prepare('DELETE FROM barber_services WHERE service_id = ?').run(serviceId);
  const add = db.prepare('INSERT OR IGNORE INTO barber_services (barber_id, service_id) SELECT id, ? FROM barbers WHERE id = ?');
  for (const id of ids) add.run(serviceId, id);
};
function readService(b) {
  return {
    name: str(b.name, 80, 'Name', true), description: str(b.description, 200),
    price: int(b.price, 0, 100000, 'Price'), duration: int(b.duration_min, 5, 600, 'Duration'),
    icon: v.ICON_KEYS.includes(b.icon) ? b.icon : 'scissors', sort: int(b.sort ?? 0, 0, 1000, 'Order'), active: b.active ? 1 : 0,
    barbers: Array.isArray(b.barbers) ? b.barbers.map(Number).filter(Number.isInteger) : null,
  };
}
router.get('/api/services', owner, (req, res) => res.json({
  icons: v.ICON_KEYS,
  barbers: db.prepare('SELECT id, name FROM barbers WHERE active = 1 ORDER BY id').all(),
  services: db.prepare('SELECT * FROM services ORDER BY sort, id').all().map(s => ({
    ...s, barbers: db.prepare('SELECT barber_id FROM barber_services WHERE service_id = ?').all(s.id).map(r => r.barber_id) })),
}));
router.post('/api/services', owner, wrap((req, res) => {
  const s = readService(req.body || {});
  const id = db.transaction(() => {
    const id = db.prepare('INSERT INTO services (name, description, duration_min, price, icon, sort, active) VALUES (?,?,?,?,?,?,?)')
      .run(s.name, s.description, s.duration, s.price, s.icon, s.sort, s.active).lastInsertRowid;
    linkBarbers(id, s.barbers ?? db.prepare('SELECT id FROM barbers WHERE active = 1').all().map(r => r.id));
    return id;
  })();
  res.json({ id });
}));
router.put('/api/services/:id', owner, wrap((req, res) => {
  const id = +req.params.id;
  if (!exists('services', id)) fail('Service not found.', 404);
  const s = readService(req.body || {});
  db.transaction(() => {
    db.prepare('UPDATE services SET name=?, description=?, duration_min=?, price=?, icon=?, sort=?, active=? WHERE id=?')
      .run(s.name, s.description, s.duration, s.price, s.icon, s.sort, s.active, id);
    if (s.barbers) linkBarbers(id, s.barbers);
  })();
  res.json({ ok: true });
}));
router.delete('/api/services/:id', owner, wrap((req, res) => {
  const id = +req.params.id;
  if (!exists('services', id)) fail('Service not found.', 404);
  // Services with booking history are hidden instead of deleted, so old appointments keep their name.
  if (db.prepare('SELECT 1 FROM appointments WHERE service_id = ?').get(id)) {
    db.prepare('UPDATE services SET active = 0 WHERE id = ?').run(id);
    return res.json({ deactivated: true });
  }
  db.prepare('DELETE FROM services WHERE id = ?').run(id);
  res.json({ ok: true });
}));

// ---- Team: profile, photo, weekly schedule, days off, logins ----
const canEditBarber = (req, id) => {
  if (!exists('barbers', id)) fail('Team member not found.', 404);
  if (!isOwner(req) && req.session.user.barber_id !== id) fail('You can only edit your own profile.', 403);
};
function teamRow(b, ownerView) {
  const hours = Array(7).fill(null);
  for (const h of db.prepare('SELECT weekday, opens, closes FROM working_hours WHERE barber_id = ?').all(b.id)) hours[h.weekday] = { opens: h.opens, closes: h.closes };
  const login = ownerView ? db.prepare('SELECT email FROM admin_users WHERE barber_id = ?').get(b.id) : null;
  return { ...b, hours, login_email: login?.email || '',
    timeoff: db.prepare('SELECT id, date, reason FROM time_off WHERE barber_id = ? AND date >= ? ORDER BY date').all(b.id, ymd(new Date())) };
}
router.get('/api/team', (req, res) => {
  const own = req.session.user.barber_id;
  const rows = own ? db.prepare('SELECT * FROM barbers WHERE id = ?').all(own) : db.prepare('SELECT * FROM barbers ORDER BY active DESC, id').all();
  res.json({ team: rows.map(b => teamRow(b, !own)) });
});
router.post('/api/team', owner, wrap((req, res) => {
  const name = str(req.body?.name, 80, 'Name', true);
  const id = db.transaction(() => {
    const id = db.prepare('INSERT INTO barbers (name, role, bio) VALUES (?,?,?)').run(name, str(req.body?.role, 80), str(req.body?.bio, 1000)).lastInsertRowid;
    db.prepare('INSERT INTO barber_services (barber_id, service_id) SELECT ?, id FROM services WHERE active = 1').run(id);
    for (const d of [2, 3, 4, 5, 6]) db.prepare('INSERT INTO working_hours VALUES (?,?,?,?)').run(id, d, '10:00', '19:00');
    return id;
  })();
  res.json({ id });
}));
router.put('/api/team/:id', wrap((req, res) => {
  const id = +req.params.id; canEditBarber(req, id);
  const b = req.body || {};
  const email = str(b.email, 120);
  if (email && !EMAIL.test(email)) fail('Enter a valid email address for notifications.');
  const active = isOwner(req) ? (b.active ? 1 : 0) : db.prepare('SELECT active FROM barbers WHERE id = ?').get(id).active;
  db.prepare('UPDATE barbers SET name=?, role=?, bio=?, email=?, active=? WHERE id=?')
    .run(str(b.name, 80, 'Name', true), str(b.role, 80), str(b.bio, 1000), email || null, active, id);
  res.json({ ok: true });
}));
router.post('/api/team/:id/photo', upload.single('photo'), wrap(async (req, res) => {
  const id = +req.params.id; canEditBarber(req, id);
  const url = await saveImage(req.file, { maxWidth: 900 });
  removeUpload(db.prepare('SELECT photo FROM barbers WHERE id = ?').get(id).photo);
  db.prepare('UPDATE barbers SET photo = ? WHERE id = ?').run(url, id);
  res.json({ url });
}));
router.delete('/api/team/:id/photo', wrap((req, res) => {
  const id = +req.params.id; canEditBarber(req, id);
  removeUpload(db.prepare('SELECT photo FROM barbers WHERE id = ?').get(id).photo);
  db.prepare('UPDATE barbers SET photo = NULL WHERE id = ?').run(id);
  res.json({ ok: true });
}));
// Weekly schedule: days[0..6] (Sunday first), each null for a day off or {opens, closes}.
router.put('/api/team/:id/hours', wrap((req, res) => {
  const id = +req.params.id; canEditBarber(req, id);
  const days = req.body?.days;
  if (!Array.isArray(days) || days.length !== 7) fail('Send seven days.');
  const rows = [];
  days.forEach((d, i) => {
    if (!d) return;
    if (!TIME.test(d.opens) || !TIME.test(d.closes) || d.opens >= d.closes) fail('Each working day needs an opening time earlier than its closing time.');
    rows.push([id, i, d.opens, d.closes]);
  });
  db.transaction(() => {
    db.prepare('DELETE FROM working_hours WHERE barber_id = ?').run(id);
    for (const r of rows) db.prepare('INSERT INTO working_hours VALUES (?,?,?,?)').run(...r);
  })();
  res.json({ ok: true });
}));
router.post('/api/team/:id/timeoff', wrap((req, res) => {
  const id = +req.params.id; canEditBarber(req, id);
  const date = String(req.body?.date || '');
  if (!validDate(date)) fail('Choose a date.');
  const t = db.prepare('INSERT INTO time_off (barber_id, date, reason) VALUES (?,?,?)').run(id, date, str(req.body?.reason, 80));
  // Existing bookings are not cancelled automatically; tell the admin so they can move them.
  res.json({ id: t.lastInsertRowid, booked: db.prepare("SELECT COUNT(*) AS n FROM appointments WHERE barber_id = ? AND date = ? AND status = 'booked'").get(id, date).n });
}));
router.delete('/api/timeoff/:id', wrap((req, res) => {
  const t = db.prepare('SELECT * FROM time_off WHERE id = ?').get(+req.params.id);
  if (!t) fail('Not found.', 404);
  canEditBarber(req, t.barber_id);
  db.prepare('DELETE FROM time_off WHERE id = ?').run(t.id);
  res.json({ ok: true });
}));
// The owner can create or update the sign-in for a barber, who then manages their own profile and bookings.
router.put('/api/team/:id/login', owner, wrap((req, res) => {
  const id = +req.params.id;
  if (!exists('barbers', id)) fail('Team member not found.', 404);
  const email = str(req.body?.email, 120).toLowerCase(), pw = String(req.body?.password || '');
  if (!EMAIL.test(email)) fail('Enter a valid sign-in email.');
  const u = db.prepare('SELECT * FROM admin_users WHERE barber_id = ?').get(id);
  if (db.prepare('SELECT 1 FROM admin_users WHERE email = ? AND id != ?').get(email, u?.id ?? 0)) fail('That email already has a login.', 409);
  if (pw && pw.length < 10) fail('Use at least 10 characters for the password.');
  if (u) {
    db.prepare('UPDATE admin_users SET email = ? WHERE id = ?').run(email, u.id);
    if (pw) db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(pw, 12), u.id);
  } else {
    if (!pw) fail('Set a password for the new login.');
    db.prepare('INSERT INTO admin_users (email, password_hash, barber_id) VALUES (?,?,?)').run(email, bcrypt.hashSync(pw, 12), id);
  }
  res.json({ ok: true });
}));

// ---- Testimonials ----
function readQuote(b) {
  return { name: str(b.name, 80, 'Name', true), label: str(b.label, 80), quote: str(b.quote, 500, 'Review', true), sort: int(b.sort ?? 0, 0, 1000, 'Order'), active: b.active ? 1 : 0 };
}
router.get('/api/testimonials', owner, (req, res) => res.json({ testimonials: db.prepare('SELECT * FROM testimonials ORDER BY sort, id').all() }));
router.post('/api/testimonials', owner, wrap((req, res) => {
  const t = readQuote(req.body || {});
  res.json({ id: db.prepare('INSERT INTO testimonials (name, label, quote, sort, active) VALUES (?,?,?,?,?)').run(t.name, t.label, t.quote, t.sort, t.active).lastInsertRowid });
}));
router.put('/api/testimonials/:id', owner, wrap((req, res) => {
  const t = readQuote(req.body || {});
  if (!db.prepare('UPDATE testimonials SET name=?, label=?, quote=?, sort=?, active=? WHERE id=?').run(t.name, t.label, t.quote, t.sort, t.active, +req.params.id).changes) fail('Not found.', 404);
  res.json({ ok: true });
}));
router.delete('/api/testimonials/:id', owner, (req, res) => { db.prepare('DELETE FROM testimonials WHERE id = ?').run(+req.params.id); res.json({ ok: true }); });

// ---- Gallery ----
router.get('/api/gallery', (req, res) => {
  const own = req.session.user.barber_id;
  res.json({ photos: db.prepare(`SELECT g.*, b.name AS barber_name FROM gallery g LEFT JOIN barbers b ON b.id = g.barber_id
    ${own ? 'WHERE g.barber_id = ?' : ''} ORDER BY g.id DESC`).all(...(own ? [own] : [])) });
});
router.post('/api/gallery', upload.single('photo'), wrap(async (req, res) => {
  const barberId = req.session.user.barber_id || Number(req.body?.barber_id) || null;
  if (barberId && !exists('barbers', barberId)) fail('Pick a barber from the list.');
  const url = await saveImage(req.file, { maxWidth: 1400 });
  db.prepare('INSERT INTO gallery (barber_id, url, caption, tag) VALUES (?,?,?,?)').run(barberId, url, str(req.body?.caption, 200), str(req.body?.tag, 80));
  res.json({ url });
}));
function ownedPhoto(req) {
  const g = db.prepare('SELECT * FROM gallery WHERE id = ?').get(+req.params.id);
  const own = req.session.user.barber_id;
  if (!g || (own && g.barber_id !== own)) fail('Photo not found.', 404);
  return g;
}
router.put('/api/gallery/:id', wrap((req, res) => {
  const g = ownedPhoto(req);
  db.prepare('UPDATE gallery SET tag = ?, caption = ? WHERE id = ?').run(str(req.body?.tag, 80), str(req.body?.caption, 200), g.id);
  res.json({ ok: true });
}));
router.delete('/api/gallery/:id', wrap((req, res) => {
  const g = ownedPhoto(req);
  db.prepare('DELETE FROM gallery WHERE id = ?').run(g.id);
  removeUpload(g.url);
  res.json({ ok: true });
}));

// ---- Contact messages ----
router.get('/api/messages', owner, (req, res) => res.json({ messages: db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 100').all() }));
router.delete('/api/messages/:id', owner, (req, res) => { db.prepare('DELETE FROM messages WHERE id = ?').run(+req.params.id); res.json({ ok: true }); });

module.exports = router;
