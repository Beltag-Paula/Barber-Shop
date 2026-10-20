// Server-rendered pages: plain template literals, no template engine.
// Every public page takes a language ('en' or 'ro') and builds its links, text, dates and times from it.
const db = require('./db');
const C = require('./content');
const { ymd } = require('./lib/availability');
const I = require('./i18n');
const { LANGS, DEFAULT_LANG, prefix, pick, t, fmtLong, fmtTime, minutes } = I;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Text with blank lines between paragraphs; a line starting with "## " becomes a heading.
const rich = txt => String(txt || '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => {
  if (!b.startsWith('## ')) return `<p>${esc(b).replace(/\n/g, '<br>')}</p>`;
  const [head, ...rest] = b.split('\n');
  return `<h2>${esc(head.slice(3))}</h2>${rest.length ? `<p>${esc(rest.join('\n')).replace(/\n/g, '<br>')}</p>` : ''}`;
}).join('');
const initials = n => esc(String(n).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase());
const plusDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const tel = p => esc(String(p).replace(/[^+\d]/g, ''));

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

// path is the page's address without a language prefix, so the language switch can point at the same page.
function shell({ lang, title, body, S, path = '/', home = false, extraNav = [], index = true }) {
  const img = C.imageStyle();
  const u = p => prefix(lang) + p;
  const a = id => (home ? `#${id}` : `${u('/')}#${id}`);
  const base = (process.env.BASE_URL || '').replace(/\/$/, '');
  const alts = index ? LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${esc(base + prefix(l) + path)}">`).join('')
    + `<link rel="alternate" hreflang="x-default" href="${esc(base + prefix(DEFAULT_LANG) + path)}">` : '<meta name="robots" content="noindex">';
  const links = [['home'], ['services'], ['about'], ['price'], ['team'], ...extraNav, ['contact']];
  const book = `<a class="btn small book-btn" href="${u('/book')}">${t(lang, 'bookNow')}</a>`;
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="theme-color" content="#0f0a05"><link rel="icon" href="data:,">${alts}
<link rel="stylesheet" href="/fonts/abril-fatface/400.css"><link rel="stylesheet" href="/fonts/montserrat/600.css"><link rel="stylesheet" href="/fonts/montserrat/700.css">
<link rel="stylesheet" href="/fonts/source-sans-3/400.css"><link rel="stylesheet" href="/fonts/source-sans-3/600.css"><link rel="stylesheet" href="/fonts/source-sans-3/700.css">
<style>${img.css}</style><link rel="stylesheet" href="/css/calendar.css"><link rel="stylesheet" href="/css/site.css"></head>
<body class="${home ? 'home' : 'inner'}" data-prefix="${prefix(lang)}">
<a class="skip" href="#main">${t(lang, 'skip')}</a>
<div class="loader" id="loader" aria-hidden="true"><div class="balls"><span></span><span></span><span></span></div></div>
<noscript><style>.loader{display:none}</style></noscript>
<header class="top-nav${home ? '' : ' solid'}" id="top"><div class="nav-inner">
  <a class="brand" href="${u('/')}">${esc(S.shop_name)}</a>
  <nav class="menu" id="menu" aria-label="${t(lang, 'menu')}">${links.map(([id]) => `<a href="${a(id)}">${t(lang, 'nav_' + (id === 'testimonial' ? 'testimonial' : id))}</a>`).join('')}
    <a class="btn small book-in-menu" href="${u('/book')}">${t(lang, 'bookNow')}</a></nav>
  <div class="langs" role="group" aria-label="${t(lang, 'langLabel')}">${LANGS.map(l => `<a href="${esc(prefix(l) + path)}" lang="${l}" hreflang="${l}"${l === lang ? ' aria-current="true"' : ''}>${l.toUpperCase()}</a>`).join('')}</div>
  ${book}
  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="menu" aria-label="${t(lang, 'menu')}"><span></span><span></span><span></span></button>
</div></header>
<main id="main">${body}</main>
<footer class="copy-footer"><div class="container">
  <span>&copy; ${new Date().getFullYear()} ${esc(S.shop_name)}${S.footer_text ? '. ' + esc(S.footer_text) : ''}</span>
  <a href="${u('/privacy')}">${t(lang, 'privacy')}</a>
  ${(S.instagram || S.facebook) ? `<span class="social">${S.instagram ? `<a href="${esc(S.instagram)}" rel="noopener" aria-label="Instagram">${SVG.instagram}</a>` : ''}${S.facebook ? `<a href="${esc(S.facebook)}" rel="noopener" aria-label="Facebook">${SVG.facebook}</a>` : ''}</span>` : ''}
  <span class="credit">${t(lang, 'iconsBy', { link: '<a href="https://www.flaticon.com/packs/linear-hairdressing-salon-elements" rel="noopener">Flaticon</a>' })}</span>
</div></footer>
<script type="application/json" id="i18n">${JSON.stringify(I.clientStrings(lang)).replace(/</g, '\\u003c')}</script>
<script src="/js/dates.js" defer></script><script src="/js/site.js" defer></script></body></html>`;
}

const consent = (lang, key, id) => `<label class="consent"><input type="checkbox" name="consent" id="${id}" required> <span>${t(lang, key, { link: `<a href="${prefix(lang)}/privacy">${t(lang, 'privacy')}</a>` })}</span></label>`;

const pages = {
  home(lang) {
    const S = C.getSettings(lang), img = C.imageStyle();
    const services = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY sort, id').all();
    const team = db.prepare('SELECT * FROM barbers WHERE active = 1 ORDER BY id').all();
    const gallery = db.prepare('SELECT g.*, b.name AS barber_name FROM gallery g LEFT JOIN barbers b ON b.id = g.barber_id ORDER BY g.id DESC LIMIT 60').all();
    const quotes = db.prepare('SELECT * FROM testimonials WHERE active = 1 ORDER BY sort, id').all();
    const galleryBarbers = [...new Map(gallery.filter(g => g.barber_id).map(g => [g.barber_id, g.barber_name])).entries()];
    const cu = slot => (img.custom[slot] ? ' has-custom' : '');
    const extraNav = [...(gallery.length ? [['gallery']] : []), ...(quotes.length ? [['testimonial']] : [])];
    const u = p => prefix(lang) + p;

    const body = `
<section id="home" class="intro parallax"><div class="container"><div class="intro-caption">
  <h1>${esc(S.hero_title)}</h1>${S.hero_text ? `<p>${esc(S.hero_text)}</p>` : ''}
  <p class="btns"><a class="btn" href="${u('/book')}">${esc(S.hero_button)}</a><a class="btn ghost" href="#services">${t(lang, 'exploreMore')}</a></p>
</div></div></section>

<section id="services" class="sec dark bg-services${cu('services')}"><div class="container">
  <h2>${esc(S.services_title)}</h2>
  <div class="service-grid">${services.map(s => `<div class="service"><img src="/img/icons/${ICON_KEYS.includes(s.icon) ? s.icon : 'scissors'}.png" alt="" width="50" height="50">
    <h3>${esc(pick(s, 'name', lang))}</h3><p>${esc(pick(s, 'description', lang))}</p></div>`).join('')}</div>
</div></section>

<section id="about" class="sec bg-about${cu('about')}"><div class="container"><div class="copy">
  <h2>${esc(S.about_title)}</h2>${S.about_lead ? `<p class="lead">${esc(S.about_lead)}</p>` : ''}${rich(S.about_text)}
  <p><a class="btn" href="${u('/book')}">${esc(S.hero_button)}</a></p>
</div></div></section>

<section id="price" class="sec bg-prices overlay"><div class="container">
  <h2 class="center">${esc(S.prices_title)}</h2>
  <div class="price-grid">${services.map(s => `<div class="price-card"><div class="price-count">${s.price}<span>${esc(S.currency)}</span></div>
    <h3>${esc(pick(s, 'name', lang))}</h3><p>${minutes(s.duration_min)}</p></div>`).join('')}</div>
</div></section>

<section id="team" class="sec team-section"><div class="container">
  <h2 class="gold center">${esc(S.team_title)}</h2>
  <div class="team-grid">${team.map(b => `<article class="member"><div class="photo">
    ${b.photo ? `<img src="${esc(b.photo)}" alt="${esc(b.name)}" loading="lazy">` : `<div class="initials" aria-hidden="true">${initials(b.name)}</div>`}
    <div class="overlay"><p>${esc(pick(b, 'bio', lang))}</p><a class="btn small" href="${u('/book')}?barber=${b.id}">${t(lang, 'bookWith', { name: esc(b.name.split(' ')[0]) })}</a></div></div>
    <div class="member-foot"><h3>${esc(b.name)}</h3><p>${esc(pick(b, 'role', lang))}</p></div></article>`).join('')}</div>
</div></section>

${gallery.length ? `<section id="gallery" class="sec dark gallery-section"><div class="container">
  <h2 class="center">${esc(S.gallery_title)}</h2>
  ${galleryBarbers.length > 1 ? `<div class="filters" role="group" aria-label="${t(lang, 'filterBarber')}"><button type="button" class="chip" aria-pressed="true" data-barber="">${t(lang, 'all')}</button>${galleryBarbers.map(([id, n]) => `<button type="button" class="chip" aria-pressed="false" data-barber="${id}">${esc(n)}</button>`).join('')}</div>` : ''}
  <div class="wall">${gallery.map(g => `<figure data-barber="${g.barber_id || ''}"><img src="${esc(g.url)}" alt="${esc(pick(g, 'caption', lang) || pick(g, 'tag', lang) || t(lang, 'haircutAlt'))}" loading="lazy">
    <figcaption>${esc([pick(g, 'tag', lang), g.barber_name].filter(Boolean).join(', '))}</figcaption></figure>`).join('')}</div>
</div></section>` : ''}

${quotes.length ? `<section id="testimonial" class="sec bg-testimonials${cu('testimonials')}"><div class="container">
  <h2 class="center">${esc(S.testimonials_title)}</h2>
  <div class="carousel" role="region" aria-roledescription="carousel" aria-label="${t(lang, 'reviewsLabel')}">
    <div class="track">${quotes.map((q, i) => `<figure class="slide" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${quotes.length}">
      ${SVG.quote}<blockquote>${esc(pick(q, 'quote', lang))}</blockquote><figcaption><b>${esc(q.name)}</b>${pick(q, 'label', lang) ? `<span>${esc(pick(q, 'label', lang))}</span>` : ''}</figcaption></figure>`).join('')}</div>
    ${quotes.length > 1 ? `<div class="car-nav"><button type="button" class="prev" aria-label="${t(lang, 'prevReview')}">${SVG.prev}</button><button type="button" class="next" aria-label="${t(lang, 'nextReview')}">${SVG.next}</button></div>` : ''}
  </div>
</div></section>` : ''}

<section id="contact" class="contact-section">
  ${C.hasMap(S) ? `<iframe class="map" title="${esc(S.address)}" src="${esc(C.mapEmbedUrl(S))}" loading="lazy" tabindex="-1" referrerpolicy="no-referrer"></iframe>` : ''}
  <div class="container"><div class="contact-card">
    <div class="info"><h2>${esc(S.contact_title)}</h2>
      <p>${esc(S.address)}<br><a href="${esc(C.mapsLink(S))}" rel="noopener" target="_blank">${t(lang, 'openMaps')}</a></p>
      <p><a href="tel:${tel(S.phone)}">${esc(S.phone)}</a>${S.email ? `<br><a href="mailto:${esc(S.email)}">${esc(S.email)}</a>` : ''}</p>
      <dl class="hours">${C.parseHours(S.hours).map(([d, h]) => `<dt>${esc(d)}</dt><dd>${esc(h)}</dd>`).join('')}</dl></div>
    <form id="contact-form" class="cform" novalidate>
      <label class="sr-only" for="c-name">${t(lang, 'name')}</label><input id="c-name" class="field" name="name" placeholder="${t(lang, 'fullName')}" autocomplete="name" required>
      <label class="sr-only" for="c-phone">${t(lang, 'phone')}</label><input id="c-phone" class="field" name="phone" type="tel" placeholder="${t(lang, 'phonePh')}" autocomplete="tel" required>
      <label class="sr-only" for="c-msg">${t(lang, 'message')}</label><textarea id="c-msg" class="field" name="message" rows="4" placeholder="${t(lang, 'message')}" required></textarea>
      <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      ${consent(lang, 'consentContact', 'c-consent')}
      <p class="msg" id="c-status" role="alert"></p>
      <button class="btn pill" type="submit">${t(lang, 'send')}</button>
    </form>
  </div></div>
</section>`;
    return shell({ lang, title: S.shop_name, body, S, path: '/', home: true, extraNav });
  },

  book(lang) {
    const S = C.getSettings(lang);
    const services = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY sort, id').all();
    const barbers = db.prepare('SELECT * FROM barbers WHERE active = 1 ORDER BY id').all();
    const offers = {};
    for (const r of db.prepare('SELECT * FROM barber_services').all()) (offers[r.service_id] ||= []).push(r.barber_id);
    const barberField = barbers.length === 1
      ? `<input type="hidden" name="barber" value="${barbers[0].id}">`
      : `<label>${t(lang, 'barber')}<select class="field" name="barber"><option value="">${t(lang, 'anyone')}</option>${barbers.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label>`;
    return shell({ lang, title: `${t(lang, 'bookTitle')} | ${S.shop_name}`, S, path: '/book', body: `
<section class="sec dark page-head"><div class="container"><h1 class="display">${t(lang, 'bookTitle')}</h1></div></section>
<section class="panel-sec"><div class="container"><div class="panel">
<form id="book" class="stack" novalidate data-offers="${esc(JSON.stringify(offers))}">
  <label>${t(lang, 'service')}<select class="field" name="service" required>${services.map(s => `<option value="${s.id}">${esc(pick(s, 'name', lang))}, ${minutes(s.duration_min)}, ${s.price} ${esc(S.currency)}</option>`).join('')}</select></label>
  ${barberField}
  <div><p class="label">${t(lang, 'date')}</p><div id="datepick" data-min="${plusDays(0)}" data-max="${plusDays(60)}"></div></div>
  <div><p class="label">${t(lang, 'time')}</p><div id="slots" class="slots" aria-live="polite"><span class="hint">${t(lang, 'chooseDateHint')}</span></div></div>
  <label>${t(lang, 'fullName')}<input class="field" name="fullname" autocomplete="name" required></label>
  <label>${t(lang, 'phone')}<input class="field" name="phone" type="tel" autocomplete="tel" required></label>
  <label>${t(lang, 'email')}<input class="field" name="email" type="email" autocomplete="email" required></label>
  ${consent(lang, 'consentBook', 'b-consent')}
  <p id="msg" class="msg" role="alert"></p>
  <button class="btn pill" type="submit">${t(lang, 'confirm')}</button>
</form></div></div></section>` });
  },

  manage(lang, a, locked) {
    const S = C.getSettings(lang);
    const details = `<dl class="details"><dt>${t(lang, 'service')}</dt><dd>${esc(pick({ name: a.service_name, name_ro: a.service_name_ro }, 'name', lang))}</dd><dt>${t(lang, 'barber')}</dt><dd>${esc(a.barber_name)}</dd>
      <dt>${t(lang, 'whenLbl')}</dt><dd>${esc(fmtLong(a.date, lang))}, ${fmtTime(a.start_min)}</dd><dt>${t(lang, 'name')}</dt><dd>${esc(a.name)}</dd></dl>`;
    let action;
    if (a.status === 'cancelled') action = `<p>${t(lang, 'cancelledText')}</p><p><a class="btn pill" href="${prefix(lang)}/book">${t(lang, 'bookNew')}</a></p>`;
    else if (locked) action = `<p>${t(lang, 'locked', { phone: `<a href="tel:${tel(S.phone)}">${esc(S.phone)}</a>` })}</p>`;
    else action = `<div id="manage" class="stack" data-token="${esc(a.token)}" data-service="${a.service_id}" data-barber="${a.barber_id}" data-value="${a.date}" data-min="${plusDays(0)}" data-max="${plusDays(60)}">
      <h2>${t(lang, 'moveTitle')}</h2>
      <div><p class="label">${t(lang, 'newDate')}</p><div id="datepick"></div></div>
      <div id="slots" class="slots" aria-live="polite"></div><p id="msg" class="msg" role="alert"></p>
      <p class="row"><button id="move" class="btn pill" type="button">${t(lang, 'move')}</button><button id="cancel" class="textbtn" type="button">${t(lang, 'cancel')}</button></p></div>`;
    return shell({ lang, title: `${t(lang, 'yourAppt')} | ${S.shop_name}`, S, path: `/booking/${a.token}`, index: false, body: `
<section class="sec dark page-head"><div class="container"><h1 class="display">${a.status === 'cancelled' ? t(lang, 'apptCancelled') : t(lang, 'yourAppt')}</h1></div></section>
<section class="panel-sec"><div class="container"><div class="panel">${details}${action}</div></div></section>` });
  },

  privacy(lang) {
    const S = C.getSettings(lang);
    return shell({ lang, title: `${t(lang, 'privacy')} | ${S.shop_name}`, S, path: '/privacy', body: `
<section class="sec dark page-head"><div class="container"><h1 class="display">${t(lang, 'privacy')}</h1></div></section>
<section class="panel-sec"><div class="container"><div class="panel prose">${rich(S.privacy_text)}</div></div></section>` });
  },

  notFound(lang) {
    const S = C.getSettings(lang);
    return shell({ lang, title: `${t(lang, 'notFound')} | ${S.shop_name}`, S, index: false, body: `<section class="sec dark page-head"><div class="container"><h1 class="display">${t(lang, 'notFound')}</h1><p><a class="btn" href="${prefix(lang)}/">${t(lang, 'backHome')}</a></p></div></section>` });
  },

  // Admin pages use their own light stylesheet; their text is translated in the browser (data-t marks static text).
  adminHead: title => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="robots" content="noindex"><link rel="icon" href="data:,"><link rel="stylesheet" href="/css/calendar.css"><link rel="stylesheet" href="/css/admin.css"></head>`,
  adminScripts: '<script src="/js/dates.js"></script><script src="/js/admin.js"></script>',
  login() {
    const S = C.getSettings('en');
    return `${pages.adminHead('Sign in')}<body class="login"><main><form id="login" class="card stack" novalidate><h1>${esc(S.shop_name)} <span data-t>admin</span></h1>
<label><span data-t>Email</span><input name="email" type="email" autocomplete="username" required></label>
<label><span data-t>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
<p id="msg" class="msg" role="alert"></p><button class="btn" type="submit" data-t>Sign in</button></form>
<p class="loginlang"><button type="button" class="linkbtn" id="lang">RO</button></p></main>${pages.adminScripts}</body></html>`;
  },
  admin(user) {
    const S = C.getSettings('en');
    return `${pages.adminHead('Admin')}<body data-owner="${user.barber_id ? 0 : 1}" data-barber="${user.barber_id || ''}">
<header class="ahead"><strong>${esc(S.shop_name)} <span data-t>admin</span></strong><span class="grow"></span><span class="who">${esc(user.email)}</span>
<a href="/" target="_blank" rel="noopener" data-t>View site</a><button id="lang" class="linkbtn" type="button">RO</button><button id="pw" class="linkbtn" type="button" data-t>Change password</button><button id="logout" class="linkbtn" type="button" data-t>Sign out</button></header>
<nav class="tabs" id="tabs" aria-label="Admin"></nav><main id="panel"></main>${pages.adminScripts}</body></html>`;
  },
};

module.exports = { ...pages, ICON_KEYS };
