# Neckline server (optional)

One small Node server for the users you create, at one address. It provides two things:

| path | what |
| --- | --- |
| `/backup` | encrypted backups of the diary |
| `/reminders/…` | "time for a check-in" notifications at your check-in times |
| `/health` | prints `ok` |

Both need the same sign-in (user name and password), apart from `/health` and the reminders'
public key.

**Backups are encrypted on the phone.** The phone encrypts each backup (AES-256-GCM) with a key
made from the password, and neither that key nor the password is ever sent. To sign in, the phone
sends a separate key derived from the password, and the server keeps only a salted scrypt hash of
that. The server can see user names and the time and size of each backup, but not what's in them.
**If a password is lost, that user's backups can't be opened by anyone.**

**Reminders.** The server knows each phone's push address, check-in times and time zone. Each push
only says it's time for a check-in. Pushes go through Apple's push service, end-to-end encrypted.

## Set up

```bash
cd server
npm install
node server.mjs add-user oliver      # asks for a password (10+ characters)
ALLOWED_ORIGIN=https://you.github.io npm start
```

| command | does |
| --- | --- |
| `node server.mjs add-user <name>` | create a user (a–z, 0–9, `-`, `_`) |
| `node server.mjs remove-user <name>` | delete the user, their backups and their reminders |
| `node server.mjs users` | list users, backups and phones with reminders |
| `node server.mjs` | run the server |

The running server picks up added and removed users straight away. To change a password, back up
the phone first, then remove the user and add them again, and sign in on the phone again. Older
backups were encrypted with the old password, so removing the user deletes them.

| env | default | meaning |
| --- | --- | --- |
| `PORT` / `HOST` | `8788` / `127.0.0.1` | where it listens |
| `ALLOWED_ORIGIN` | `*` | the app's origin, e.g. `https://you.github.io` |
| `DATA_DIR` | `./data/` | users, backups, push keys (git-ignored, `0700`/`0600`) |
| `MAX_MB` | `100` | largest backup accepted |
| `VAPID_SUBJECT` | `mailto:reminders@example.com` | contact Apple wants for push: a `mailto:` or `https:` URL |
| `TRUST_PROXY` | *(off)* | set to `1` behind a tunnel or proxy, so lockouts use the visitor's address |

`data/vapid.json` holds the push keys. Keep it: new keys mean switching reminders off and on again
on each phone.

## Security

- **Lockouts:** after 5 wrong passwords, that user is locked for 15 minutes from that address.
  More than 30 failures a minute across all users locks all sign-ins for a minute.
- **Uploads:** they must look like a Neckline backup, and a user can only read their own backups.
- **Reminders:** a phone can only change or test its own reminders.
- **HTTPS:** run it behind HTTPS (below). The hosted app can't talk to plain HTTP anyway.

## What's kept

The phone backs up a few seconds after anything changes, when the app opens if something changed,
and on demand. The server keeps:

- the latest 10 backups;
- the last backup of each day for 60 days;
- the last backup of each month, indefinitely.

## Give it an HTTPS address (Cloudflare Tunnel)

1. `sudo pacman -S cloudflared` (or your system's package).
2. Cloudflare dashboard: **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**.
   Copy the token.
3. `sudo cloudflared service install <TOKEN>`
4. In the tunnel, open **Public Hostname** and add `neckline` · `your-domain` → `HTTP` · `localhost:8788`.
5. `curl https://neckline.your-domain/health` prints `ok`.

Tailscale Funnel (`tailscale funnel --bg 8788`) or Caddy (`reverse_proxy localhost:8788`) work too.

## Keep it running (systemd user service)

```ini
# ~/.config/systemd/user/neckline.service
[Unit]
Description=Neckline server (backups and reminders)
After=network-online.target
[Service]
WorkingDirectory=%h/Projects/neckline/server
Environment=ALLOWED_ORIGIN=https://you.github.io
Environment=TRUST_PROXY=1
Environment=VAPID_SUBJECT=https://neckline.your-domain
ExecStart=/usr/bin/node server.mjs
Restart=on-failure
[Install]
WantedBy=default.target
```

`systemctl --user enable --now neckline && loginctl enable-linger $USER`

## On the iPhone

1. Open Neckline **from its Home Screen icon**.
2. **Settings → Neckline server:** enter the address, user name and password, then **Sign in**.
   If the phone is empty and there's a backup, it offers to restore it (that's how you move to a
   new phone). Otherwise it backs up straight away, then automatically.
3. **Settings → Reminders:** switch on and allow notifications.
