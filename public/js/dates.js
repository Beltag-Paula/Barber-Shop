// European date handling and a small calendar widget, shared by the site and the admin.
// The browser's own <input type="date"> follows the browser's locale (often month/day/year), so it is not used.
// Dates here are always day/month/year (14/10/2026; 14.10.2026 in Romanian), weeks start on Monday, times are 24 hour.
const Dates = (() => {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => new Date(`${s}T00:00:00`);
  const locale = lang => (lang === 'ro' ? 'ro-RO' : 'en-GB');
  const fmt = (s, lang) => new Intl.DateTimeFormat(locale(lang), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parse(s));
  const fmtLong = (s, lang) => new Intl.DateTimeFormat(locale(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parse(s));
  // SQLite stores 'YYYY-MM-DD HH:MM:SS' in UTC; show it in the viewer's time zone, 24 hour.
  const fmtStamp = (s, lang) => new Intl.DateTimeFormat(locale(lang), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(s.replace(' ', 'T') + 'Z'));
  const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k.includes('-') || k === 'role') e.setAttribute(k, v); else e[k] = v; } e.append(...kids); return e; };

  // A calendar. inline: always visible (booking pages). Otherwise a text field showing dd/mm/yyyy that opens a popup.
  // The returned element has .value (YYYY-MM-DD or '') and fires a 'change' event when a day is picked.
  function field({ lang = 'en', value = '', min = '', max = '', inline = false, label = '', prevLabel = 'Previous month', nextLabel = 'Next month' } = {}) {
    const root = el('div', { className: 'dfield' + (inline ? ' inline' : '') });
    let current = value, view = new Date((value ? parse(value) : min ? parse(min) : new Date()).setDate(1));
    const input = inline ? null : el('input', { type: 'text', readOnly: true, className: 'dinput', placeholder: lang === 'ro' ? 'zz.ll.aaaa' : 'dd/mm/yyyy', value: value ? fmt(value, lang) : '' });
    if (input) { input.setAttribute('aria-haspopup', 'dialog'); if (label) input.setAttribute('aria-label', label); }
    const pop = el('div', { className: 'cal' });
    const summary = inline ? el('p', { className: 'picked', 'aria-live': 'polite' }) : null;
    const monthFmt = new Intl.DateTimeFormat(locale(lang), { month: 'long', year: 'numeric' });
    const dowFmt = new Intl.DateTimeFormat(locale(lang), { weekday: 'short' });
    const longFmt = new Intl.DateTimeFormat(locale(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const monthStart = d => new Date(d.getFullYear(), d.getMonth(), 1);
    const open = () => !pop.hidden;

    function draw() {
      pop.replaceChildren();
      const y = view.getFullYear(), m = view.getMonth();
      const prev = el('button', { type: 'button', textContent: '\u2039', 'aria-label': prevLabel, disabled: !!min && monthStart(parse(min)) >= view, onclick: () => { view = new Date(y, m - 1, 1); draw(); } });
      const next = el('button', { type: 'button', textContent: '\u203a', 'aria-label': nextLabel, disabled: !!max && monthStart(parse(max)) <= view, onclick: () => { view = new Date(y, m + 1, 1); draw(); } });
      pop.append(el('div', { className: 'cal-head' }, prev, el('span', { textContent: monthFmt.format(view), 'aria-live': 'polite' }), next));
      const grid = el('div', { className: 'cal-grid' });
      for (let i = 0; i < 7; i++) grid.append(el('span', { className: 'cal-dow', textContent: dowFmt.format(new Date(2024, 0, 1 + i)) })); // 1 Jan 2024 is a Monday
      for (let i = 0; i < (new Date(y, m, 1).getDay() + 6) % 7; i++) grid.append(el('span'));
      const today = iso(new Date());
      for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
        const s = iso(new Date(y, m, d));
        const b = el('button', { type: 'button', className: 'day' + (s === today ? ' today' : ''), textContent: d, disabled: (!!min && s < min) || (!!max && s > max), 'aria-label': longFmt.format(new Date(y, m, d)) });
        b.setAttribute('aria-pressed', String(s === current));
        b.onclick = () => pick(s);
        grid.append(b);
      }
      pop.append(grid);
      if (summary) summary.textContent = current ? `${fmtLong(current, lang)} (${fmt(current, lang)})` : '';
    }
    function pick(s) {
      current = s;
      if (input) { input.value = fmt(s, lang); pop.hidden = true; }
      draw();
      root.dispatchEvent(new Event('change', { bubbles: true }));
    }
    Object.defineProperty(root, 'value', {
      get: () => current,
      set: v => { current = v || ''; if (v) view = monthStart(parse(v)); if (input) input.value = v ? fmt(v, lang) : ''; draw(); },
    });
    if (input) {
      pop.hidden = true; pop.setAttribute('role', 'dialog');
      input.addEventListener('click', () => { pop.hidden = !pop.hidden; });
      input.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pop.hidden = !pop.hidden; } });
      document.addEventListener('click', e => { if (open() && !root.contains(e.target)) pop.hidden = true; });
      root.addEventListener('keydown', e => { if (e.key === 'Escape' && open()) { pop.hidden = true; input.focus(); } });
      root.append(input, pop);
    } else root.append(pop, summary);
    draw();
    return root;
  }

  return { iso, parse, fmt, fmtLong, fmtStamp, field };
})();
