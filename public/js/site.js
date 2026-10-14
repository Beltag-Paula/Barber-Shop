// Razor front end: loader, header, smooth scroll, nav highlight, carousel, gallery filter, forms. No libraries.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (tag, props = {}, ...kids) => { const el = Object.assign(document.createElement(tag), props); el.append(...kids); return el; };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function api(url, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
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

// Mobile menu.
const toggle = $('.nav-toggle'), menu = $('#menu');
const setMenu = open => { menu.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); };
toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });

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
  const links = new Map($$('.menu a').map(a => [new URL(a.href, location.href).hash.slice(1), a]));
  const seen = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) { links.forEach(a => a.classList.remove('active')); links.get(en.target.id)?.classList.add('active'); }
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const s = document.getElementById(id); if (s) seen.observe(s); });
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
  carousel.addEventListener('mouseenter', stop); carousel.addEventListener('mouseleave', play);
  carousel.addEventListener('focusin', stop); carousel.addEventListener('focusout', play);
  go(0); play();
}

// Gallery filter by barber.
$$('.filters .chip').forEach(chip => chip.addEventListener('click', () => {
  $$('.filters .chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
  $$('.wall figure').forEach(f => { f.hidden = !!chip.dataset.barber && f.dataset.barber !== chip.dataset.barber; });
}));

// Contact form.
const contact = $('#contact-form');
if (contact) contact.addEventListener('submit', async e => {
  e.preventDefault();
  const f = contact.elements, out = $('#c-status');
  out.className = 'msg'; out.textContent = '';
  try {
    await api('/api/contact', { name: f.name.value, phone: f.phone.value, message: f.message.value, website: f.website.value });
    contact.replaceChildren(h('p', { className: 'msg ok', textContent: 'Message sent. We will call or text you back.' }));
  } catch (err) { out.textContent = err.message; }
});

// Slot picker shared by booking and manage pages.
function slotPicker(box, getParams, onPick) {
  return async function refresh() {
    box.replaceChildren();
    const p = getParams();
    if (!p) return;
    try {
      const { slots } = await api('/api/slots?' + new URLSearchParams(p));
      if (!slots.length) { box.append(h('span', { className: 'hint', textContent: 'No times free on this day. Try another date.' })); return; }
      for (const s of slots) {
        const b = h('button', { type: 'button', className: 'slot', textContent: s.label });
        b.setAttribute('aria-pressed', 'false');
        b.onclick = () => { $$('.slot', box).forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); onPick(s); };
        box.append(b);
      }
    } catch (e) { box.textContent = e.message; }
  };
}

const book = $('#book');
if (book) {
  const f = book.elements, msg = $('#msg'), offers = JSON.parse(book.dataset.offers);
  let picked = null;
  const refresh = slotPicker($('#slots'), () => (f.service.value && f.date.value ? { service: f.service.value, barber: f.barber.value, date: f.date.value } : null), s => (picked = s));
  const syncBarbers = () => {
    if (!f.barber.options) return; // a single barber is a hidden field
    for (const o of f.barber.options) o.hidden = o.disabled = !!o.value && !(offers[f.service.value] || []).includes(+o.value);
    if (f.barber.selectedOptions[0]?.disabled) f.barber.value = '';
  };
  const q = new URLSearchParams(location.search);
  if (q.get('service')) f.service.value = q.get('service');
  syncBarbers();
  if (q.get('barber') && f.barber.options) f.barber.value = q.get('barber');
  for (const n of ['service', 'barber', 'date']) f[n].addEventListener('change', () => { picked = null; if (n === 'service') syncBarbers(); refresh(); });
  book.addEventListener('submit', async e => {
    e.preventDefault();
    if (!picked) { msg.textContent = 'Choose a date and a time.'; return; }
    msg.textContent = '';
    try {
      const r = await api('/api/book', { service: f.service.value, barber: picked.barber_id, date: f.date.value, start_min: picked.start_min, name: f.fullname.value, phone: f.phone.value, email: f.email.value });
      location.href = '/booking/' + r.token;
    } catch (err) { msg.textContent = err.message; picked = null; refresh(); }
  });
}

const manage = $('#manage');
if (manage) {
  const d = manage.dataset, date = manage.querySelector('[name=date]'), msg = $('#msg');
  let picked = null;
  const refresh = slotPicker($('#slots'), () => (date.value ? { service: d.service, barber: d.barber, date: date.value, token: d.token } : null), s => (picked = s));
  date.addEventListener('change', () => { picked = null; refresh(); });
  refresh();
  $('#move').onclick = async () => {
    if (!picked) { msg.textContent = 'Choose a new time.'; return; }
    try { await api(`/api/booking/${d.token}/move`, { date: date.value, start_min: picked.start_min }); location.reload(); }
    catch (e) { msg.textContent = e.message; refresh(); }
  };
  $('#cancel').onclick = async () => {
    if (!confirm('Cancel this appointment?')) return;
    try { await api(`/api/booking/${d.token}/cancel`, {}); location.reload(); } catch (e) { msg.textContent = e.message; }
  };
}
