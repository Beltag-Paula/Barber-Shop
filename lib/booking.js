const crypto = require('crypto');
const db = require('../db');
const { freeStarts, offeredBy } = require('./availability');
const { shopNow, daysBetween } = require('./shoptime');
const { DEFAULT_LANG, prefix, pick, fmtDate, fmtLong, fmtTime, t } = require('../i18n');
const { send } = require('./mail');

const SELECT = `SELECT a.*, b.name AS barber_name, b.email AS barber_email, s.name AS service_name, s.name_ro AS service_name_ro, s.duration_min
  FROM appointments a JOIN barbers b ON b.id = a.barber_id JOIN services s ON s.id = a.service_id`;
const byToken = t => db.prepare(`${SELECT} WHERE a.token = ?`).get(String(t));
const byId = id => db.prepare(`${SELECT} WHERE a.id = ?`).get(id);

function create({ serviceId, barberId, date, startMin, name, phone, email, lang = DEFAULT_LANG }) {
  const svc = db.prepare('SELECT duration_min, price FROM services WHERE id = ? AND active = 1').get(serviceId);
  if (!svc || !offeredBy(serviceId).includes(barberId)) return null;
  try {
    return db.transaction(() => {
      if (!freeStarts(barberId, serviceId, date).includes(startMin)) return null;
      const token = crypto.randomBytes(24).toString('hex');
      const info = db.prepare(`INSERT INTO appointments
        (barber_id, service_id, date, start_min, end_min, name, phone, email, lang, price, token)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(barberId, serviceId, date, startMin, startMin + svc.duration_min, name, phone, email, lang, svc.price, token); // the price is kept with the booking, so later price changes do not rewrite past earnings
      return byId(info.lastInsertRowid);
    })();
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return null; // lost a race for the same slot
    throw e;
  }
}

// Same barber, same service, new time. Returns false if the slot is not free.
function move(a, date, startMin) {
  if (a.status !== 'booked') return false;
  return db.transaction(() => {
    if (!freeStarts(a.barber_id, a.service_id, date, a.id).includes(startMin)) return false;
    db.prepare('UPDATE appointments SET date = ?, start_min = ?, end_min = ? WHERE id = ?')
      .run(date, startMin, startMin + a.duration_min, a.id);
    return true;
  })();
}

const cancel = id => db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(id);

// Customers can change appointments online until 2 hours before the start.
const isLocked = a => { const now = shopNow(); return daysBetween(now.date, a.date) * 1440 + a.start_min - now.minutes < 120; };

// by: 'customer' notifies the barber, 'shop' notifies the customer, a new booking notifies both.
// The customer's email is in the language they booked in; staff emails use the site's default language.
function notify(a, event, by) {
  const base = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const key = { booked: 'mConfirmed', moved: 'mMoved', cancelled: 'mCancelled' }[event];
  const compose = lang => {
    const when = `${fmtLong(a.date, lang)}, ${fmtDate(a.date, lang)}, ${fmtTime(a.start_min)}`;
    const detail = `${t(lang, 'mWith', { service: pick({ name: a.service_name, name_ro: a.service_name_ro }, 'name', lang), barber: a.barber_name })}\n${when}`;
    return { label: t(lang, key), when, detail, short: `${fmtDate(a.date, lang)} ${fmtTime(a.start_min)}` };
  };
  if (event === 'booked' || by === 'shop') {
    const lang = a.lang || DEFAULT_LANG, m = compose(lang);
    const link = event === 'cancelled' ? '' : `\n\n${t(lang, 'mLink', { link: `${base}${prefix(lang)}/booking/${a.token}` })}`;
    send(a.email, `${m.label}: ${m.short}`, m.detail + link);
  }
  if (event === 'booked' || by === 'customer') {
    const m = compose(DEFAULT_LANG);
    send(a.barber_email, `${m.label}: ${a.name}, ${m.short}`, `${m.detail}\n${t(DEFAULT_LANG, 'mClient')}: ${a.name}, ${a.phone}`);
  }
}

module.exports = { byToken, byId, create, move, cancel, isLocked, notify };
