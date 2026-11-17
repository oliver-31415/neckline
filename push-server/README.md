# Neckline reminder server (optional)

A ~120-line Node server that sends "time for a check-in" notifications to your
iPhone at the times you set in **Settings → Check-in times**.

**What it stores:** a Web Push address for your phone, your check-in times
(e.g. `09:00`), and your time zone. That's all. It never receives diary entries.
Pushes travel through Apple's push service and are end-to-end encrypted. Each
one only says it's time for a check-in.

## Run it

```bash
cd push-server
npm install
VAPID_SUBJECT=mailto:you@example.com ACCESS_TOKEN=$(openssl rand -hex 16) npm start
```

On first start it creates `data/vapid.json` (your push keys). Keep it, because
changing the keys means re-enabling reminders on the phone. `data/` is
git-ignored.

| env | default | meaning |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | where it listens |
| `ACCESS_TOKEN` | *(none)* | if set, the app must send it (Settings → Reminders → Access token) |
| `ALLOWED_ORIGIN` | `*` | set to your app's origin, e.g. `https://you.github.io` |
| `VAPID_SUBJECT` | `mailto:reminders@example.com` | Apple wants a real `mailto:` or `https:` contact |
| `DATA_DIR` | `./data/` | where keys and subscriptions live |

## Give it an HTTPS address

The app is served over HTTPS, so the phone can only talk to an HTTPS server.
Pick one:

- **Tailscale Funnel** (simplest if you use Tailscale): `tailscale funnel --bg 8787`
  gives you `https://<machine>.<tailnet>.ts.net`.
- **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:8787`
  (use a named tunnel for a stable URL).
- **A VPS with Caddy**: `reminders.example.com { reverse_proxy localhost:8787 }`.

The machine has to be on for reminders to arrive. The diary itself works fully
offline either way.

## Keep it running (systemd user service)

```ini
# ~/.config/systemd/user/neckline-push.service
[Unit]
Description=Neckline reminders
[Service]
WorkingDirectory=%h/Projects/neckline/push-server
Environment=VAPID_SUBJECT=mailto:you@example.com
Environment=ACCESS_TOKEN=change-me
Environment=ALLOWED_ORIGIN=https://you.github.io
ExecStart=/usr/bin/node server.mjs
Restart=on-failure
[Install]
WantedBy=default.target
```

`systemctl --user enable --now neckline-push && loginctl enable-linger $USER`

## On the iPhone

1. Open Neckline **from its Home Screen icon** (iOS 16.4+; Safari tabs can't get push).
2. Settings → Reminders: paste the server address and token, then switch it on and allow notifications.
3. Tap **Send a test reminder**.

Tapping a reminder opens Neckline straight into that check-in.
