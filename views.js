const db = require('./db');
const C = require('./content');
const { ymd, hhmm } = require('./lib/availability');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paras = t => String(t || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
const initials = n => esc(String(n).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase());
const plusDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const longDate = s => new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const minutes = m => m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;

const ICON_KEYS = ['scissors', 'razor', 'brush', 'clip'];

// Inline SVG (stroke icons, 24 x 24) so no icon font is needed.
const svg = (inner, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const SVG = {
  instagram: svg('<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>'),
  facebook: svg('<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>'),
  prev: svg('<polyline points="15 18 9 12 15 6"/>'),
  next: svg('<polyline points="9 18 15 12 9 6"/>'),
  quote: svg('<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h4"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h4"/>', 'quote-mark'),
};

function shell({ title, body, S, home = false, extraNav = '' }) {
  const img = C.imageStyle();
  const a = id => (home ? `#${id}` : `/#${id}`);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="theme-color" content="#0f0a05"><link rel="icon" href="data:,">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Montserrat:wght@500;600;700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
<style>${img.css}</style><link rel="stylesheet" href="/css/site.css"></head>
<body class="${home ? 'home' : 'inner'}">
<div class="loader" id="loader" aria-hidden="true"><div class="balls"><span></span><span></span><span></span></div></div>
<noscript><style>.loader{display:none}</style></noscript>
<header class="top-nav${home ? '' : ' solid'}" id="top"><div class="nav-inner">
  <a class="brand" href="/">${esc(S.shop_name)}</a>
  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="menu" aria-label="Menu"><span></span><span></span><span></span></button>
  <nav class="menu" id="menu" aria-label="Main">${[['home', 'Home'], ['services', 'Services'], ['about', 'About'], ['price', 'Prices'], ['team', 'Team'], ...extraNav, ['contact', 'Contact']].map(([id, t]) => `<a href="${a(id)}">${t}</a>`).join('')}</nav>
  <a class="btn small book-btn" href="/book">Book now</a>
</div></header>
${body}
<footer class="copy-footer"><div class="container">
  <span>&copy; ${new Date().getFullYear()} ${esc(S.shop_name)}${S.footer_text ? '. ' + esc(S.footer_text) : ''}</span>
  ${(S.instagram || S.facebook) ? `<span class="social">${S.instagram ? `<a href="${esc(S.instagram)}" rel="noopener" aria-label="Instagram">${SVG.instagram}</a>` : ''}${S.facebook ? `<a href="${esc(S.facebook)}" rel="noopener" aria-label="Facebook">${SVG.facebook}</a>` : ''}</span>` : ''}
  <span class="credit">Icons by <a href="https://www.flaticon.com/packs/linear-hairdressing-salon-elements" rel="noopener">Flaticon</a></span>
</div></footer>
<script src="/js/site.js" defer></script></body></html>`;
}

const pages = {
  home() {
    const S = C.getSettings(), img = C.imageStyle();
    const services = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY sort, id').all();
    const team = db.prepare('SELECT * FROM barbers WHERE active = 1 ORDER BY id').all();
    const gallery = db.prepare('SELECT g.*, b.name AS barber_name FROM gallery g LEFT JOIN barbers b ON b.id = g.barber_id ORDER BY g.id DESC LIMIT 60').all();
    const quotes = db.prepare('SELECT * FROM testimonials WHERE active = 1 ORDER BY sort, id').all();
    const galleryBarbers = [...new Map(gallery.filter(g => g.barber_id).map(g => [g.barber_id, g.barber_name])).entries()];
    const cu = slot => (img.custom[slot] ? ' has-custom' : '');
    const extraNav = [...(gallery.length ? [['gallery', 'Gallery']] : []), ...(quotes.length ? [['testimonial', 'Reviews']] : [])];

    const body = `
<section id="home" class="intro parallax"><div class="container"><div class="intro-caption">
  <h1>${esc(S.hero_title)}</h1>${S.hero_text ? `<p>${esc(S.hero_text)}</p>` : ''}
  <p class="btns"><a class="btn" href="/book">${esc(S.hero_button)}</a><a class="btn ghost" href="#services">Explore more</a></p>
</div></div></section>

<section id="services" class="sec dark bg-services${cu('services')}"><div class="container">
  <h2>${esc(S.services_title)}</h2>
  <div class="service-grid">${services.map(s => `<div class="service"><img src="/img/icons/${ICON_KEYS.includes(s.icon) ? s.icon : 'scissors'}.png" alt="" width="50" height="50">
    <h3>${esc(s.name)}</h3><p>${esc(s.description)}</p></div>`).join('')}</div>
</div></section>

<section id="about" class="sec bg-about${cu('about')}"><div class="container"><div class="copy">
  <h2>${esc(S.about_title)}</h2>${S.about_lead ? `<p class="lead">${esc(S.about_lead)}</p>` : ''}${paras(S.about_text)}
  <p><a class="btn" href="/book">${esc(S.hero_button)}</a></p>
</div></div></section>

<section id="price" class="sec bg-prices overlay"><div class="container">
  <h2 class="center">${esc(S.prices_title)}</h2>
  <div class="price-grid">${services.map(s => `<div class="price-card"><div class="price-count">${s.price}<span>${esc(S.currency)}</span></div>
    <h3>${esc(s.name)}</h3><p>${minutes(s.duration_min)}</p></div>`).join('')}</div>
</div></section>

<section id="team" class="sec team-section"><div class="container">
  <h2 class="gold center">${esc(S.team_title)}</h2>
  <div class="team-grid">${team.map(b => `<article class="member"><div class="photo">
    ${b.photo ? `<img src="${esc(b.photo)}" alt="${esc(b.name)}" loading="lazy">` : `<div class="initials" aria-hidden="true">${initials(b.name)}</div>`}
    <div class="overlay"><p>${esc(b.bio)}</p><a class="btn small" href="/book?barber=${b.id}">Book with ${esc(b.name.split(' ')[0])}</a></div></div>
    <div class="member-foot"><h3>${esc(b.name)}</h3><p>${esc(b.role)}</p></div></article>`).join('')}</div>
</div></section>

${gallery.length ? `<section id="gallery" class="sec dark gallery-section"><div class="container">
  <h2 class="center">${esc(S.gallery_title)}</h2>
  ${galleryBarbers.length > 1 ? `<div class="filters" role="group" aria-label="Filter by barber"><button type="button" class="chip" aria-pressed="true" data-barber="">All</button>${galleryBarbers.map(([id, n]) => `<button type="button" class="chip" aria-pressed="false" data-barber="${id}">${esc(n)}</button>`).join('')}</div>` : ''}
  <div class="wall">${gallery.map(g => `<figure data-barber="${g.barber_id || ''}"><img src="${esc(g.url)}" alt="${esc(g.caption || g.tag || 'Haircut')}" loading="lazy">
    <figcaption>${esc([g.tag, g.barber_name].filter(Boolean).join(', '))}</figcaption></figure>`).join('')}</div>
</div></section>` : ''}

${quotes.length ? `<section id="testimonial" class="sec bg-testimonials${cu('testimonials')}"><div class="container">
  <h2 class="center">${esc(S.testimonials_title)}</h2>
  <div class="carousel" role="region" aria-roledescription="carousel" aria-label="Client reviews">
    <div class="track">${quotes.map((q, i) => `<figure class="slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${quotes.length}">
      ${SVG.quote}<blockquote>${esc(q.quote)}</blockquote><figcaption><b>${esc(q.name)}</b>${q.label ? `<span>${esc(q.label)}</span>` : ''}</figcaption></figure>`).join('')}</div>
    ${quotes.length > 1 ? `<div class="car-nav"><button type="button" class="prev" aria-label="Previous review">${SVG.prev}</button><button type="button" class="next" aria-label="Next review">${SVG.next}</button></div>` : ''}
  </div>
</div></section>` : ''}

<section id="contact" class="contact-section">
  ${C.hasMap(S) ? `<iframe class="map" title="Map of the shop location" src="${esc(C.mapEmbedUrl(S))}" loading="lazy" tabindex="-1" referrerpolicy="no-referrer"></iframe>` : ''}
  <div class="container"><div class="contact-card">
    <div class="info"><h2>${esc(S.contact_title)}</h2>
      <p>${esc(S.address)}<br><a href="${esc(C.mapsLink(S))}" rel="noopener" target="_blank">Open in Google Maps</a></p>
      <p><a href="tel:${esc(S.phone.replace(/[^+\d]/g, ''))}">${esc(S.phone)}</a>${S.email ? `<br><a href="mailto:${esc(S.email)}">${esc(S.email)}</a>` : ''}</p>
      <dl class="hours">${C.parseHours(S.hours).map(([d, t]) => `<dt>${esc(d)}</dt><dd>${esc(t)}</dd>`).join('')}</dl></div>
    <form id="contact-form" class="cform" novalidate>
      <label class="sr-only" for="c-name">Name</label><input id="c-name" class="field" name="name" placeholder="Full name" autocomplete="name" required>
      <label class="sr-only" for="c-phone">Phone</label><input id="c-phone" class="field" name="phone" type="tel" placeholder="Phone number" autocomplete="tel" required>
      <label class="sr-only" for="c-msg">Message</label><textarea id="c-msg" class="field" name="message" rows="4" placeholder="Your message" required></textarea>
      <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      <p class="msg" id="c-status" role="alert"></p>
      <button class="btn pill" type="submit">Send message</button>
    </form>
  </div></div>
</section>`;
    return shell({ title: S.shop_name, body, S, home: true, extraNav });
  },

  book() {
    const S = C.getSettings();
    const services = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY sort, id').all();
    const barbers = db.prepare('SELECT * FROM barbers WHERE active = 1 ORDER BY id').all();
    const offers = {};
    for (const r of db.prepare('SELECT * FROM barber_services').all()) (offers[r.service_id] ||= []).push(r.barber_id);
    const barberField = barbers.length === 1
      ? `<input type="hidden" name="barber" value="${barbers[0].id}">`
      : `<label>Barber<select class="field" name="barber"><option value="">Anyone available</option>${barbers.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label>`;
    return shell({ title: `Book | ${S.shop_name}`, S, body: `
<section class="sec dark page-head"><div class="container"><h1 class="display">Book an appointment</h1></div></section>
<section class="panel-sec"><div class="container"><div class="panel">
<form id="book" class="stack" novalidate data-offers="${esc(JSON.stringify(offers))}">
  <label>Service<select class="field" name="service" required>${services.map(s => `<option value="${s.id}">${esc(s.name)}, ${minutes(s.duration_min)}, ${s.price} ${esc(S.currency)}</option>`).join('')}</select></label>
  ${barberField}
  <label>Date<input class="field" type="date" name="date" min="${plusDays(0)}" max="${plusDays(60)}" required></label>
  <div><p class="label">Time</p><div id="slots" class="slots" aria-live="polite"><span class="hint">Choose a date to see free times.</span></div></div>
  <label>Full name<input class="field" name="fullname" autocomplete="name" required></label>
  <label>Phone<input class="field" name="phone" type="tel" autocomplete="tel" required></label>
  <label>Email<input class="field" name="email" type="email" autocomplete="email" required></label>
  <p id="msg" class="msg" role="alert"></p>
  <button class="btn pill" type="submit">Confirm booking</button>
</form></div></div></section>` });
  },

  manage(a, locked) {
    const S = C.getSettings();
    const details = `<dl class="details"><dt>Service</dt><dd>${esc(a.service_name)}</dd><dt>Barber</dt><dd>${esc(a.barber_name)}</dd>
      <dt>When</dt><dd>${longDate(a.date)}, ${hhmm(a.start_min)}</dd><dt>Name</dt><dd>${esc(a.name)}</dd></dl>`;
    let action;
    if (a.status === 'cancelled') action = `<p>This appointment was cancelled.</p><p><a class="btn pill" href="/book">Book a new time</a></p>`;
    else if (locked) action = `<p>Online changes close 2 hours before the appointment. To change it now, call <a href="tel:${esc(S.phone.replace(/[^+\d]/g, ''))}">${esc(S.phone)}</a>.</p>`;
    else action = `<div id="manage" class="stack" data-token="${esc(a.token)}" data-service="${a.service_id}" data-barber="${a.barber_id}">
      <h2>Move to another time</h2>
      <label>New date<input class="field" type="date" name="date" value="${a.date}" min="${plusDays(0)}" max="${plusDays(60)}"></label>
      <div id="slots" class="slots" aria-live="polite"></div><p id="msg" class="msg" role="alert"></p>
      <p class="row"><button id="move" class="btn pill" type="button">Move appointment</button><button id="cancel" class="textbtn" type="button">Cancel appointment</button></p></div>`;
    return shell({ title: `Your appointment | ${S.shop_name}`, S, body: `
<section class="sec dark page-head"><div class="container"><h1 class="display">${a.status === 'cancelled' ? 'Appointment cancelled' : 'Your appointment'}</h1></div></section>
<section class="panel-sec"><div class="container"><div class="panel">${details}${action}</div></div></section>` });
  },

  notFound() {
    const S = C.getSettings();
    return shell({ title: `Not found | ${S.shop_name}`, S, body: `<section class="sec dark page-head"><div class="container"><h1 class="display">Page not found</h1><p><a class="btn" href="/">Back to the home page</a></p></div></section>` });
  },

  // Admin pages use their own light stylesheet and no site chrome.
  adminHead: (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="robots" content="noindex"><link rel="icon" href="data:,"><link rel="stylesheet" href="/css/admin.css"></head>`,
  login() {
    const S = C.getSettings();
    return `${pages.adminHead('Sign in')}<body class="login"><main><form id="login" class="card stack" novalidate><h1>${esc(S.shop_name)} admin</h1>
<label>Email<input name="email" type="email" autocomplete="username" required></label>
<label>Password<input name="password" type="password" autocomplete="current-password" required></label>
<p id="msg" class="msg" role="alert"></p><button class="btn" type="submit">Sign in</button></form></main><script src="/js/admin.js"></script></body></html>`;
  },
  admin(user) {
    const S = C.getSettings();
    return `${pages.adminHead('Admin')}<body data-owner="${user.barber_id ? 0 : 1}" data-barber="${user.barber_id || ''}">
<header class="ahead"><strong>${esc(S.shop_name)} admin</strong><span class="grow"></span><span class="who">${esc(user.email)}</span>
<a href="/" target="_blank" rel="noopener">View site</a><button id="pw" class="linkbtn" type="button">Change password</button><button id="logout" class="linkbtn" type="button">Sign out</button></header>
<nav class="tabs" id="tabs" aria-label="Admin sections"></nav><main id="panel"></main><script src="/js/admin.js"></script></body></html>`;
  },
};

module.exports = { ...pages, ICON_KEYS };
