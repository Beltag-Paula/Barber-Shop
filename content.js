// Editable site content: text settings (English and Romanian), image slots and map helpers.
// Defaults live here; the admin overrides them through the `settings` table.
// A Romanian override is stored under the same key with a _ro suffix (hero_title_ro).
const db = require('./db');

const DEFAULTS = {
  shop_name: 'Barber Shop',
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
  privacy_text: `## Who we are

This website belongs to the barber shop named in the footer. Our contact details are in the contact section of the home page.

## What we collect

When you book an appointment we collect your name, phone number and email address, and the service, barber, date and time you choose. When you send a message through the contact form we collect your name, phone number and your message.

## Why we use it

We use your details only to manage your appointment, to send you a confirmation and any change to it, and to reply to your message. The legal basis is carrying out the service you ask for and, for the contact form, your consent.

## How long we keep it

We keep appointment details for as long as needed to run the shop and to meet our legal obligations, and we delete contact messages once they are no longer needed.

## Who sees it

Only the shop's staff. We do not sell your data. Confirmation emails are sent through our email provider.

## Cookies and third parties

The public pages set no cookies. The fonts are served from this site. The map in the contact section is loaded from OpenStreetMap, which receives your IP address when the map loads.

## Your rights

Under the GDPR you can ask to see, correct or delete your data, to restrict or object to its use, and to complain to the data protection authority (in Romania, ANSPDCP: dataprotection.ro). Contact us using the details on this site.`,
};

const DEFAULTS_RO = {
  hero_title: 'Tunsori precise. Linii curate. Fără grabă.',
  hero_text: 'Tunsori clasice, bărbierit cu prosop cald și îngrijirea bărbii, doar cu programare. Alege frizerul, alege ora și ne ocupăm noi de restul.',
  hero_button: 'Fă o programare',
  services_title: 'Serviciile noastre',
  about_title: 'Cine suntem',
  about_lead: 'O frizerie construită în jurul tunsorilor bine făcute și al unui scaun fără grabă.',
  about_text: 'Înlocuiește acest text cu povestea frizeriei: când s-a deschis, cine o conduce și cum este să stai pe scaun.\n\nSpune ce faci bine și ce nu faci. O frizerie care doar tunde și aranjează barba ar trebui să o spună.',
  team_title: 'Cunoaște frizerii',
  prices_title: 'Prețurile noastre',
  gallery_title: 'Lucrări recente',
  testimonials_title: 'Ce spun clienții noștri',
  contact_title: 'Contactează-ne',
  hours: 'Marți – Sâmbătă | 10:00 – 19:00\nDuminică și luni | Închis',
  footer_text: 'Toate drepturile rezervate.',
  privacy_text: `## Cine suntem

Acest site aparține frizeriei al cărei nume apare în subsol. Datele noastre de contact se află în secțiunea de contact de pe pagina principală.

## Ce date colectăm

Când faci o programare, colectăm numele, numărul de telefon și adresa de e-mail, precum și serviciul, frizerul, data și ora alese. Când trimiți un mesaj prin formularul de contact, colectăm numele, numărul de telefon și mesajul tău.

## De ce le folosim

Folosim datele doar pentru a gestiona programarea, pentru a-ți trimite confirmarea și orice modificare a ei și pentru a răspunde mesajului tău. Temeiul legal este executarea serviciului solicitat și, pentru formularul de contact, consimțământul tău.

## Cât timp le păstrăm

Păstrăm datele programărilor cât timp este necesar pentru funcționarea frizeriei și pentru respectarea obligațiilor legale, iar mesajele de contact le ștergem când nu mai sunt necesare.

## Cine le vede

Doar personalul frizeriei. Nu vindem datele tale. E-mailurile de confirmare sunt trimise prin furnizorul nostru de e-mail.

## Cookie-uri și terți

Paginile publice nu setează cookie-uri. Fonturile sunt servite de pe acest site. Harta din secțiunea de contact este încărcată de la OpenStreetMap, care primește adresa ta IP la încărcarea hărții.

## Drepturile tale

În baza GDPR poți cere accesul la date, rectificarea sau ștergerea lor, restricționarea ori opunerea la prelucrare și poți depune o plângere la autoritatea de protecție a datelor (în România, ANSPDCP: dataprotection.ro). Contactează-ne folosind datele de pe acest site.`,
};

// Drives the admin form and validates what it sends. `i18n` fields have an English and a Romanian version.
// `optional` fields may be saved empty; emptying any other field restores its default text.
const FIELDS = [
  { group: 'Hero (top of the page)', key: 'hero_title', label: 'Headline', max: 120, i18n: true },
  { group: 'Hero (top of the page)', key: 'hero_text', label: 'Intro text', type: 'textarea', max: 400, optional: true, i18n: true },
  { group: 'Hero (top of the page)', key: 'hero_button', label: 'Booking button text', max: 40, i18n: true },
  { group: 'About', key: 'about_title', label: 'Heading', max: 60, i18n: true },
  { group: 'About', key: 'about_lead', label: 'Opening line', max: 200, optional: true, i18n: true },
  { group: 'About', key: 'about_text', label: 'Your story', type: 'textarea', rows: 8, max: 3000, optional: true, i18n: true, hint: 'Leave a blank line between paragraphs.' },
  { group: 'Section headings', key: 'services_title', label: 'Services', max: 60, i18n: true },
  { group: 'Section headings', key: 'prices_title', label: 'Prices', max: 60, i18n: true },
  { group: 'Section headings', key: 'team_title', label: 'Team', max: 60, i18n: true },
  { group: 'Section headings', key: 'gallery_title', label: 'Gallery', max: 60, i18n: true },
  { group: 'Section headings', key: 'testimonials_title', label: 'Testimonials', max: 60, i18n: true },
  { group: 'Section headings', key: 'contact_title', label: 'Contact', max: 60, i18n: true },
  { group: 'Shop details', key: 'shop_name', label: 'Shop name', max: 60 },
  { group: 'Shop details', key: 'phone', label: 'Phone', type: 'tel', max: 30 },
  { group: 'Shop details', key: 'email', label: 'Email shown on the site', type: 'email', max: 120, optional: true },
  { group: 'Shop details', key: 'currency', label: 'Currency shown with prices', max: 8 },
  { group: 'Shop details', key: 'hours', label: 'Opening hours', type: 'textarea', rows: 3, max: 400, i18n: true, hint: 'One line per row: label | hours. This is the text on the site; booking times come from each barber\'s schedule in Team.' },
  { group: 'Location', key: 'address', label: 'Address', max: 200 },
  { group: 'Location', key: 'lat', label: 'Latitude', max: 12, optional: true },
  { group: 'Location', key: 'lng', label: 'Longitude', max: 12, optional: true },
  { group: 'Location', key: 'zoom', label: 'Map zoom (3 to 19)', type: 'number', max: 2 },
  { group: 'Social and footer', key: 'instagram', label: 'Instagram link', type: 'url', max: 200, optional: true },
  { group: 'Social and footer', key: 'facebook', label: 'Facebook link', type: 'url', max: 200, optional: true },
  { group: 'Social and footer', key: 'footer_text', label: 'Footer text', max: 120, optional: true, i18n: true },
  { group: 'Privacy policy', key: 'privacy_text', label: 'Privacy policy text', type: 'textarea', rows: 14, max: 8000, i18n: true, hint: 'Start a heading with ## and leave a blank line between paragraphs. This is a starting template: have it checked for your shop.' },
];

const stored = () => Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value]));

// Settings as the public site needs them, resolved for one language.
// Romanian falls back to the owner's English text if they changed it, and to the stock Romanian copy otherwise.
function getSettings(lang = 'en') {
  const st = stored(), s = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (k in st) s[k] = st[k];
  if (lang === 'ro') {
    for (const f of FIELDS) if (f.i18n) s[f.key] = st[`${f.key}_ro`] || (f.key in st ? st[f.key] : (DEFAULTS_RO[f.key] ?? DEFAULTS[f.key]));
  }
  return s;
}

// Both languages side by side for the admin form (key and key_ro).
function getAdminSettings() {
  const st = stored(), s = getSettings('en');
  for (const f of FIELDS) if (f.i18n) s[`${f.key}_ro`] = st[`${f.key}_ro`] ?? (f.key in st ? '' : (DEFAULTS_RO[f.key] ?? ''));
  return s;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function setSettings(input) {
  const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const del = db.prepare('DELETE FROM settings WHERE key = ?');
  const clean = {}, ro = {};
  for (const f of FIELDS) {
    const norm = k => String(input[k] ?? '').replace(/\r\n/g, '\n').trim().slice(0, f.max || 200);
    if (f.key in input) {
      const v = norm(f.key);
      if (f.key === 'lat' && v && !(Math.abs(+v) <= 90)) throw new Error('Latitude must be a number between -90 and 90.');
      if (f.key === 'lng' && v && !(Math.abs(+v) <= 180)) throw new Error('Longitude must be a number between -180 and 180.');
      if (f.key === 'zoom' && !(Number.isInteger(+v) && +v >= 3 && +v <= 19)) throw new Error('Map zoom must be a whole number from 3 to 19.');
      if ((f.key === 'instagram' || f.key === 'facebook') && v && !/^https?:\/\//i.test(v)) throw new Error(`${f.label} must start with https://`);
      if (f.key === 'email' && v && !EMAIL.test(v)) throw new Error('Enter a valid email address.');
      clean[f.key] = v;
    }
    if (f.i18n && `${f.key}_ro` in input) ro[`${f.key}_ro`] = norm(`${f.key}_ro`);
  }
  if (('lat' in clean) !== ('lng' in clean) || (clean.lat === '') !== (clean.lng === '')) throw new Error('Set both latitude and longitude, or leave both empty.');
  db.transaction(() => {
    for (const f of FIELDS) {
      if (f.key in clean) { if (clean[f.key] === '' && !f.optional) del.run(f.key); else put.run(f.key, clean[f.key]); }
      const rk = `${f.key}_ro`;
      if (rk in ro) { if (ro[rk] === '') del.run(rk); else put.run(rk, ro[rk]); }
    }
  })();
}

// Section background images. Each has a bundled default; uploads replace it and can be reset.
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

// CSS variables for the page <head>, plus which slots hold a custom upload.
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

module.exports = { DEFAULTS, DEFAULTS_RO, FIELDS, IMAGE_SLOTS, getSettings, getAdminSettings, setSettings, slotUrl, setSlot, clearSlot, imageStyle, parseHours, hasMap, mapEmbedUrl, mapsLink };
