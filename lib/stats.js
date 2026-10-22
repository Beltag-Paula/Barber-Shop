// Numbers for the admin dashboard and the CSV downloads.
// An appointment is "completed" once it has ended and "upcoming" while it is still ahead, both judged by the shop's clock.
// Cancelled appointments are never counted as earnings. Earnings use the price saved with each booking.
const db = require('../db');
const { shopNow, addDays, daysBetween } = require('./shoptime');
const { validDate, hhmm } = require('./availability');

const bad = msg => Object.assign(new Error(msg), { status: 400 });
const DONE = "a.status = 'booked' AND (a.date < ? OR (a.date = ? AND a.end_min <= ?))";
const AHEAD = "a.status = 'booked' AND NOT (a.date < ? OR (a.date = ? AND a.end_min <= ?))";

// Default period: the current month.
function monthRange(date) {
  const first = `${date.slice(0, 7)}-01`;
  const last = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 0)).toISOString().slice(0, 10);
  return { from: first, to: last };
}

// barberId 0 means everyone (the owner); otherwise only that barber (a barber's own login).
function overview({ from, to, barberId = 0 }) {
  if (!validDate(from) || !validDate(to) || from > to) throw bad('Choose a valid period.');
  if (daysBetween(from, to) > 366) throw bad('Choose a period of at most one year.');
  const now = shopNow(), nd = [now.date, now.date, now.minutes];
  const mine = barberId ? ' AND a.barber_id = ?' : '', who = barberId ? [barberId] : [];

  const barbers = db.prepare(`
    SELECT b.id, b.name, b.active,
      COALESCE(SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled,
      COALESCE(SUM(CASE WHEN ${DONE} THEN 1 ELSE 0 END), 0) AS completed,
      COALESCE(SUM(CASE WHEN ${AHEAD} THEN 1 ELSE 0 END), 0) AS upcoming,
      COALESCE(SUM(CASE WHEN ${DONE} THEN COALESCE(a.price, 0) ELSE 0 END), 0) AS revenue_done,
      COALESCE(SUM(CASE WHEN ${AHEAD} THEN COALESCE(a.price, 0) ELSE 0 END), 0) AS revenue_expected
    FROM barbers b LEFT JOIN appointments a ON a.barber_id = b.id AND a.date BETWEEN ? AND ?
    WHERE 1 = 1 ${barberId ? 'AND b.id = ?' : ''}
    GROUP BY b.id ORDER BY b.id`).all(...nd, ...nd, ...nd, ...nd, from, to, ...who)
    .map(r => ({ ...r, total: r.completed + r.upcoming }))
    .filter(r => r.active || r.total + r.cancelled > 0);

  const sum = k => barbers.reduce((n, b) => n + b[k], 0);
  const totals = { total: sum('total'), completed: sum('completed'), upcoming: sum('upcoming'), cancelled: sum('cancelled'),
    revenue_done: sum('revenue_done'), revenue_expected: sum('revenue_expected') };

  const services = db.prepare(`
    SELECT s.id, s.name, s.name_ro, COUNT(a.id) AS total, COALESCE(SUM(COALESCE(a.price, 0)), 0) AS revenue
    FROM appointments a JOIN services s ON s.id = a.service_id
    WHERE a.status = 'booked' AND a.date BETWEEN ? AND ? ${mine}
    GROUP BY s.id ORDER BY total DESC, s.id`).all(from, to, ...who);

  const split = `
      COALESCE(SUM(CASE WHEN ${DONE} THEN 1 ELSE 0 END), 0) AS completed,
      COALESCE(SUM(CASE WHEN ${AHEAD} THEN 1 ELSE 0 END), 0) AS upcoming,
      COALESCE(SUM(CASE WHEN ${DONE} THEN COALESCE(a.price, 0) ELSE 0 END), 0) AS revenue_done,
      COALESCE(SUM(CASE WHEN ${AHEAD} THEN COALESCE(a.price, 0) ELSE 0 END), 0) AS revenue_expected`;
  const daily = db.prepare(`SELECT a.date AS day, a.barber_id, ${split}
    FROM appointments a WHERE a.date BETWEEN ? AND ? ${mine} GROUP BY a.date, a.barber_id ORDER BY a.date, a.barber_id`)
    .all(...nd, ...nd, ...nd, ...nd, from, to, ...who);

  // Per month for the whole calendar year of the period's end.
  const year = to.slice(0, 4);
  const monthly = db.prepare(`SELECT substr(a.date, 1, 7) AS month, a.barber_id, ${split}
    FROM appointments a WHERE a.date BETWEEN ? AND ? ${mine} GROUP BY month, a.barber_id ORDER BY month, a.barber_id`)
    .all(...nd, ...nd, ...nd, ...nd, `${year}-01-01`, `${year}-12-31`, ...who);

  return { range: { from, to }, today: now.date, year, totals, barbers, services, daily, monthly };
}

const HEAD = {
  en: { date: 'Date', start: 'Start', end: 'End', barber: 'Barber', service: 'Service', price: 'Price', status: 'Status', customer: 'Customer', phone: 'Phone', email: 'Email', booked: 'Booked on', month: 'Month',
    total: 'Appointments', completed: 'Completed', upcoming: 'Upcoming', cancelled: 'Cancelled', earned: 'Earned', expected: 'Expected', revenue: 'Total revenue',
    s_done: 'completed', s_upcoming: 'upcoming', s_cancelled: 'cancelled' },
  ro: { date: 'Data', start: 'Început', end: 'Sfârșit', barber: 'Frizer', service: 'Serviciu', price: 'Preț', status: 'Stare', customer: 'Client', phone: 'Telefon', email: 'E-mail', booked: 'Programat la', month: 'Luna',
    total: 'Programări', completed: 'Efectuate', upcoming: 'Viitoare', cancelled: 'Anulate', earned: 'Încasat', expected: 'Estimat', revenue: 'Venit total',
    s_done: 'efectuată', s_upcoming: 'viitoare', s_cancelled: 'anulată' },
};

// Rows for a CSV download. kind: appointments | summary | daily | monthly
function exportRows(kind, { from, to, barberId = 0, lang = 'en' }) {
  const H = HEAD[lang] || HEAD.en;
  const data = overview({ from, to, barberId });
  const names = Object.fromEntries(db.prepare('SELECT id, name FROM barbers').all().map(b => [b.id, b.name]));
  if (kind === 'summary') {
    return [[H.barber, H.total, H.completed, H.upcoming, H.cancelled, H.earned, H.expected, H.revenue],
      ...data.barbers.map(b => [b.name, b.total, b.completed, b.upcoming, b.cancelled, b.revenue_done, b.revenue_expected, b.revenue_done + b.revenue_expected])];
  }
  if (kind === 'daily' || kind === 'monthly') {
    const key = kind === 'daily' ? 'day' : 'month';
    const rows = kind === 'daily' ? data.daily : data.monthly;
    return [[kind === 'daily' ? H.date : H.month, H.barber, H.completed, H.upcoming, H.earned, H.expected, H.revenue],
      ...rows.map(r => [r[key], names[r.barber_id] || '', r.completed, r.upcoming, r.revenue_done, r.revenue_expected, r.revenue_done + r.revenue_expected])];
  }
  if (kind === 'appointments') {
    const now = shopNow();
    const rows = db.prepare(`SELECT a.date, a.start_min, a.end_min, a.status, a.price, a.name, a.phone, a.email, a.created_at, b.name AS barber, s.name AS service
      FROM appointments a JOIN barbers b ON b.id = a.barber_id JOIN services s ON s.id = a.service_id
      WHERE a.date BETWEEN ? AND ? ${barberId ? 'AND a.barber_id = ?' : ''} ORDER BY a.date, a.start_min, a.barber_id`).all(from, to, ...(barberId ? [barberId] : []));
    const state = r => r.status === 'cancelled' ? H.s_cancelled : (r.date < now.date || (r.date === now.date && r.end_min <= now.minutes)) ? H.s_done : H.s_upcoming;
    return [[H.date, H.start, H.end, H.barber, H.service, H.price, H.status, H.customer, H.phone, H.email, H.booked],
      ...rows.map(r => [r.date, hhmm(r.start_min), hhmm(r.end_min), r.barber, r.service, r.price ?? 0, state(r), r.name, r.phone, r.email || '', r.created_at])];
  }
  throw Object.assign(new Error('Unknown export.'), { status: 404 });
}

module.exports = { overview, exportRows, monthRange };
