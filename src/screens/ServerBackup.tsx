import { useEffect, useState } from 'preact/hooks';
import { entries, settings, updateSettings } from '../lib/store';
import { disablePush } from '../lib/push';
import { backUpNow, cloudBusy, cloudError, listRemote, restoreRemote, signIn, signOut, signedIn, type RemoteBackup } from '../lib/cloud';
import { fmtDayRelative, fmtTime } from '../lib/time';
import { Block, Toggle, showToast } from '../components/ui';
import { MenuButton } from '../components/Menu';
import { IconDownload, IconLock, IconUpload } from '../components/Icons';

const when = (t: number) => `${fmtDayRelative(t)}, ${fmtTime(t)}`;
const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Sign in to your Neckline server, then back up automatically and restore any saved copy. Reminders use the same sign-in. */
export function ServerBackup() {
  const b = settings.value.backup;
  const on = signedIn();
  const [url, setUrl] = useState(b.serverUrl);
  const [user, setUser] = useState(b.user);
  const [pw, setPw] = useState('');
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

  const submit = (e: Event) => {
    e.preventDefault();
    run(async () => {
      const found = await signIn(url, user, pw);
      setPw('');
      setList(found);
      if (found.length && !entries.value.length && confirm(`Restore your backup from ${when(found[0].at)}?`)) {
        showToast(`Restored ${await restoreRemote(found[0].id, true)} entries`);
      } else {
        await backUpNow(true);
        showToast('Backed up');
      }
    });
  };

  const restore = (id: string) => run(async () => {
    const n = await restoreRemote(id, confirm('Also restore settings from the backup? (Cancel keeps your current settings.)'));
    showToast(`Restored ${n} entries`);
  });

  if (!on) {
    return (
      <Block title="Neckline server">
        <form class="col-form" onSubmit={submit}>
          <label class="field"><span>Server address</span>
            <input class="input" type="url" inputMode="url" autocapitalize="off" autocorrect="off" spellcheck={false} placeholder="https://neckline.wright-guys.com" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field"><span>User name</span>
            <input class="input" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck={false} value={user} onInput={(e) => setUser((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field"><span>Password</span>
            <input class="input" type="password" autocomplete="current-password" value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} />
          </label>
          <button class="btn primary wide" disabled={busy || !url || !user || !pw}><IconLock /> {busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        {err && <div class="small" style={{ color: 'var(--danger)' }}>{err}</div>}
      </Block>
    );
  }

  const shownErr = err || cloudError.value;
  return (
    <Block title="Neckline server" aside={b.user}>
      <div class="row between">
        <span>Last backup</span>
        <span class="muted">{cloudBusy.value ? 'Backing up…' : b.lastAt ? when(b.lastAt) : 'Not yet'}</span>
      </div>
      <div class="row between">
        <span>Back up automatically</span>
        <Toggle checked={b.auto} label="Back up automatically" onChange={(auto) => updateSettings({ backup: { ...settings.value.backup, auto } })} />
      </div>
      <button class="btn wide" disabled={busy || cloudBusy.value} onClick={() => run(async () => { await backUpNow(true); showToast('Backed up'); })}><IconUpload /> Back up now</button>
      <MenuButton
        class="btn wide" label="Restore from server" value={[]}
        items={list.length ? list.map((r) => ({ v: r.id, label: `${when(r.at)} · ${size(r.size)}` })) : [{ v: '', label: 'No backups yet', action: true }]}
        onChange={([id]) => restore(id)}
      >
        <IconDownload /> {busy ? 'Working…' : 'Restore from server'}
      </MenuButton>
      <button class="btn wide" onClick={() => confirm('Sign out on this phone? Backups already on the server stay there. Reminders stop.') && run(async () => {
        if (settings.value.push.enabled) { await disablePush().catch(() => {}); await updateSettings({ push: { enabled: false } }); }
        await signOut();
      })}>Sign out</button>
      {shownErr && <div class="small" style={{ color: 'var(--danger)' }}>{shownErr}</div>}
    </Block>
  );
}
