const db = require('../db');

const STEP = 15;          // minutes between selectable start times
const HORIZON_DAYS = 60;  // how far ahead people can book
const LEAD_MIN = 30;      // no booking within the next 30 minutes

const pad = n => String(n).padStart(2, '0');
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const hhmm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(`${s}T00:00:00`));

function offeredBy(serviceId) {
  return db.prepare(`SELECT b.id FROM barbers b JOIN barber_services bs ON bs.barber_id = b.id
    WHERE bs.service_id = ? AND b.active = 1 ORDER BY b.id`).all(serviceId).map(r => r.id);
}

function freeStarts(barberId, serviceId, date, ignoreId = 0) {
  if (!validDate(date)) return [];
  const svc = db.prepare('SELECT duration_min AS d FROM services WHERE id = ? AND active = 1').get(serviceId);
  if (!svc) return [];

  const now = new Date();
  const today = ymd(now);
  const last = new Date(now); last.setDate(last.getDate() + HORIZON_DAYS);
  if (date < today || date > ymd(last)) return [];
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const weekday = new Date(`${date}T00:00:00`).getDay();
  const hours = db.prepare('SELECT opens, closes FROM working_hours WHERE barber_id = ? AND weekday = ?').all(barberId, weekday);
  const busy = [
    ...db.prepare(`SELECT start_min AS s, end_min AS e FROM appointments
      WHERE barber_id = ? AND date = ? AND status = 'booked' AND id != ?`).all(barberId, date, ignoreId),
    ...db.prepare('SELECT start_min AS s, end_min AS e FROM time_off WHERE barber_id = ? AND date = ?').all(barberId, date),
  ];

  const out = [];
  for (const h of hours) {
    for (let t = toMin(h.opens); t + svc.d <= toMin(h.closes); t += STEP) {
      if (date === today && t < nowMin + LEAD_MIN) continue;
      if (busy.some(b => t < b.e && t + svc.d > b.s)) continue;
      out.push(t);
    }
  }
  return out;
}

function slots({ serviceId, barberId, date, ignoreId = 0 }) {
  const offered = offeredBy(serviceId);
  const ids = barberId ? offered.filter(id => id === barberId) : offered;
  const map = new Map();
  for (const id of ids) for (const t of freeStarts(id, serviceId, date, ignoreId)) if (!map.has(t)) map.set(t, id);
  return [...map].sort((a, b) => a[0] - b[0]).map(([t, id]) => ({ start_min: t, label: hhmm(t), barber_id: id }));
}

module.exports = { slots, freeStarts, offeredBy, hhmm, ymd, validDate };
