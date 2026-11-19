# Neckline backup server (optional)

A single-file Node server with no dependencies. It keeps encrypted backups of the diary for the
users you create, and runs next to the reminder server (default port `8788`, reminders use `8787`).

**What it can see:** a user name, and for each backup its time and size. It can't read the
backups. The phone encrypts every backup (AES-256-GCM) with a key made from the password before
uploading it. Neither that key nor the password is ever sent. To sign in, the phone sends a
separate key derived from the password. The server stores only a salted scrypt hash of that key,
so its own files can't be used to sign in either.

**If the password is lost, the backups can't be opened by anyone.** Keep it in a password manager.

## Set up

```bash
cd backup-server
node server.mjs add-user oliver      # asks for a password (10+ characters)
ALLOWED_ORIGIN=https://you.github.io npm start
```

| command | does |
| --- | --- |
| `node server.mjs add-user <name>` | create a user (a–z, 0–9, `-`, `_`) |
| `node server.mjs remove-user <name>` | delete the user and all their backups |
| `node server.mjs users` | list users, backup counts and latest backup |
| `node server.mjs` | run the server |

To change a password, back up the phone first, then remove the user, add them again and sign in on
the phone again. Older backups were encrypted with the old password, so removing the user deletes them.

| env | default | meaning |
| --- | --- | --- |
| `PORT` / `HOST` | `8788` / `127.0.0.1` | where it listens |
| `ALLOWED_ORIGIN` | `*` | set to your app's origin, e.g. `https://you.github.io` |
| `DATA_DIR` | `./data/` | users and backups (git-ignored, `0700`/`0600`) |
| `MAX_MB` | `100` | largest backup accepted |
| `TRUST_PROXY` | *(off)* | set to `1` behind a tunnel or proxy, so lockouts use the visitor's address from `X-Forwarded-For` |

## Security

- Every request except `/health` needs a valid sign-in. Uploads must also look like a Neckline
  backup.
- After 5 wrong passwords, that user is locked for 15 minutes from that address. More than 30
  failures a minute across all users locks all sign-ins for a minute.
- Without `TRUST_PROXY`, everything arriving through a tunnel shares one address. Wrong guesses by
  someone else could then lock you out for 15 minutes, but they can't get in.
- Run it behind HTTPS (below). The phone refuses plain HTTP from the hosted app anyway.

## What's kept

The phone backs up a few seconds after anything changes, when the app is opened if something changed,
and on demand. The server keeps:

- the latest 10 backups;
- the last backup of each day for 60 days;
- the last backup of each month, indefinitely.

Backups are named by time in `data/users/<name>/`. Copying `data/` somewhere else is a backup
of the backups.

## Give it an HTTPS address

The same options as the reminder server:

- **Tailscale Funnel**: `tailscale funnel --bg --https=8443 8788` gives
  `https://<machine>.<tailnet>.ts.net:8443` (reminders keep 443).
- **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:8788`.
- **Caddy**: `backup.example.com { reverse_proxy localhost:8788 }`.

## Keep it running (systemd user service)

```ini
# ~/.config/systemd/user/neckline-backup.service
[Unit]
Description=Neckline backups
[Service]
WorkingDirectory=%h/Projects/neckline/backup-server
Environment=ALLOWED_ORIGIN=https://you.github.io
Environment=TRUST_PROXY=1
ExecStart=/usr/bin/node server.mjs
Restart=on-failure
[Install]
WantedBy=default.target
```

`systemctl --user enable --now neckline-backup` (alongside `neckline-push`).

## On the iPhone

Settings → **Backup server**: enter the address, user name and password, then tap **Sign in**. If the phone is empty and the server already has a backup, it offers to restore it, which is how you
move to a new phone. Otherwise it backs up straight away and then automatically.
**Restore from server** lists the saved backups. Restoring merges entries in and never deletes any.
