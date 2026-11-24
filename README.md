# Neckline

A private, offline neck-pain diary for iPhone, built as a Progressive Web App.
It records how post-surgical neck pain changes over time alongside posture,
activities, food, sleep and treatments, and helps you prepare for appointments.
It doesn't diagnose anything.

- **Local only.** Entries and meal photos live in the phone's IndexedDB, and
  the app asks the browser to keep them permanently (persistent storage). No
  analytics, and no network calls apart from one optional server you run
  yourself. It sends check-in reminders, knowing only your times, and keeps
  encrypted backups it can't read.
- **Opens on the check-in.** One overall pain slider, a body diagram you tap,
  and a slider for each marked area. Everything else (what it feels like,
  duration, impact, symptoms, what you were doing, a note) sits in optional rows
  underneath. A "Pain changed" switch logs changes as they happen. History,
  Insights and Report each have their own tab. "Not sure" is always an option,
  and skipped check-ins are simply skipped.
- **Body diagram.** Back and front views of the neck and upper back (spine
  C1–T7, shoulder blades) and the right arm down to individual fingers. Each
  marked area has its own 0–10 level and one or more types: ache, sharp nerve
  pain, tingling, cramping, stiffness. Headache, migraine and other symptoms
  are logged separately.
- **Since your last check-in.** Optional posture (held for how long),
  medication (dose, when) and exercise (how long, hold time) entries.
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

## Reminders and backups (optional)

See [`server/README.md`](server/README.md).

## Backups

Settings → Your data → **Save a backup file** (optionally with photos). If the
Home Screen app is deleted, its data goes with it, so back up now and then.
