const db = require('../db');
const { shopNow, addDays, weekdayOf } = require('./shoptime');

const STEP = 15;          // minutes between selectable start times
const HORIZON_DAYS = 60;  // how far ahead people can book
const LEAD_MIN = Math.max(0, parseInt(process.env.BOOKING_LEAD_MIN ?? '30', 10) || 0); // no booking in the next 30 minutes

const pad = n => String(n).padStart(2, '0');
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const hhmm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// A real calendar date: rejects 2026-02-31 and anything that is not YYYY-MM-DD.
const validDate = s => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};

function offeredBy(serviceId) {
  return db.prepare(`SELECT b.id FROM barbers b JOIN barber_services bs ON bs.barber_id = b.id
    WHERE bs.service_id = ? AND b.active = 1 ORDER BY b.id`).all(serviceId).map(r => r.id);
}

// The earliest and latest date that can be booked, and the earliest time today, all in the shop's time zone.
function bookingWindow() {
  const now = shopNow();
  return { today: now.date, nowMin: now.minutes, last: addDays(now.date, HORIZON_DAYS) };
}

// Every possible start time for one barber on one day, each marked free (reason null) or not free:
// 'past' (already gone, or too soon), 'booked' (overlaps another appointment) or 'off' (day off or blocked time).
// Days before today, or too far ahead, have no start times at all.
function candidates(barberId, serviceId, date, ignoreId = 0) {
  if (!validDate(date)) return [];
  const svc = db.prepare('SELECT duration_min AS d FROM services WHERE id = ? AND active = 1').get(serviceId);
  if (!svc) return [];
  const { today, nowMin, last } = bookingWindow();
  if (date < today || date > last) return [];

  const hours = db.prepare('SELECT opens, closes FROM working_hours WHERE barber_id = ? AND weekday = ?').all(barberId, weekdayOf(date));
  const booked = db.prepare(`SELECT start_min AS s, end_min AS e FROM appointments
    WHERE barber_id = ? AND date = ? AND status = 'booked' AND id != ?`).all(barberId, date, ignoreId);
  const off = db.prepare('SELECT start_min AS s, end_min AS e FROM time_off WHERE barber_id = ? AND date = ?').all(barberId, date);
  const overlaps = (list, t) => list.some(b => t < b.e && t + svc.d > b.s);

  const out = [];
  for (const h of hours) {
    for (let t = toMin(h.opens); t + svc.d <= toMin(h.closes); t += STEP) {
      const reason = date === today && t < nowMin + LEAD_MIN ? 'past' : overlaps(booked, t) ? 'booked' : overlaps(off, t) ? 'off' : null;
      out.push({ t, reason });
    }
  }
  return out;
}

// Start times (minutes) at which one barber is free for the whole service.
// ignoreId lets an appointment be moved without blocking its own current slot.
const freeStarts = (barberId, serviceId, date, ignoreId = 0) =>
  candidates(barberId, serviceId, date, ignoreId).filter(c => !c.reason).map(c => c.t);

// The day's start times for a service. barberId 0 means "anyone": a time is free if any barber is free, and is given to
// the first free barber. all: true also returns the times that cannot be booked, with the reason, so they can be shown greyed out.
function slots({ serviceId, barberId, date, ignoreId = 0, all = false }) {
  const offered = offeredBy(serviceId);
  const ids = barberId ? offered.filter(id => id === barberId) : offered;
  const byTime = new Map();
  for (const id of ids) {
    for (const c of candidates(id, serviceId, date, ignoreId)) {
      const e = byTime.get(c.t) || { start_min: c.t, label: hhmm(c.t), free: false, barber_id: null, reasons: [] };
      if (!c.reason && !e.free) { e.free = true; e.barber_id = id; }
      if (c.reason) e.reasons.push(c.reason);
      byTime.set(c.t, e);
    }
  }
  const rank = ['booked', 'off', 'past'];
  const rows = [...byTime.values()].sort((a, b) => a.start_min - b.start_min).map(e => e.free
    ? { start_min: e.start_min, label: e.label, barber_id: e.barber_id, free: true }
    : { start_min: e.start_min, label: e.label, barber_id: null, free: false, reason: rank.find(r => e.reasons.includes(r)) });
  return all ? rows : rows.filter(r => r.free);
}

// Dates in a month ('YYYY-MM') that still have at least one free time, so the calendar can grey out the rest.
function availableDays({ serviceId, barberId, month, ignoreId = 0 }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const { today, last } = bookingWindow();
  const out = [];
  const count = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  for (let d = 1; d <= count; d++) {
    const date = `${month}-${pad(d)}`;
    if (date < today || date > last) continue;
    if (slots({ serviceId, barberId, date, ignoreId }).length) out.push(date);
  }
  return out;
}

module.exports = { slots, freeStarts, availableDays, offeredBy, bookingWindow, hhmm, ymd, validDate, STEP, HORIZON_DAYS, LEAD_MIN };
