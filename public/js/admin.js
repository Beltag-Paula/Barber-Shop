const $ = (s, r = document) => r.querySelector(s);
const h = (tag, props = {}, ...kids) => { const el = Object.assign(document.createElement(tag), props); el.append(...kids); return el; };
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

async function api(url, body, method = body ? 'POST' : 'GET') {
  const isForm = body instanceof FormData;
  const res = await fetch(url, { method, headers: body && !isForm ? { 'Content-Type': 'application/json' } : {}, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.endsWith('/login')) location.href = '/admin/login';
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}
const A = '/admin/api';

// ---- Sign in ----
const login = $('#login');
if (login) login.addEventListener('submit', async e => {
  e.preventDefault();
  try { await api(`${A}/login`, { email: login.elements.email.value, password: login.elements.password.value }); location.href = '/admin'; }
  catch (err) { $('#msg').textContent = err.message; }
});

if (document.body.dataset.owner !== undefined) {
const OWNER = document.body.dataset.owner === '1';
const panel = $('#panel');

// ---- Form building blocks ----
function fieldEl(f) {
  if (f.type === 'checks') {
    return h('fieldset', { className: 'checks' }, h('legend', { textContent: f.label }), ...f.options.map(([v, t]) =>
      h('label', { className: 'check' }, h('input', { type: 'checkbox', name: f.name, value: v, checked: (f.value || []).includes(v) }), t)));
  }
  if (f.type === 'checkbox') return h('label', { className: 'check' }, h('input', { type: 'checkbox', name: f.name, checked: !!f.value }), f.label);
  let input;
  if (f.type === 'textarea') input = h('textarea', { name: f.name, rows: f.rows || 3, value: f.value ?? '' });
  else if (f.type === 'select') input = h('select', { name: f.name }, ...f.options.map(([v, t]) => h('option', { value: v, textContent: t, selected: String(v) === String(f.value) })));
  else input = h('input', { type: f.type || 'text', name: f.name, value: f.value ?? '', ...(f.attrs || {}) });
  return h('label', {}, f.label, input, ...(f.hint ? [h('small', { className: 'hint', textContent: f.hint })] : []));
}
function readForm(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.type === 'file' || el.tagName === 'BUTTON') continue;
    if (el.type === 'checkbox' && el.value !== 'on') { (o[el.name] ||= []); if (el.checked) o[el.name].push(Number(el.value)); }
    else o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return o;
}
function say(msgEl, ok, text) { msgEl.className = ok ? 'msg ok' : 'msg'; msgEl.textContent = text; }

// A form with a Save button (and optional Delete) that reports success or errors inline.
function editor({ fields, onSave, onDelete, saveText = 'Save', deleteText = 'Delete' }) {
  const form = h('form', { className: 'stack' });
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].half && fields[i + 1]?.half) { form.append(h('div', { className: 'grid2' }, fieldEl(fields[i]), fieldEl(fields[i + 1]))); i++; }
    else form.append(fieldEl(fields[i]));
  }
  const msg = h('p', { className: 'msg', role: 'status' });
  form.append(msg, h('div', { className: 'actions' }, h('button', { className: 'btn', type: 'submit', textContent: saveText }),
    ...(onDelete ? [h('button', { className: 'linkbtn danger', type: 'button', textContent: deleteText, onclick: async () => {
      if (!confirm(`${deleteText}? This cannot be undone.`)) return;
      try { await onDelete(); } catch (err) { say(msg, false, err.message); }
    } })] : [])));
  form.addEventListener('submit', async e => {
    e.preventDefault(); say(msg, false, '');
    try { await onSave(readForm(form)); say(msg, true, 'Saved.'); } catch (err) { say(msg, false, err.message); }
  });
  return form;
}

// Upload control: choose a file, send it, then call done(result).
function uploader(label, url, done, extra = {}) {
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', 'aria-label': label });
  const msg = h('p', { className: 'msg', role: 'status' });
  const btn = h('button', { className: 'btn secondary', type: 'button', textContent: label, onclick: async () => {
    if (!file.files[0]) return say(msg, false, 'Choose an image first.');
    const fd = new FormData(); fd.append('photo', file.files[0]);
    for (const [k, v] of Object.entries(extra)) fd.append(k, typeof v === 'function' ? v() : v);
    btn.disabled = true; say(msg, true, 'Uploading...');
    try { done(await api(url, fd)); } catch (err) { say(msg, false, err.message); } finally { btn.disabled = false; }
  } });
  return h('div', { className: 'stack' }, file, h('div', { className: 'actions' }, btn), msg);
}

// ---- Appointments ----
async function appointments() {
  const day = h('input', { type: 'date', value: iso(new Date()), 'aria-label': 'Day' });
  const cols = h('div', { className: 'cols' });
  const shift = n => { const d = new Date(day.value + 'T00:00:00'); d.setDate(d.getDate() + n); day.value = iso(d); load(); };
  day.onchange = () => load();

  function picker(box, a) {
    const open = box.querySelector('.picker'); if (open) return open.remove();
    let picked = null;
    const date = h('input', { type: 'date', value: a.date });
    const slots = h('div', { className: 'slots' }), msg = h('p', { className: 'msg', role: 'alert' });
    const refresh = async () => {
      slots.replaceChildren(); picked = null;
      try {
        const { slots: list } = await api('/api/slots?' + new URLSearchParams({ service: a.service_id, barber: a.barber_id, date: date.value, token: a.token }));
        if (!list.length) slots.append(h('span', { className: 'hint', textContent: 'No free times that day.' }));
        for (const s of list) {
          const b = h('button', { type: 'button', className: 'slot', textContent: s.label });
          b.setAttribute('aria-pressed', 'false');
          b.onclick = () => { slots.querySelectorAll('.slot').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); picked = s; };
          slots.append(b);
        }
      } catch (e) { msg.textContent = e.message; }
    };
    date.onchange = refresh;
    const go = h('button', { className: 'btn', type: 'button', textContent: 'Move appointment', onclick: async () => {
      if (!picked) return say(msg, false, 'Choose a new time.');
      try { await api(`${A}/appointments/${a.id}/move`, { date: date.value, start_min: picked.start_min }); load(); } catch (e) { say(msg, false, e.message); refresh(); }
    } });
    box.append(h('div', { className: 'picker' }, date, slots, msg, go)); refresh();
  }
  function row(a) {
    const box = h('div', { className: 'appt' });
    box.append(
      h('div', {}, h('strong', { textContent: `${a.start} to ${a.end}` }), ` ${a.service_name}`, h('br'), `${a.name}, `, h('a', { href: 'tel:' + a.phone, textContent: a.phone })),
      h('div', { className: 'actions' },
        h('button', { className: 'linkbtn', type: 'button', textContent: 'Reschedule', onclick: () => picker(box, a) }),
        h('button', { className: 'linkbtn danger', type: 'button', textContent: 'Cancel', onclick: async () => {
          if (!confirm(`Cancel the appointment for ${a.name}? They will be emailed.`)) return;
          try { await api(`${A}/appointments/${a.id}/cancel`, {}); load(); } catch (e) { alert(e.message); }
        } })));
    return box;
  }
  async function load() {
    const { appointments: list } = await api(`${A}/appointments?date=${day.value}`);
    cols.replaceChildren();
    if (!list.length) return cols.append(h('p', { textContent: 'No appointments on this day.' }));
    const by = new Map();
    for (const a of list) by.set(a.barber_name, [...(by.get(a.barber_name) || []), a]);
    for (const [name, items] of by) cols.append(h('div', {}, h('h2', { textContent: name }), ...items.map(row)));
  }
  panel.replaceChildren(h('h1', { textContent: 'Appointments' }),
    h('div', { className: 'dayrow' }, h('button', { className: 'btn secondary', type: 'button', textContent: 'Previous day', onclick: () => shift(-1) }), day,
      h('button', { className: 'btn secondary', type: 'button', textContent: 'Next day', onclick: () => shift(1) })), cols);
  await load();
}

// ---- Site text and location ----
const mapSrc = (lat, lng, zoom) => {
  const w = 0.004 * 2 ** (16 - Math.min(19, Math.max(3, Math.round(+zoom || 16)))), ht = w * 0.6, f = n => n.toFixed(6);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${f(lng - w)},${f(lat - ht)},${f(lng + w)},${f(lat + ht)}&layer=mapnik&marker=${f(lat)},${f(lng)}`;
};
async function site() {
  const { fields, values } = await api(`${A}/settings`);
  const form = h('form', { className: 'stack' });
  const msg = h('p', { className: 'msg', role: 'status' });
  let group;
  for (const f of fields) {
    if (f.group !== group) { group = f.group; form.append(h('h2', { textContent: group })); }
    form.append(fieldEl({ name: f.key, label: f.label, type: f.type || 'text', value: values[f.key], rows: f.rows, hint: f.hint }));
    if (f.key === 'zoom') {
      const preview = h('iframe', { className: 'preview', title: 'Map preview', hidden: true });
      const note = h('p', { className: 'msg', role: 'status' });
      const refresh = () => {
        const lat = parseFloat(form.elements.lat.value), lng = parseFloat(form.elements.lng.value);
        preview.hidden = isNaN(lat) || isNaN(lng);
        if (!preview.hidden) preview.src = mapSrc(lat, lng, form.elements.zoom.value);
      };
      for (const n of ['lat', 'lng', 'zoom']) form.elements[n].addEventListener('change', refresh);
      form.append(h('div', { className: 'actions' }, h('button', { className: 'btn secondary', type: 'button', textContent: 'Find the address on the map', onclick: async () => {
        say(note, true, 'Searching...');
        try {
          const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(form.elements.address.value));
          const j = await r.json();
          if (!j.length) throw new Error('No match. Try a fuller address, or type the coordinates in by hand.');
          form.elements.lat.value = (+j[0].lat).toFixed(6); form.elements.lng.value = (+j[0].lon).toFixed(6);
          say(note, true, 'Found. Check the map, then save.'); refresh();
        } catch (err) { say(note, false, err.message); }
      } })), note, preview);
      refresh();
    }
  }
  form.append(msg, h('div', { className: 'actions' }, h('button', { className: 'btn', type: 'submit', textContent: 'Save changes' })));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try { await api(`${A}/settings`, readForm(form), 'PUT'); say(msg, true, 'Saved. Reload the site to see it.'); } catch (err) { say(msg, false, err.message); }
  });
  panel.replaceChildren(h('h1', { textContent: 'Site text and location' }), form);
}

// ---- Images ----
async function images() {
  const { images: list } = await api(`${A}/images`);
  panel.replaceChildren(h('h1', { textContent: 'Section images' }),
    h('p', { className: 'hint', textContent: 'Photos are resized for the web automatically. Landscape photos at least 1600 px wide work best.' }),
    ...list.map(im => {
      const pic = h('img', { className: 'thumb', src: im.url, alt: `Current ${im.label.toLowerCase()}` });
      const reset = h('button', { className: 'linkbtn', type: 'button', textContent: 'Go back to the original image', hidden: !im.custom, onclick: async () => { await api(`${A}/images/${im.slot}`, null, 'DELETE'); images(); } });
      return h('div', { className: 'card stack' }, h('h3', { textContent: im.label }), h('p', { className: 'hint', textContent: im.hint }), pic,
        uploader('Upload new image', `${A}/images/${im.slot}`, r => { pic.src = r.url; reset.hidden = false; }), reset);
    }));
}

// ---- Services ----
async function services() {
  const { services: list, barbers, icons } = await api(`${A}/services`);
  const fieldsFor = s => [
    { name: 'name', label: 'Name', value: s.name, half: true }, { name: 'icon', label: 'Icon', type: 'select', value: s.icon || 'scissors', options: icons.map(i => [i, i]), half: true },
    { name: 'description', label: 'Short description', value: s.description },
    { name: 'price', label: 'Price', type: 'number', value: s.price ?? '', attrs: { min: 0 }, half: true }, { name: 'duration_min', label: 'Duration in minutes', type: 'number', value: s.duration_min ?? 30, attrs: { min: 5, step: 5 }, half: true },
    { name: 'sort', label: 'Order on the page (1 comes first)', type: 'number', value: s.sort ?? 0, attrs: { min: 0 } },
    { name: 'barbers', label: 'Offered by', type: 'checks', options: barbers.map(b => [b.id, b.name]), value: s.barbers ?? barbers.map(b => b.id) },
    { name: 'active', label: 'Show on the site and allow booking', type: 'checkbox', value: s.active ?? 1 },
  ];
  const add = h('details', {}, h('summary', { textContent: 'Add a service' }), h('div', { className: 'body' },
    editor({ fields: fieldsFor({}), saveText: 'Add service', onSave: async v => { await api(`${A}/services`, v); services(); } })));
  panel.replaceChildren(h('h1', { textContent: 'Services and prices' }),
    ...list.map(s => h('details', {}, h('summary', {}, s.name, h('small', { textContent: `${s.price}, ${s.duration_min} min${s.active ? '' : ', hidden'}` })),
      h('div', { className: 'body' }, editor({ fields: fieldsFor(s), onSave: v => api(`${A}/services/${s.id}`, v, 'PUT'),
        onDelete: async () => { const r = await api(`${A}/services/${s.id}`, null, 'DELETE'); if (r.deactivated) alert('This service has booking history, so it was hidden instead of deleted.'); services(); } })))), add);
}

// ---- Team ----
const DAYS = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [0, 'Sunday']];
function hoursEditor(b) {
  const form = h('form', { className: 'stack' }), grid = h('div', { className: 'hours' }), msg = h('p', { className: 'msg', role: 'status' });
  const rows = DAYS.map(([i, name]) => {
    const d = b.hours[i];
    const on = h('input', { type: 'checkbox', checked: !!d, 'aria-label': `${name} working` });
    const from = h('input', { type: 'time', value: d?.opens || '10:00', 'aria-label': `${name} opens` }), to = h('input', { type: 'time', value: d?.closes || '19:00', 'aria-label': `${name} closes` });
    const sync = () => { from.disabled = to.disabled = !on.checked; }; on.onchange = sync; sync();
    grid.append(h('span', { textContent: name }), on, from, to);
    return { i, on, from, to };
  });
  form.append(grid, msg, h('div', { className: 'actions' }, h('button', { className: 'btn', type: 'submit', textContent: 'Save schedule' })));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const days = Array(7).fill(null);
    for (const r of rows) if (r.on.checked) days[r.i] = { opens: r.from.value, closes: r.to.value };
    try { await api(`${A}/team/${b.id}/hours`, { days }, 'PUT'); say(msg, true, 'Saved.'); } catch (err) { say(msg, false, err.message); }
  });
  return form;
}
function timeOff(b) {
  const list = h('div'), msg = h('p', { className: 'msg', role: 'status' });
  const draw = () => {
    list.replaceChildren(...(b.timeoff.length ? b.timeoff.map(t => h('p', {}, `${t.date}${t.reason ? ', ' + t.reason : ''} `,
      h('button', { className: 'linkbtn danger', type: 'button', textContent: 'Remove', onclick: async () => { await api(`${A}/timeoff/${t.id}`, null, 'DELETE'); b.timeoff = b.timeoff.filter(x => x.id !== t.id); draw(); } })))
      : [h('p', { className: 'hint', textContent: 'No days off booked.' })]));
  };
  draw();
  const date = h('input', { type: 'date', 'aria-label': 'Day off' }), reason = h('input', { placeholder: 'Reason (optional)', 'aria-label': 'Reason' });
  const add = h('button', { className: 'btn secondary', type: 'button', textContent: 'Add day off', onclick: async () => {
    try {
      const r = await api(`${A}/team/${b.id}/timeoff`, { date: date.value, reason: reason.value });
      b.timeoff = [...b.timeoff, { id: r.id, date: date.value, reason: reason.value }].sort((x, y) => x.date.localeCompare(y.date)); draw(); date.value = reason.value = '';
      say(msg, !r.booked, r.booked ? `Added, but ${r.booked} appointment(s) already booked that day were not cancelled. Move them in Appointments.` : 'Added.');
    } catch (err) { say(msg, false, err.message); }
  } });
  return h('div', { className: 'stack' }, list, h('div', { className: 'grid2' }, date, reason), h('div', { className: 'actions' }, add), msg);
}
async function team() {
  const { team: list } = await api(`${A}/team`);
  const cards = list.map(b => {
    const photo = h('img', { className: 'thumb', src: b.photo || '', alt: `Photo of ${b.name}`, hidden: !b.photo });
    const removePhoto = h('button', { className: 'linkbtn danger', type: 'button', textContent: 'Remove photo', hidden: !b.photo, onclick: async () => { await api(`${A}/team/${b.id}/photo`, null, 'DELETE'); photo.hidden = removePhoto.hidden = true; } });
    const login = OWNER ? h('div', {}, h('h3', { textContent: 'Sign-in for this barber' }), h('p', { className: 'hint', textContent: 'With a login they can manage their own profile, schedule, photos and appointments.' }),
      editor({ saveText: 'Save login', fields: [{ name: 'email', label: 'Sign-in email', type: 'email', value: b.login_email }, { name: 'password', label: b.login_email ? 'New password (leave empty to keep the current one)' : 'Password (at least 10 characters)', type: 'password', attrs: { autocomplete: 'new-password' } }],
        onSave: v => api(`${A}/team/${b.id}/login`, v, 'PUT') })) : '';
    return h('details', { open: !OWNER }, h('summary', {}, b.name, h('small', { textContent: `${b.role || ''}${b.active ? '' : ' (hidden)'}` })),
      h('div', { className: 'body stack' },
        h('h3', { textContent: 'Profile' }),
        editor({ fields: [
          { name: 'name', label: 'Name', value: b.name, half: true }, { name: 'role', label: 'Title', value: b.role || '', half: true },
          { name: 'bio', label: 'About this barber', type: 'textarea', rows: 5, value: b.bio || '', hint: 'Shown over their photo on the site.' },
          { name: 'email', label: 'Email for booking notifications', type: 'email', value: b.email || '' },
          ...(OWNER ? [{ name: 'active', label: 'Show on the site and allow booking', type: 'checkbox', value: b.active }] : [])],
          onSave: v => api(`${A}/team/${b.id}`, v, 'PUT') }),
        h('h3', { textContent: 'Photo' }), photo, removePhoto,
        uploader('Upload photo', `${A}/team/${b.id}/photo`, r => { photo.src = r.url; photo.hidden = removePhoto.hidden = false; }),
        h('h3', { textContent: 'Weekly schedule (when clients can book)' }), hoursEditor(b),
        h('h3', { textContent: 'Days off' }), timeOff(b), login));
  });
  const add = OWNER ? h('details', {}, h('summary', { textContent: 'Add a team member' }), h('div', { className: 'body' },
    editor({ saveText: 'Add', fields: [{ name: 'name', label: 'Name', value: '' }, { name: 'role', label: 'Title', value: '' }], onSave: async v => { await api(`${A}/team`, v); team(); } }))) : '';
  panel.replaceChildren(h('h1', { textContent: OWNER ? 'Team' : 'My profile' }), ...cards, add);
}

// ---- Reviews ----
async function reviews() {
  const { testimonials: list } = await api(`${A}/testimonials`);
  const fieldsFor = t => [
    { name: 'name', label: 'Client name', value: t.name || '', half: true }, { name: 'label', label: 'Line under the name (city, etc.)', value: t.label || '', half: true },
    { name: 'quote', label: 'Review', type: 'textarea', rows: 4, value: t.quote || '' },
    { name: 'sort', label: 'Order (1 comes first)', type: 'number', value: t.sort ?? 0, attrs: { min: 0 } },
    { name: 'active', label: 'Show on the site', type: 'checkbox', value: t.active ?? 1 }];
  panel.replaceChildren(h('h1', { textContent: 'Client reviews' }),
    h('p', { className: 'hint', textContent: 'The sample reviews are placeholders. Replace them with real ones, with your clients\' permission.' }),
    ...list.map(t => h('details', {}, h('summary', {}, t.name, h('small', { textContent: t.active ? '' : 'hidden' })),
      h('div', { className: 'body' }, editor({ fields: fieldsFor(t), onSave: v => api(`${A}/testimonials/${t.id}`, v, 'PUT'), onDelete: async () => { await api(`${A}/testimonials/${t.id}`, null, 'DELETE'); reviews(); } })))),
    h('details', {}, h('summary', { textContent: 'Add a review' }), h('div', { className: 'body' }, editor({ fields: fieldsFor({}), saveText: 'Add review', onSave: async v => { await api(`${A}/testimonials`, v); reviews(); } }))));
}

// ---- Gallery ----
async function gallery() {
  const [{ photos }, teamData] = await Promise.all([api(`${A}/gallery`), OWNER ? api(`${A}/team`) : { team: [] }]);
  const tag = h('input', { placeholder: 'Skin fade, beard line-up' }), caption = h('input', { placeholder: 'Describe the photo for screen readers' });
  const barber = OWNER ? h('select', {}, h('option', { value: '', textContent: 'No barber' }), ...teamData.team.map(b => h('option', { value: b.id, textContent: b.name }))) : null;
  const up = uploader('Add photo', `${A}/gallery`, () => gallery(), { tag: () => tag.value, caption: () => caption.value, barber_id: () => barber?.value || '' });
  panel.replaceChildren(h('h1', { textContent: 'Gallery' }),
    h('p', { className: 'hint', textContent: 'Photos of finished cuts. The gallery section appears on the site once there is at least one photo.' }),
    h('div', { className: 'card stack' }, h('h3', { textContent: 'Add a photo' }), ...(barber ? [h('label', {}, 'Barber', barber)] : []),
      h('label', {}, 'What it shows', tag), h('label', {}, 'Description', caption), up),
    h('div', { className: 'photos' }, ...photos.map(p => h('div', { className: 'card' }, h('img', { src: p.url, alt: p.caption || p.tag || 'Gallery photo', loading: 'lazy' }),
      editor({ fields: [{ name: 'tag', label: 'What it shows', value: p.tag || '' }, { name: 'caption', label: 'Description', value: p.caption || '' }],
        onSave: v => api(`${A}/gallery/${p.id}`, v, 'PUT'), onDelete: async () => { await api(`${A}/gallery/${p.id}`, null, 'DELETE'); gallery(); } })))));
}

// ---- Messages ----
async function messages() {
  const { messages: list } = await api(`${A}/messages`);
  panel.replaceChildren(h('h1', { textContent: 'Messages' }), ...(list.length ? list.map(m => h('div', { className: 'msgrow' },
    h('strong', { textContent: m.name }), ' ', h('a', { href: 'tel:' + m.phone, textContent: m.phone }), ' ', h('small', { className: 'hint', textContent: m.created_at + ' UTC' }), ' ',
    h('button', { className: 'linkbtn danger', type: 'button', textContent: 'Delete', onclick: async () => { await api(`${A}/messages/${m.id}`, null, 'DELETE'); messages(); } }),
    h('p', { textContent: m.message }))) : [h('p', { textContent: 'No messages yet.' })]));
}

// ---- Tabs ----
const TABS = OWNER
  ? [['appointments', 'Appointments', appointments], ['site', 'Site text', site], ['images', 'Images', images], ['services', 'Services', services], ['team', 'Team', team], ['reviews', 'Reviews', reviews], ['gallery', 'Gallery', gallery], ['messages', 'Messages', messages]]
  : [['appointments', 'Appointments', appointments], ['team', 'My profile', team], ['gallery', 'Gallery', gallery]];
const tabs = $('#tabs');
async function show() {
  const id = location.hash.slice(1) || 'appointments';
  const t = TABS.find(x => x[0] === id) || TABS[0];
  tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === t[0])));
  panel.replaceChildren(h('p', { className: 'hint', textContent: 'Loading...' }));
  try { await t[2](); } catch (err) { panel.replaceChildren(h('p', { className: 'msg', textContent: err.message })); }
}
tabs.replaceChildren(...TABS.map(([id, label]) => { const b = h('button', { type: 'button', textContent: label, onclick: () => { location.hash = id; } }); b.dataset.id = id; return b; }));
addEventListener('hashchange', show);
show();

// ---- Header actions ----
$('#logout').onclick = async () => { await api(`${A}/logout`, {}); location.href = '/admin/login'; };
$('#pw').onclick = () => {
  const dlg = h('dialog');
  const form = editor({ saveText: 'Change password', fields: [
    { name: 'current', label: 'Current password', type: 'password', attrs: { autocomplete: 'current-password' } },
    { name: 'next', label: 'New password (at least 10 characters)', type: 'password', attrs: { autocomplete: 'new-password' } }],
    onSave: async v => { await api(`${A}/password`, v); setTimeout(() => dlg.close(), 800); } });
  dlg.append(h('h2', { textContent: 'Change password' }), form, h('p', {}, h('button', { className: 'linkbtn', type: 'button', textContent: 'Close', onclick: () => dlg.close() })));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg); dlg.showModal();
};
}
