const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const path = require('path');
require('./db');
const views = require('./views');

if (!process.env.SESSION_SECRET) { console.error('Set SESSION_SECRET in .env'); process.exit(1); }

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'upgrade-insecure-requests': null,
      'frame-src': ["'self'", 'https://www.openstreetmap.org'],              // map on the contact section
      'connect-src': ["'self'", 'https://nominatim.openstreetmap.org'],      // "Find on map" in the admin
    },
  },
}));
app.use(express.json({ limit: '50kb' }));
app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600 * 1000 },
}));


app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), { maxAge: '30d', immutable: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.use('/admin', require('./routes/admin'));
app.use(require('./routes/public'));

app.use((req, res) => res.status(404).send(views.notFound()));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.name === 'MulterError') return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large (10 MB maximum).' : 'Upload failed.' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
