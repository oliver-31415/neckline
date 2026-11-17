# Neckline

A private, offline neck-pain diary for iPhone, built as a Progressive Web App.
It records how post-surgical neck pain changes over time alongside posture,
activities, food, sleep and treatments, and helps you prepare for appointments.
It doesn't diagnose anything.

- **Local only.** Entries and meal photos live in the phone's IndexedDB. No
  accounts, no analytics and no network calls, apart from the optional
  reminder server, which only knows your check-in times.
- **Quick logging.** Scheduled check-ins, a one-tap "Pain changed" log, and
  context logs for posture, activity, food, treatment and sleep. Every field
  is optional, "Not sure" is always an option, and missed check-ins are simply
  skipped.
- **Body map.** Front and back views with your incision site. Mark pain,
  tingling or numbness in the neck, shoulders, arms and three zones of each hand.
- **Careful patterns.** A 24-hour timeline for each day with lanes for pain and
  context. Comparisons across time windows (same time, 0–3 h, 0–6 h, 0–24 h,
  next day) always show how many entries back them up, and they're worded as
  co-occurrence, never cause. Treatments are compared before vs after.
- **For the clinician.** A concise PDF (charts, body heat map, treatments,
  co-occurrence table, your questions, notes, an optional log appendix) and a
  CSV, both shared through the iOS share sheet. There's also a JSON backup and
  restore.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # → dist/ (static; includes an offline service worker)
npm run typecheck
npm run icons        # re-render PNG icons from public/icons/icon.svg
npx vite preview --port 4173 & npm run shots   # headless iPhone screenshots + sample PDF/CSV
```

## Put it on your phone

`dist/` is plain static files, so any HTTPS static host works. The app uses
relative paths, so it also runs from a sub-path.

**GitHub Pages:** push this repo to GitHub, then go to Settings → Pages →
Source: *GitHub Actions*. `.github/workflows/pages.yml` builds and deploys on
every push to `main`. The hosted files are only the app's code. Your diary
never leaves the phone.

On the iPhone: open the URL in Safari → Share → **Add to Home Screen**, and
always open it from that icon. A Home Screen app has its own storage, separate
from Safari tabs.

## Reminders (optional)

See [`push-server/README.md`](push-server/README.md).

## Backups

Settings → Your data → **Save a backup file** (optionally with photos). If the
Home Screen app is deleted, its data goes with it, so back up now and then.
