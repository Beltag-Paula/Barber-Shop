// "Now" and "today" as the shop sees them. Everything about dates and times (can this slot still be booked, has this
// appointment ended, what is today's date) goes through here, so it never depends on the visitor's clock or on the time
// zone of the computer the server runs on. No outside service is used: it is the server's clock, read in the shop's time zone.
// The time zone is SHOP_TZ or TZ from .env (for example Europe/Bucharest), or the server's own if neither is set.
const TZ = (() => {
  const want = process.env.SHOP_TZ || process.env.TZ;
  try { if (want) { new Intl.DateTimeFormat('en', { timeZone: want }); return want; } }
  catch { console.warn(`Unknown time zone "${want}". Using the server's time zone instead.`); }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
})();

const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// { date: 'YYYY-MM-DD', minutes: minutes since midnight } in the shop's time zone.
function shopNow(d = new Date()) {
  const p = Object.fromEntries(parts.formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (+p.hour) * 60 + (+p.minute) };
}

const DAY = 86400000;
const utc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const addDays = (s, n) => new Date(utc(s) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / DAY);
const weekdayOf = s => new Date(utc(s)).getUTCDay(); // 0 = Sunday
const todayStr = () => shopNow().date;

module.exports = { TZ, shopNow, addDays, daysBetween, weekdayOf, todayStr };
