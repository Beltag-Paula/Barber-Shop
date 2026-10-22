// Razor front end: loader, header, smooth scroll, nav highlight, carousel, gallery filter, forms. No libraries.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (tag, props = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k.includes('-') || k === 'role') el.setAttribute(k, v); else el[k] = v; } el.append(...kids); return el; };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LANG = document.documentElement.lang || 'en';
const PFX = document.body.dataset.prefix || '';          // '' or '/ro': keeps internal links in the current language
const T = JSON.parse(document.getElementById('i18n')?.textContent || '{}'); // interface strings for this language

async function api(url, body, method = body ? 'POST' : 'GET') {
  const headers = { 'X-Lang': LANG, ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || T.errGeneric);
  return data;
}

// Page loader: fade out once everything has loaded (with a safety timeout).
const loader = $('#loader');
const hideLoader = () => loader && loader.classList.add('done');
if (document.readyState === 'complete') hideLoader(); else addEventListener('load', hideLoader);
setTimeout(hideLoader, 4000);

// Header: slimmer and darker after scrolling 100px.
const nav = $('#top');
const onScroll = () => nav.classList.toggle('scrolled', scrollY >= 100);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Phone menu: a full-screen panel. The page behind it does not scroll while it is open.
const toggle = $('.nav-toggle'), menu = $('#menu');
const setMenu = open => {
  menu.classList.toggle('open', open); nav.classList.toggle('open', open);
  document.body.classList.toggle('menu-open', open); toggle.setAttribute('aria-expanded', String(open));
};
toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
addEventListener('resize', () => { if (innerWidth > 991) setMenu(false); });

// Booking bar for phones: appears once the visitor scrolls past the top, hides while typing in a form.
const bar = $('.book-bar');
if (bar) {
  const update = () => bar.classList.toggle('show', scrollY > innerHeight * 0.6);
  addEventListener('scroll', update, { passive: true }); update();
  document.addEventListener('focusin', e => { if (e.target.matches('input, textarea, select')) document.body.classList.add('typing'); });
  document.addEventListener('focusout', () => document.body.classList.remove('typing'));
}

// Smooth scrolling to #sections over one second with an ease-in-out curve.
function scrollToY(y) {
  if (reduceMotion) return scrollTo(0, y);
  const start = scrollY, dist = y - start, t0 = performance.now(), ms = 1000;
  (function step(now) {
    const p = Math.min((now - t0) / ms, 1);
    scrollTo(0, start + dist * (0.5 - Math.cos(p * Math.PI) / 2));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
document.addEventListener('click', e => {
  const a = e.target.closest('a[href*="#"]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const url = new URL(a.href, location.href);
  if (url.pathname !== location.pathname || !url.hash) return;
  const target = $(url.hash);
  if (!target) return;
  e.preventDefault();
  scrollToY(target.getBoundingClientRect().top + scrollY);
  history.replaceState(null, '', url.hash);
});

// Highlight the nav link of the section in view.
if ($('#home')) {
  const links = new Map($$('.menu a[href*="#"]').map(a => [new URL(a.href, location.href).hash.slice(1), a]));
  const seen = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) { links.forEach(a => a.classList.remove('active')); links.get(en.target.id)?.classList.add('active'); }
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const s = document.getElementById(id); if (s) seen.observe(s); });
}

// Calls onSwipe(-1) for a swipe to the left and onSwipe(1) for a swipe to the right (touch and mouse).
function swipe(el, onSwipe) {
  let x0 = null;
  el.addEventListener('pointerdown', e => { x0 = e.clientX; });
  el.addEventListener('pointerup', e => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) onSwipe(dx < 0 ? -1 : 1); });
  el.addEventListener('pointercancel', () => { x0 = null; });
}

// Testimonials carousel: slides sideways, auto-advances every 5 s, pauses on hover or focus.
const carousel = $('.carousel');
if (carousel) {
  const track = $('.track', carousel), slides = $$('.slide', carousel);
  let i = 0, timer;
  const go = n => {
    i = (n + slides.length) % slides.length;
    track.style.transform = `translateX(${-100 * i}%)`;
    slides.forEach((s, k) => s.setAttribute('aria-hidden', String(k !== i)));
  };
  const play = () => { if (slides.length > 1 && !reduceMotion) timer = setInterval(() => go(i + 1), 5000); };
  const stop = () => clearInterval(timer);
  $('.prev', carousel)?.addEventListener('click', () => go(i - 1));
  $('.next', carousel)?.addEventListener('click', () => go(i + 1));
  swipe(carousel, dir => go(i - dir));
  carousel.addEventListener('mouseenter', stop); carousel.addEventListener('mouseleave', play);
  carousel.addEventListener('focusin', stop); carousel.addEventListener('focusout', play);
  go(0); play();
}

// Gallery filter by barber.
$$('.filters .chip').forEach(chip => chip.addEventListener('click', () => {
  $$('.filters .chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
  $$('.wall figure').forEach(f => { f.hidden = !!chip.dataset.barber && f.dataset.barber !== chip.dataset.barber; });
}));

// Gallery viewer: a tile opens the whole photo; arrows, swipe and the arrow keys move between photos.
const lightbox = $('#lightbox');
if (lightbox) {
  const photo = $('img', lightbox), caption = $('figcaption', lightbox);
  let tiles = [], k = 0;
  const show = n => {
    k = (n + tiles.length) % tiles.length;
    const t = tiles[k];
    photo.src = t.dataset.full; photo.alt = t.dataset.alt || '';
    caption.textContent = t.closest('figure').querySelector('figcaption')?.textContent || '';
  };
  $$('.tile').forEach(t => t.addEventListener('click', () => {
    tiles = $$('.wall figure:not([hidden]) .tile');
    show(tiles.indexOf(t)); lightbox.showModal(); document.body.classList.add('noscroll');
  }));
  $('.lb-prev', lightbox).addEventListener('click', () => show(k - 1));
  $('.lb-next', lightbox).addEventListener('click', () => show(k + 1));
  $('.lb-close', lightbox).addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.close(); });
  lightbox.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') show(k - 1); if (e.key === 'ArrowRight') show(k + 1); });
  lightbox.addEventListener('close', () => { photo.removeAttribute('src'); document.body.classList.remove('noscroll'); });
  swipe(lightbox, dir => show(k - dir));
}

// Contact form.
const contact = $('#contact-form');
if (contact) contact.addEventListener('submit', async e => {
  e.preventDefault();
  const f = contact.elements, out = $('#c-status');
  out.className = 'msg'; out.textContent = '';
  try {
    await api('/api/contact', { name: f.name.value, phone: f.phone.value, message: f.message.value, website: f.website.value, consent: f.consent.checked });
    contact.replaceChildren(h('p', { className: 'msg ok', textContent: T.sent }));
  } catch (err) { out.textContent = err.message; }
});

// Slot picker shared by booking and manage pages. Every time of the day is shown; times that cannot be booked
// (already booked, in the past, or blocked) are greyed out and cannot be chosen.
function slotPicker(box, getParams, onPick) {
  const why = { booked: T.slotBooked, past: T.slotPast, off: T.slotOff };
  return async function refresh() {
    box.replaceChildren();
    const p = getParams();
    if (!p) return;
    try {
      const { slots } = await api('/api/slots?' + new URLSearchParams({ ...p, all: '1' }));
      if (!slots.some(s => s.free)) box.append(h('p', { className: 'hint nofree', textContent: T.noTimes }));
      for (const s of slots) {
        const b = h('button', { type: 'button', className: 'slot' + (s.free ? '' : ' taken'), textContent: s.label, disabled: !s.free });
        b.setAttribute('aria-pressed', 'false');
        if (s.free) b.onclick = () => { $$('.slot', box).forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); onPick(s); };
        else { const reason = why[s.reason] || T.slotOff; b.title = reason; b.setAttribute('aria-label', `${s.label}, ${reason}`); }
        box.append(b);
      }
    } catch (e) { box.textContent = e.message; }
  };
}

const book = $('#book');
if (book) {
  const f = book.elements, msg = $('#msg'), offers = JSON.parse(book.dataset.offers), holder = $('#datepick');
  const cal = Dates.field({ lang: LANG, inline: true, min: holder.dataset.min, max: holder.dataset.max, prevLabel: T.prevMonth, nextLabel: T.nextMonth, unavailableLabel: T.dayFull,
    availability: async month => (await api('/api/days?' + new URLSearchParams({ service: f.service.value, barber: f.barber.value, month }))).days });
  holder.append(cal);
  let picked = null;
  const refresh = slotPicker($('#slots'), () => (f.service.value && cal.value ? { service: f.service.value, barber: f.barber.value, date: cal.value } : null), s => (picked = s));
  const syncBarbers = () => {
    if (!f.barber.options) return; // a single barber is a hidden field
    for (const o of f.barber.options) o.hidden = o.disabled = !!o.value && !(offers[f.service.value] || []).includes(+o.value);
    if (f.barber.selectedOptions[0]?.disabled) f.barber.value = '';
  };
  const q = new URLSearchParams(location.search);
  if (q.get('service')) f.service.value = q.get('service');
  syncBarbers();
  if (q.get('barber') && f.barber.options) f.barber.value = q.get('barber');
  for (const n of ['service', 'barber']) f[n].addEventListener('change', () => { picked = null; if (n === 'service') syncBarbers(); cal.reloadAvailability(); refresh(); });
  cal.addEventListener('change', () => { picked = null; refresh(); });
  book.addEventListener('submit', async e => {
    e.preventDefault();
    if (!picked) { msg.textContent = T.pickDateTime; return; }
    msg.textContent = '';
    try {
      const r = await api('/api/book', { service: f.service.value, barber: picked.barber_id, date: cal.value, start_min: picked.start_min, name: f.fullname.value, phone: f.phone.value, email: f.email.value, consent: f.consent.checked });
      location.href = `${PFX}/booking/${r.token}`;
    } catch (err) { msg.textContent = err.message; picked = null; refresh(); }
  });
}

const manage = $('#manage');
if (manage) {
  const d = manage.dataset, msg = $('#msg');
  const cal = Dates.field({ lang: LANG, inline: true, value: d.value, min: d.min, max: d.max, prevLabel: T.prevMonth, nextLabel: T.nextMonth, unavailableLabel: T.dayFull,
    availability: async month => (await api('/api/days?' + new URLSearchParams({ service: d.service, barber: d.barber, month, token: d.token }))).days });
  $('#datepick').append(cal);
  let picked = null;
  const refresh = slotPicker($('#slots'), () => (cal.value ? { service: d.service, barber: d.barber, date: cal.value, token: d.token } : null), s => (picked = s));
  cal.addEventListener('change', () => { picked = null; refresh(); });
  refresh();
  $('#move').onclick = async () => {
    if (!picked) { msg.textContent = T.pickNewTime; return; }
    try { await api(`/api/booking/${d.token}/move`, { date: cal.value, start_min: picked.start_min }); location.reload(); }
    catch (e) { msg.textContent = e.message; refresh(); }
  };
  $('#cancel').onclick = async () => {
    if (!confirm(T.confirmCancel)) return;
    try { await api(`/api/booking/${d.token}/cancel`, {}); location.reload(); } catch (e) { msg.textContent = e.message; }
  };
}
