const Database = require('./lib/sqlite');
const bcrypt = require('bcryptjs');

const db = new Database(process.env.DB_FILE || 'razor.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Dates are stored as shop-local 'YYYY-MM-DD' and times as minutes since midnight.
// One shop, one time zone (set TZ in .env), so no UTC conversion is needed.
// Image columns hold URL paths such as '/uploads/abc.webp'.
db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS barbers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT, bio TEXT, photo TEXT, email TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  duration_min INTEGER NOT NULL, price INTEGER NOT NULL,
  icon TEXT NOT NULL DEFAULT 'scissors', sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS barber_services (
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (barber_id, service_id)
);
CREATE TABLE IF NOT EXISTS working_hours (
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL, opens TEXT NOT NULL, closes TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS time_off (
  id INTEGER PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  date TEXT NOT NULL, start_min INTEGER NOT NULL DEFAULT 0, end_min INTEGER NOT NULL DEFAULT 1440, reason TEXT
);
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  date TEXT NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
  name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
  status TEXT NOT NULL DEFAULT 'booked',
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_slot
  ON appointments(barber_id, date, start_min) WHERE status = 'booked';
CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY,
  barber_id INTEGER REFERENCES barbers(id) ON DELETE SET NULL,
  url TEXT NOT NULL, caption TEXT, tag TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, label TEXT, quote TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  barber_id INTEGER REFERENCES barbers(id) ON DELETE SET NULL
);
`);

// Columns added for the Romanian translations and the customer's language. Safe to run on an existing database.
const addColumn = (table, col, def) => {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(r => r.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
};
addColumn('services', 'name_ro', 'TEXT');
addColumn('services', 'description_ro', 'TEXT');
addColumn('barbers', 'role_ro', 'TEXT');
addColumn('barbers', 'bio_ro', 'TEXT');
addColumn('testimonials', 'label_ro', 'TEXT');
addColumn('testimonials', 'quote_ro', 'TEXT');
addColumn('gallery', 'tag_ro', 'TEXT');
addColumn('gallery', 'caption_ro', 'TEXT');
addColumn('appointments', 'lang', "TEXT NOT NULL DEFAULT 'en'");
addColumn('appointments', 'price', 'INTEGER'); // price at the time of booking
addColumn('barbers', 'photo_pos', 'TEXT');   // focal point of a photo, like '50% 30%'
addColumn('gallery', 'pos', 'TEXT');

// Starter data so the site works on first run. Everything here is editable from /admin.
if (!db.prepare('SELECT 1 FROM barbers').get()) {
  db.transaction(() => {
    const addBarber = db.prepare('INSERT INTO barbers (name, role, bio, email) VALUES (?,?,?,?)');
    const addService = db.prepare('INSERT INTO services (name, description, duration_min, price, icon, sort) VALUES (?,?,?,?,?,?)');
    const link = db.prepare('INSERT INTO barber_services VALUES (?,?)');
    const hours = db.prepare('INSERT INTO working_hours VALUES (?,?,?,?)');
    const mail = process.env.ADMIN_EMAIL || null;
    const barbers = [
      addBarber.run('Barber One', 'Owner, classic cuts', 'Write two or three sentences about yourself: where you trained, how long you have been cutting, what you enjoy most.', mail).lastInsertRowid,
      addBarber.run('Barber Two', 'Fades and beards', 'Write two or three sentences about yourself.', mail).lastInsertRowid,
    ];
    const services = [
      addService.run('Haircut', 'Consultation, wash, scissor cut and style.', 45, 70, 'scissors', 1).lastInsertRowid,
      addService.run('Razor shave', 'Hot towel, lather and a straight-razor shave.', 30, 50, 'razor', 2).lastInsertRowid,
      addService.run('Beard trim', 'Shape, line-up and finish with beard oil.', 30, 40, 'brush', 3).lastInsertRowid,
      addService.run('Haircut and beard', 'Both, in one sitting.', 75, 100, 'clip', 4).lastInsertRowid,
    ];
    for (const b of barbers) {
      for (const s of services) link.run(b, s);
      for (const d of [2, 3, 4, 5, 6]) hours.run(b, d, '10:00', '19:00'); // Tuesday to Saturday
    }
    const addT = db.prepare('INSERT INTO testimonials (name, label, quote, sort) VALUES (?,?,?,?)');
    addT.run('Client name', 'City', 'Replace this with a real review from one of your clients. Short and specific works best.', 1);
    addT.run('Another client', 'City', 'A second review shows the carousel at work. Edit or delete these in the admin.', 2);
  })();
}

db.exec('UPDATE appointments SET price = (SELECT price FROM services WHERE services.id = appointments.service_id) WHERE price IS NULL');

// Romanian versions of the starter rows. Rows the owner has already edited are left alone.
db.transaction(() => {
  const svc = db.prepare('UPDATE services SET name_ro = ?, description_ro = ? WHERE name = ? AND description = ? AND name_ro IS NULL');
  svc.run('Tuns', 'Consultație, spălat, tuns cu foarfeca și aranjat.', 'Haircut', 'Consultation, wash, scissor cut and style.');
  svc.run('Bărbierit cu briciul', 'Prosop cald, spumă și bărbierit cu briciul drept.', 'Razor shave', 'Hot towel, lather and a straight-razor shave.');
  svc.run('Aranjat barbă', 'Modelare, contur și finisare cu ulei pentru barbă.', 'Beard trim', 'Shape, line-up and finish with beard oil.');
  svc.run('Tuns și barbă', 'Ambele, într-o singură ședință.', 'Haircut and beard', 'Both, in one sitting.');
  const bar = db.prepare('UPDATE barbers SET role_ro = ?, bio_ro = ? WHERE role = ? AND bio = ? AND role_ro IS NULL');
  bar.run('Proprietar, tunsori clasice', 'Scrie două sau trei propoziții despre tine: unde te-ai format, de cât timp tunzi, ce îți place cel mai mult.', 'Owner, classic cuts', 'Write two or three sentences about yourself: where you trained, how long you have been cutting, what you enjoy most.');
  bar.run('Fade-uri și barbă', 'Scrie două sau trei propoziții despre tine.', 'Fades and beards', 'Write two or three sentences about yourself.');
  const tm = db.prepare('UPDATE testimonials SET label_ro = ?, quote_ro = ? WHERE quote = ? AND quote_ro IS NULL');
  tm.run('Oraș', 'Înlocuiește această recenzie cu una reală de la unul dintre clienții tăi. Scurtă și concretă funcționează cel mai bine.', 'Replace this with a real review from one of your clients. Short and specific works best.');
  tm.run('Oraș', 'O a doua recenzie arată cum funcționează caruselul. Editează sau șterge recenziile din administrare.', 'A second review shows the carousel at work. Edit or delete these in the admin.');
})();

if (!db.prepare('SELECT 1 FROM admin_users').get() && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  db.prepare('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)')
    .run(process.env.ADMIN_EMAIL.toLowerCase(), bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12));
}

module.exports = db;
