const db = require('./db');

const DEFAULTS = {
  shop_name: 'Some Barber Shop',
  hero_title: 'Sharp cuts. Clean lines. No rush.',
  hero_text: 'Classic haircuts, hot-towel shaves and beard work, by appointment. Choose your barber, choose your time, and we take it from there.',
  hero_button: 'Book an appointment',
  services_title: 'Services we offer',
  about_title: 'Who we are',
  about_lead: 'A barber shop built around good haircuts and an unhurried chair.',
  about_text: 'Replace this with the shop\'s own story: when it opened, who runs it, and what it is like to sit in the chair.\n\nSay what you do well and what you do not do. A shop that only cuts hair and trims beards should say so.',
  team_title: 'Meet the barbers',
  prices_title: 'Our prices',
  gallery_title: 'Recent work',
  testimonials_title: 'What our clients say',
  contact_title: 'Contact us',
  address: '12 Example Street, Your City',
  phone: '+40 000 000 000',
  email: 'hello@example.com',
  hours: 'Tuesday to Saturday | 10:00 to 19:00\nSunday and Monday | Closed',
  lat: '', lng: '', zoom: '16',
  instagram: '', facebook: '',
  currency: 'RON',
  footer_text: 'All rights reserved.',
};

const FIELDS = [
  { group: 'Hero (top of the page)', key: 'hero_title', label: 'Headline', max: 120 },
  { group: 'Hero (top of the page)', key: 'hero_text', label: 'Intro text', type: 'textarea', max: 400, optional: true },
  { group: 'Hero (top of the page)', key: 'hero_button', label: 'Booking button text', max: 40 },
  { group: 'About', key: 'about_title', label: 'Heading', max: 60 },
  { group: 'About', key: 'about_lead', label: 'Opening line', max: 200, optional: true },
  { group: 'About', key: 'about_text', label: 'Your story', type: 'textarea', rows: 8, max: 3000, optional: true, hint: 'Leave a blank line between paragraphs.' },
  { group: 'Section headings', key: 'services_title', label: 'Services', max: 60 },
  { group: 'Section headings', key: 'prices_title', label: 'Prices', max: 60 },
  { group: 'Section headings', key: 'team_title', label: 'Team', max: 60 },
  { group: 'Section headings', key: 'gallery_title', label: 'Gallery', max: 60 },
  { group: 'Section headings', key: 'testimonials_title', label: 'Testimonials', max: 60 },
  { group: 'Section headings', key: 'contact_title', label: 'Contact', max: 60 },
  { group: 'Shop details', key: 'shop_name', label: 'Shop name', max: 60 },
  { group: 'Shop details', key: 'phone', label: 'Phone', type: 'tel', max: 30 },
  { group: 'Shop details', key: 'email', label: 'Email shown on the site', type: 'email', max: 120, optional: true },
  { group: 'Shop details', key: 'currency', label: 'Currency shown with prices', max: 8 },
  { group: 'Shop details', key: 'hours', label: 'Opening hours', type: 'textarea', rows: 3, max: 400, hint: 'One line per row: label | hours. This is the text on the site; booking times come from each barber\'s schedule in Team.' },
  { group: 'Location', key: 'address', label: 'Address', max: 200 },
  { group: 'Location', key: 'lat', label: 'Latitude', max: 12, optional: true },
  { group: 'Location', key: 'lng', label: 'Longitude', max: 12, optional: true },
  { group: 'Location', key: 'zoom', label: 'Map zoom (3 to 19)', type: 'number', max: 2 },
  { group: 'Social and footer', key: 'instagram', label: 'Instagram link', type: 'url', max: 200, optional: true },
  { group: 'Social and footer', key: 'facebook', label: 'Facebook link', type: 'url', max: 200, optional: true },
  { group: 'Social and footer', key: 'footer_text', label: 'Footer text', max: 120, optional: true },
];

function getSettings() {
  const s = { ...DEFAULTS };
  for (const r of db.prepare("SELECT key, value FROM settings WHERE key NOT LIKE 'img\\_%' ESCAPE '\\'").all()) if (r.key in DEFAULTS) s[r.key] = r.value;
  return s;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function setSettings(input) {
  const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const del = db.prepare('DELETE FROM settings WHERE key = ?');
  const clean = {};
  for (const f of FIELDS) {
    if (!(f.key in input)) continue;
    const v = String(input[f.key] ?? '').replace(/\r\n/g, '\n').trim().slice(0, f.max || 200);
    if (f.key === 'lat' && v && !(Math.abs(+v) <= 90)) throw new Error('Latitude must be a number between -90 and 90.');
    if (f.key === 'lng' && v && !(Math.abs(+v) <= 180)) throw new Error('Longitude must be a number between -180 and 180.');
    if (f.key === 'zoom' && !(Number.isInteger(+v) && +v >= 3 && +v <= 19)) throw new Error('Map zoom must be a whole number from 3 to 19.');
    if ((f.key === 'instagram' || f.key === 'facebook') && v && !/^https?:\/\//i.test(v)) throw new Error(`${f.label} must start with https://`);
    if (f.key === 'email' && v && !EMAIL.test(v)) throw new Error('Enter a valid email address.');
    clean[f.key] = v;
  }
  if (('lat' in clean) !== ('lng' in clean) || (clean.lat === '') !== (clean.lng === '')) throw new Error('Set both latitude and longitude, or leave both empty.');
  db.transaction(() => {
    for (const f of FIELDS) {
      if (!(f.key in clean)) continue;
      if (clean[f.key] === '' && !f.optional) del.run(f.key); else put.run(f.key, clean[f.key]);
    }
  })();
}

const IMAGE_SLOTS = {
  hero: { label: 'Hero background', def: '/img/hero.jpg', maxWidth: 2200, hint: 'A wide photo, at least 1600 px across. A dark layer is added so the white text stays readable.' },
  services: { label: 'Services background', def: '/img/services.jpg', maxWidth: 2000, hint: 'Dark photos work best. The default is a dark portrait that fades into the page.' },
  about: { label: 'About background', def: '/img/about.jpg', maxWidth: 2000, hint: 'The text over it is dark. Any photo you upload gets a light layer on top so the text stays readable.' },
  prices: { label: 'Prices background', def: '/img/prices.jpg', maxWidth: 2000, hint: 'A dark layer is added so the white text stays readable.' },
  testimonials: { label: 'Testimonials background', def: '/img/testimonials.jpg', maxWidth: 2000, hint: 'The text over it is dark. Any photo you upload gets a light layer on top.' },
};

const SAFE_URL = /^\/(uploads|img)\/[\w.-]+(\/[\w.-]+)*$/;
function slotUrl(slot) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('img_' + slot);
  return row && SAFE_URL.test(row.value) ? row.value : null;
}
const setSlot = (slot, url) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('img_' + slot, url);
const clearSlot = slot => db.prepare('DELETE FROM settings WHERE key = ?').run('img_' + slot);

function imageStyle() {
  const custom = {};
  const vars = Object.entries(IMAGE_SLOTS).map(([slot, s]) => {
    const u = slotUrl(slot); custom[slot] = !!u;
    return `--img-${slot}:url("${u || s.def}")`;
  });
  return { css: `:root{${vars.join(';')}}`, custom };
}

const parseHours = text => String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const [a, ...b] = l.split('|'); return [a.trim(), b.join('|').trim()];
});

const hasMap = s => s.lat !== '' && s.lng !== '' && !isNaN(+s.lat) && !isNaN(+s.lng);
function mapEmbedUrl(s) {
  const lat = +s.lat, lng = +s.lng, zoom = Math.min(19, Math.max(3, Math.round(+s.zoom || 16)));
  const w = 0.004 * 2 ** (16 - zoom), h = w * 0.6;
  const f = n => n.toFixed(6);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${f(lng - w)},${f(lat - h)},${f(lng + w)},${f(lat + h)}&layer=mapnik&marker=${f(lat)},${f(lng)}`;
}
const mapsLink = s => hasMap(s)
  ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`;

module.exports = { DEFAULTS, FIELDS, IMAGE_SLOTS, getSettings, setSettings, slotUrl, setSlot, clearSlot, imageStyle, parseHours, hasMap, mapEmbedUrl, mapsLink };
