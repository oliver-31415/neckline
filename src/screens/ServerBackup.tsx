import { useEffect, useState } from 'preact/hooks';
import { entries, settings, updateSettings } from '../lib/store';
import { disablePush } from '../lib/push';
import { backUpNow, cloudBusy, cloudError, listRemote, restoreRemote, signIn, signOut, signedIn, type RemoteBackup } from '../lib/cloud';
import { fmtDayRelative, fmtTime } from '../lib/time';
import { Block, Sheet, showToast } from '../components/ui';
import { MenuButton } from '../components/Menu';
import { ActionRow, NavRow, ToggleRow, ValueRow } from '../components/rows';

const when = (t: number) => `${fmtDayRelative(t)}, ${fmtTime(t)}`;
const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Your Neckline server: sign in once, then backups run by themselves and reminders can be switched on. */
export function ServerBackup() {
  const b = settings.value.backup;
  const on = signedIn();
  const [signingIn, setSigningIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [list, setList] = useState<RemoteBackup[]>([]);

  useEffect(() => {
    if (on) listRemote().then(setList).catch((e) => setErr(e.message));
  }, [on, b.lastAt]);

  async function run(job: () => Promise<unknown>) {
    setErr('');
    setBusy(true);
    try { await job(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const restore = (id: string) => run(async () => {
    const n = await restoreRemote(id, confirm('Also restore settings from the backup? (Cancel keeps your current settings.)'));
    showToast(`Restored ${n} entries`);
  });

  const shownErr = err || (on ? cloudError.value : '');
  return (
    <>
      <Block title="Backup" flush foot={shownErr ? <span style={{ color: 'var(--danger)' }}>{shownErr}</span> : undefined}>
        {!on ? (
          <NavRow label="Sign in" value={hostOf(b.serverUrl)} onClick={() => setSigningIn(true)} />
        ) : (
          <>
            <ValueRow label="Signed in as" value={b.user} />
            <ValueRow label="Last backup" value={cloudBusy.value ? 'Backing up…' : b.lastAt ? when(b.lastAt) : 'Not yet'} />
            <ToggleRow label="Back up automatically" checked={b.auto} onChange={(auto) => updateSettings({ backup: { ...settings.value.backup, auto } })} />
            <ActionRow label="Back up now" disabled={busy || cloudBusy.value} onClick={() => run(async () => { await backUpNow(true); showToast('Backed up'); })} />
            <MenuButton
              class="set-row tap action" label="Restore from server" value={[]}
              items={list.length ? list.map((r) => ({ v: r.id, label: `${when(r.at)} · ${size(r.size)}` })) : [{ v: '', label: 'No backups yet', action: true }]}
              onChange={([id]) => restore(id)}
            >
              <span>{busy ? 'Working…' : 'Restore from server…'}</span>
            </MenuButton>
            <ActionRow label="Sign out" danger onClick={() => confirm('Sign out on this phone? Backups already on the server stay there. Reminders stop.') && run(async () => {
              if (settings.value.push.enabled) { await disablePush().catch(() => {}); await updateSettings({ push: { enabled: false } }); }
              await signOut();
            })} />
          </>
        )}
      </Block>
      {signingIn && <SignInSheet onClose={() => setSigningIn(false)} />}
    </>
  );
}

const hostOf = (url: string) => { try { return new URL(url).host; } catch { return ''; } };

function SignInSheet({ onClose }: { onClose: () => void }) {
  const b = settings.value.backup;
  const [url, setUrl] = useState(b.serverUrl);
  const [user, setUser] = useState(b.user);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e?: Event) => {
    e?.preventDefault();
    if (busy || !url || !user || !pw) return;
    setErr('');
    setBusy(true);
    try {
      const found = await signIn(url, user, pw);
      setPw('');
      onClose();
      if (found.length && !entries.value.length && confirm(`Restore your backup from ${when(found[0].at)}?`)) {
        showToast(`Restored ${await restoreRemote(found[0].id, true)} entries`);
      } else {
        await backUpNow(true);
        showToast('Signed in and backed up');
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Sign in" onClose={onClose} action={{ label: busy ? 'Signing in…' : 'Sign in', onClick: () => submit(), disabled: busy || !url || !user || !pw }}>
      <form onSubmit={submit}>
        <Block flush foot={err ? <span style={{ color: 'var(--danger)' }}>{err}</span> : undefined}>
          <label class="trow"><span class="mrow-label">Server</span>
            <input class="trow-input" type="url" inputMode="url" autocapitalize="off" autocorrect="off" spellcheck={false} placeholder="https://" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
          </label>
          <label class="trow"><span class="mrow-label">User name</span>
            <input class="trow-input" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck={false} placeholder="Required" value={user} onInput={(e) => setUser((e.target as HTMLInputElement).value)} />
          </label>
          <label class="trow"><span class="mrow-label">Password</span>
            <input class="trow-input" type="password" autocomplete="current-password" placeholder="Required" value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} />
          </label>
        </Block>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
