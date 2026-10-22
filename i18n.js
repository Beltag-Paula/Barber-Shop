// Languages, translated interface text, and European date/time formatting (server side).
// English and Romanian. The default language lives at the site root; the other one under /ro or /en.
const LANGS = ['en', 'ro'];
const DEFAULT_LANG = LANGS.includes(process.env.DEFAULT_LANG) ? process.env.DEFAULT_LANG : 'en';
const LOCALE = { en: 'en-GB', ro: 'ro-RO' };

const prefix = lang => (lang === DEFAULT_LANG ? '' : `/${lang}`);
const normLang = l => (LANGS.includes(l) ? l : DEFAULT_LANG);

// Content stored with an English column and a Romanian one (name, name_ro). Falls back to English when empty.
const pick = (row, field, lang) => (lang !== 'en' && row[`${field}_${lang}`]) || row[field] || '';

const pad = n => String(n).padStart(2, '0');
const parseDate = s => new Date(`${s}T00:00:00Z`); // calendar dates carry no time zone, so they are read and shown as UTC
// 14/10/2026 in English (UK style) and 14.10.2026 in Romanian.
const fmtDate = (s, lang) => new Intl.DateTimeFormat(LOCALE[lang], { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseDate(s));
const fmtLong = (s, lang) => new Intl.DateTimeFormat(LOCALE[lang], { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseDate(s));
const fmtTime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; // always 24 hour
const minutes = m => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);

const T = {
  en: {
    skip: 'Skip to content', menu: 'Menu', langLabel: 'Language',
    nav_home: 'Home', nav_services: 'Services', nav_about: 'About', nav_price: 'Prices', nav_team: 'Team', nav_gallery: 'Gallery', nav_testimonial: 'Reviews', nav_contact: 'Contact',
    bookNow: 'Book now', exploreMore: 'Explore more', openMaps: 'Open in Google Maps', bookWith: 'Book with {name}', all: 'All', filterBarber: 'Filter by barber', haircutAlt: 'Haircut',
    close: 'Close', prevPhoto: 'Previous photo', nextPhoto: 'Next photo', openPhoto: 'View photo',
    reviewsLabel: 'Client reviews', prevReview: 'Previous review', nextReview: 'Next review',
    fullName: 'Full name', phone: 'Phone', phonePh: 'Phone number', email: 'Email', message: 'Your message', name: 'Name', send: 'Send message',
    consentContact: 'I agree that my details are used to reply to this message. See the {link}.',
    consentBook: 'I agree that my details are used to manage this appointment. See the {link}.',
    privacy: 'Privacy policy', iconsBy: 'Icons by {link}',
    sent: 'Message sent. We will call or text you back.',
    bookTitle: 'Book an appointment', service: 'Service', barber: 'Barber', anyone: 'Anyone available', date: 'Date', time: 'Time', chooseDateHint: 'Choose a date to see free times.', confirm: 'Confirm booking',
    noTimes: 'No times free on this day. Try another date.', pickDateTime: 'Choose a date and a time.', pickNewTime: 'Choose a new time.',
    yourAppt: 'Your appointment', apptCancelled: 'Appointment cancelled', whenLbl: 'When', cancelledText: 'This appointment was cancelled.', bookNew: 'Book a new time',
    locked: 'Online changes close 2 hours before the appointment. To change it now, call {phone}.',
    moveTitle: 'Move to another time', newDate: 'New date', move: 'Move appointment', cancel: 'Cancel appointment', confirmCancel: 'Cancel this appointment?',
    notFound: 'Page not found', backHome: 'Back to the home page', prevMonth: 'Previous month', nextMonth: 'Next month',
    madeBy: 'Created by PumaBytes (alias Paula Beltag)',
    slotBooked: 'Already booked', slotPast: 'Time has passed', slotOff: 'Not available', dayFull: 'No free times this day',
    errPast: 'That date has already passed. Choose today or a later date.',
    errName: 'Enter your name.', errPhone: 'Enter a valid phone number.', errEmail: 'Enter a valid email address. Your confirmation is sent there.',
    errDateTime: 'Choose a date and a time.', errTaken: 'That time is no longer available. Choose another.', errConsent: 'Please tick the box to agree to the privacy policy.',
    errMsg: 'Enter your name and a message.', errNotFound: 'Appointment not found.', errLocked: 'Online changes close 2 hours before. Call {phone}.', errGeneric: 'Something went wrong. Try again.',
    mConfirmed: 'Appointment confirmed', mMoved: 'Appointment moved', mCancelled: 'Appointment cancelled', mLink: 'Change or cancel: {link}', mWith: '{service} with {barber}', mClient: 'Client',
  },
  ro: {
    skip: 'Sari la conținut', menu: 'Meniu', langLabel: 'Limbă',
    nav_home: 'Acasă', nav_services: 'Servicii', nav_about: 'Despre noi', nav_price: 'Prețuri', nav_team: 'Echipa', nav_gallery: 'Galerie', nav_testimonial: 'Recenzii', nav_contact: 'Contact',
    bookNow: 'Programează-te', exploreMore: 'Descoperă mai mult', openMaps: 'Deschide în Google Maps', bookWith: 'Programare la {name}', all: 'Toate', filterBarber: 'Filtrează după frizer', haircutAlt: 'Tuns',
    close: 'Închide', prevPhoto: 'Fotografia anterioară', nextPhoto: 'Fotografia următoare', openPhoto: 'Vezi fotografia',
    reviewsLabel: 'Recenzii ale clienților', prevReview: 'Recenzia anterioară', nextReview: 'Recenzia următoare',
    fullName: 'Nume complet', phone: 'Telefon', phonePh: 'Număr de telefon', email: 'E-mail', message: 'Mesajul tău', name: 'Nume', send: 'Trimite mesajul',
    consentContact: 'Sunt de acord ca datele mele să fie folosite pentru a răspunde acestui mesaj. Vezi {link}.',
    consentBook: 'Sunt de acord ca datele mele să fie folosite pentru gestionarea acestei programări. Vezi {link}.',
    privacy: 'Politica de confidențialitate', iconsBy: 'Iconițe de la {link}',
    sent: 'Mesaj trimis. Te vom suna sau îți vom scrie în curând.',
    bookTitle: 'Fă o programare', service: 'Serviciu', barber: 'Frizer', anyone: 'Oricine este liber', date: 'Data', time: 'Ora', chooseDateHint: 'Alege o dată pentru a vedea orele libere.', confirm: 'Confirmă programarea',
    noTimes: 'Nu sunt ore libere în această zi. Încearcă altă dată.', pickDateTime: 'Alege o dată și o oră.', pickNewTime: 'Alege o oră nouă.',
    yourAppt: 'Programarea ta', apptCancelled: 'Programare anulată', whenLbl: 'Când', cancelledText: 'Această programare a fost anulată.', bookNew: 'Programează o nouă oră',
    locked: 'Modificările online se închid cu 2 ore înainte de programare. Pentru a o schimba acum, sună la {phone}.',
    moveTitle: 'Mută la altă oră', newDate: 'Data nouă', move: 'Mută programarea', cancel: 'Anulează programarea', confirmCancel: 'Anulezi această programare?',
    notFound: 'Pagina nu a fost găsită', backHome: 'Înapoi la pagina principală', prevMonth: 'Luna anterioară', nextMonth: 'Luna următoare',
    madeBy: 'Creat de PumaBytes (alias Paula Beltag)',
    slotBooked: 'Ocupat', slotPast: 'Ora a trecut', slotOff: 'Indisponibil', dayFull: 'Nicio oră liberă în această zi',
    errPast: 'Data aleasă a trecut deja. Alege ziua de azi sau una ulterioară.',
    errName: 'Introdu numele tău.', errPhone: 'Introdu un număr de telefon valid.', errEmail: 'Introdu o adresă de e-mail validă. Confirmarea este trimisă acolo.',
    errDateTime: 'Alege o dată și o oră.', errTaken: 'Ora aleasă nu mai este disponibilă. Alege alta.', errConsent: 'Bifează căsuța pentru a fi de acord cu politica de confidențialitate.',
    errMsg: 'Introdu numele și un mesaj.', errNotFound: 'Programarea nu a fost găsită.', errLocked: 'Modificările online se închid cu 2 ore înainte. Sună la {phone}.', errGeneric: 'Ceva nu a mers bine. Încearcă din nou.',
    mConfirmed: 'Programare confirmată', mMoved: 'Programare mutată', mCancelled: 'Programare anulată', mLink: 'Modifică sau anulează: {link}', mWith: '{service} cu {barber}', mClient: 'Client',
  },
};

const t = (lang, key, vars = {}) => String(T[lang]?.[key] ?? T.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

// The strings the browser scripts need, sent as JSON in the page.
const CLIENT_KEYS = ['slotBooked', 'slotPast', 'slotOff', 'dayFull', 'noTimes', 'pickDateTime', 'pickNewTime', 'sent', 'confirmCancel', 'errGeneric', 'prevMonth', 'nextMonth', 'chooseDateHint'];
const clientStrings = lang => Object.fromEntries(CLIENT_KEYS.map(k => [k, t(lang, k)]));

module.exports = { LANGS, DEFAULT_LANG, LOCALE, prefix, normLang, pick, fmtDate, fmtLong, fmtTime, minutes, t, clientStrings };
