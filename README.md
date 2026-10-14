# Razor barber shop (first draft)

The Razor one-page design rebuilt in plain HTML, CSS and JavaScript (no Bootstrap, jQuery or icon fonts),
with an Express + SQLite (Node's built-in node:sqlite) back end: online booking and a content admin where the owner edits the site.

## Run

Needs Node 22.13 or newer (check with `node -v`). Nothing is compiled during `npm install`.
Keep the project in a folder whose path has no spaces or brackets.

    npm install
    cp .env.example .env     # set SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
    npm run dev

Site: http://localhost:3000   Admin: http://localhost:3000/admin
The owner login is created from ADMIN_EMAIL / ADMIN_PASSWORD on first start (change the password in the admin afterwards).
Without SMTP_HOST set, emails are printed to the terminal. `sharp` is optional: with it, uploads are resized
and converted to WebP automatically; without it, files are stored as uploaded.

## What the admin can edit (/admin)

- Appointments: day view per barber, reschedule or cancel (the customer is emailed).
- Site text: headline, about story, section headings, phone, email, opening hours, social links.
- Location: address plus map. "Find the address on the map" fills in coordinates; the map shows on the contact section.
- Images: replace the hero, services, about, prices and testimonials backgrounds, or go back to the originals.
- Services: name, description, price, duration, icon, order, which barbers offer it, show or hide.
- Team: bio, title, photo, weekly schedule (drives booking times), days off, and a sign-in for each barber.
- Reviews, Gallery (uploaded photos, filterable by barber on the site), Messages from the contact form.

A barber account sees only Appointments, My profile and Gallery, limited to their own.

## Files

    server.js          app setup and security headers
    db.js              schema and starter data
    content.js         default texts, editable fields, image slots, map helpers
    views.js           the pages (home, book, manage, admin shells)
    routes/            public.js (site and booking API), admin.js (admin API)
    lib/               availability, booking, mail, images
    public/css/site.css, public/js/site.js     the front end
    public/css/admin.css, public/js/admin.js   the admin

## Credits and licences

The layout, photos in public/img and the service icons come from the Razor template you supplied.
Check its licence before publishing, and replace the stock photos with your own (Admin, Images).
The icons are from a Flaticon pack and need the attribution link in the footer.

## Not done yet

- Persistent session store, backups of the .db file, reminder emails, Google Calendar sync.
