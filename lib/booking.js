const crypto = require('crypto');
const db = require('../db');
const { freeStarts, offeredBy, hhmm } = require('./availability');
const { send } = require('./mail');

const SELECT = `SELECT a.*, b.name AS barber_name, b.email AS barber_email, s.name AS service_name, s.duration_min
  FROM appointments a JOIN barbers b ON b.id = a.barber_id JOIN services s ON s.id = a.service_id`;
const byToken = t => db.prepare(`${SELECT} WHERE a.token = ?`).get(String(t));
const byId = id => db.prepare(`${SELECT} WHERE a.id = ?`).get(id);

function create({ serviceId, barberId, date, startMin, name, phone, email }) {
  const svc = db.prepare('SELECT duration_min FROM services WHERE id = ? AND active = 1').get(serviceId);
  if (!svc || !offeredBy(serviceId).includes(barberId)) return null;
  try {
    return db.transaction(() => {
      if (!freeStarts(barberId, serviceId, date).includes(startMin)) return null;
      const token = crypto.randomBytes(24).toString('hex');
      const info = db.prepare(`INSERT INTO appointments
        (barber_id, service_id, date, start_min, end_min, name, phone, email, token)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(barberId, serviceId, date, startMin, startMin + svc.duration_min, name, phone, email, token);
      return byId(info.lastInsertRowid);
    })();
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return null; 
    throw e;
  }
}

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

const isLocked = a => new Date(`${a.date}T00:00:00`).getTime() + a.start_min * 60000 - Date.now() < 2 * 3600 * 1000;

function notify(a, event, by) {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  const label = { booked: 'Appointment confirmed', moved: 'Appointment moved', cancelled: 'Appointment cancelled' }[event];
  const when = `${a.date} at ${hhmm(a.start_min)}`;
  const detail = `${a.service_name} with ${a.barber_name}\n${when}`;
  if (event === 'booked' || by === 'shop') {
    const link = event === 'cancelled' ? '' : `\n\nChange or cancel: ${base}/booking/${a.token}`;
    send(a.email, `${label}: ${when}`, detail + link);
  }
  if (event === 'booked' || by === 'customer') {
    send(a.barber_email, `${label}: ${a.name}, ${when}`, `${detail}\nCustomer: ${a.name}, ${a.phone}`);
  }
}

module.exports = { byToken, byId, create, move, cancel, isLocked, notify };
