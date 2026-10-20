const nodemailer = require('nodemailer');

const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: +(process.env.SMTP_PORT || 587),
      secure: +process.env.SMTP_PORT === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

// Fire and forget: a mail failure must never break a booking.
async function send(to, subject, text) {
  if (!to) return;
  if (!transport) { console.log(`\n[mail] to: ${to}\n[mail] ${subject}\n${text}\n`); return; }
  try { await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text }); }
  catch (e) { console.error('Mail failed:', e.message); }
}

module.exports = { send };
