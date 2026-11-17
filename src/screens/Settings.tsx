import { useEffect, useState } from 'preact/hooks';
import { settings, updateSettings, wipe, entries } from '../lib/store';
import { go } from '../lib/nav';
import { POSTURES, STEPS } from '../lib/catalog';
import { fmtSlot } from '../lib/time';
import { Block, Chips, Nav, Seg, Toggle, showToast } from '../components/ui';
import { BodyMap } from '../components/BodyMap';
import { IconBack, IconBell, IconDownload, IconLock, IconTrash, IconUpload } from '../components/Icons';
import { disablePush, enablePush, pushSupported, syncSchedule, testPush } from '../lib/push';
import { makeBackup, restoreBackup } from '../export/backup';
import { shareOrDownload } from '../export/files';
import { isStandalone } from '../lib/env';
import type { Settings as S } from '../lib/types';

type ListKey = 'qualities' | 'symptoms' | 'activities' | 'mealTags' | 'sideEffects';

export function Settings() {
  const s = settings.value;
  const [newTime, setNewTime] = useState('12:00');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushErr, setPushErr] = useState('');
  const [withPhotos, setWithPhotos] = useState(true);
  const [usage, setUsage] = useState('');

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB used on this phone`));
  }, [entries.value.length]);

  async function setTimes(checkinTimes: string[]) {
    await updateSettings({ checkinTimes: [...new Set(checkinTimes)].sort() });
    if (s.push.enabled) syncSchedule(s.push.serverUrl, s.push.token, settings.value.checkinTimes).catch((e) => setPushErr(String(e.message ?? e)));
  }

  async function togglePush(on: boolean) {
    setPushErr('');
    setPushBusy(true);
    try {
      if (on) {
        if (!s.push.serverUrl) throw new Error('Add your reminder server address first.');
        await enablePush(s.push.serverUrl, s.push.token, s.checkinTimes);
        showToast('Reminders on');
      } else {
        await disablePush(s.push.serverUrl, s.push.token);
      }
      await updateSettings({ push: { ...s.push, enabled: on } });
    } catch (e) {
      setPushErr((e as Error).message);
    } finally {
      setPushBusy(false);
    }
  }

  const removeFrom = (k: ListKey, v: string) => updateSettings({ [k]: s[k].filter((x) => x !== v) } as Partial<S>);
  const addTo = (k: ListKey, v: string) => !s[k].includes(v) && updateSettings({ [k]: [...s[k], v] } as Partial<S>);

  return (
    <div class="screen">
      <button class="back-btn" onClick={() => go('checkin')}><IconBack /> Check In</button>
      <Nav title="Settings" />

      <div class="notice">
        <IconLock />
        <div>Everything you log is stored only on this phone. Neckline has no account and no analytics, and it never uploads your diary. Files leave only when you share an export.</div>
      </div>

      <Block title="About you" aside="used on the PDF">
        <label class="field"><span>Name (optional)</span><input class="input" value={s.name} onChange={(e) => updateSettings({ name: (e.target as HTMLInputElement).value })} /></label>
        <label class="field"><span>Surgery date (optional)</span><input type="date" class="input" value={s.surgeryDate} onChange={(e) => updateSettings({ surgeryDate: (e.target as HTMLInputElement).value })} /></label>
      </Block>

      <Block title="Incision site" aside={s.incision ? 'tap to move' : 'tap the map to place'}>
        <BodyMap incision={s.incision} onPlaceIncision={(p) => updateSettings({ incision: { ...p, orient: s.incision?.orient ?? (p.view === 'front' ? 'h' : 'v') } })} maxWidth={220} />
        <div class="row">
          <span class="grow small muted">Direction of the scar</span>
          <div style={{ width: 200 }}>
            <Seg options={[{ v: 'h', label: 'Across' }, { v: 'v', label: 'Up & down' }]} value={s.incision?.orient ?? null} onChange={(orient) => s.incision && orient && updateSettings({ incision: { ...s.incision, orient } })} />
          </div>
        </div>
        {s.incision && <button class="link small" style={{ alignSelf: 'flex-start' }} onClick={() => updateSettings({ incision: null })}>Remove incision marker</button>}
      </Block>

      <Block title="Check-in times">
        <div class="chips">
          {s.checkinTimes.map((t) => (
            <button key={t} class="chip" onClick={() => setTimes(s.checkinTimes.filter((x) => x !== t))}>{fmtSlot(t)} <span class="muted">×</span></button>
          ))}
        </div>
        <div class="row">
          <input type="time" class="input" style={{ width: 140 }} value={newTime} onChange={(e) => setNewTime((e.target as HTMLInputElement).value)} />
          <button class="btn" onClick={() => newTime && setTimes([...s.checkinTimes, newTime])}>Add time</button>
        </div>
        <p class="small muted">Missed check-ins are simply skipped. Nothing builds up and there are no streaks.</p>
      </Block>

      <Block title="Reminders" aside="optional">
        <div class="row">
          <span style={{ width: 22, height: 22, color: 'var(--accent)' }}><IconBell /></span>
          <div class="grow">
            <div style={{ fontWeight: 600 }}>Notify me at check-in times</div>
            <div class="small muted">{!pushSupported() || !isStandalone() ? 'Open Neckline from your Home Screen to use this (iOS 16.4+)' : s.push.enabled ? 'On' : 'Off'}</div>
          </div>
          <Toggle checked={s.push.enabled} label="Reminders" onChange={(v) => !pushBusy && togglePush(v)} />
        </div>
        <label class="field"><span>Reminder server address</span>
          <input class="input" type="url" inputMode="url" autocapitalize="off" autocorrect="off" spellcheck={false} placeholder="https://reminders.example.com" value={s.push.serverUrl} onChange={(e) => updateSettings({ push: { ...s.push, serverUrl: (e.target as HTMLInputElement).value.trim() } })} />
        </label>
        <label class="field"><span>Access token (if your server uses one)</span>
          <input class="input" type="password" autocapitalize="off" value={s.push.token} onChange={(e) => updateSettings({ push: { ...s.push, token: (e.target as HTMLInputElement).value.trim() } })} />
        </label>
        {s.push.enabled && <button class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => testPush(s.push.serverUrl, s.push.token).then(() => showToast('Test sent')).catch((e) => setPushErr(e.message))}>Send a test reminder</button>}
        {pushErr && <div class="small" style={{ color: 'var(--danger)' }}>{pushErr}</div>}
        <p class="small muted">The server only knows when to nudge you. It never sees your diary. Setup instructions are in <code>push-server/README.md</code>.</p>
      </Block>

      <Block title="Check-in questions" aside="hide what you don’t need">
        {STEPS.map((st) => (
          <div class="row between" key={st.id}>
            <div><div style={{ fontWeight: 600 }}>{st.label}</div>{st.hint && <div class="small muted">{st.hint}</div>}</div>
            <Toggle checked={s.steps[st.id]} label={st.label} onChange={(v) => updateSettings({ steps: { ...s.steps, [st.id]: v } })} />
          </div>
        ))}
      </Block>

      <Block title="Postures to show">
        <Chips options={Object.keys(POSTURES)} labels={Object.fromEntries(Object.entries(POSTURES).map(([k, v]) => [k, v.label]))} value={s.postures} onChange={(postures) => updateSettings({ postures: Object.keys(POSTURES).filter((k) => postures.includes(k)) })} />
      </Block>

      {([
        ['qualities', 'Pain descriptions'],
        ['symptoms', 'Other symptoms'],
        ['activities', 'Activities'],
        ['mealTags', 'Food tags'],
        ['sideEffects', 'Side effects'],
      ] as [ListKey, string][]).map(([k, label]) => (
        <Block key={k} title={label} aside="tap to remove">
          <div class="chips">
            {s[k].map((v) => <button key={v} class="chip" onClick={() => removeFrom(k, v)}>{v} <span class="muted">×</span></button>)}
            <AddChip onAdd={(v) => addTo(k, v)} />
          </div>
        </Block>
      ))}

      {s.treatments.length > 0 && (
        <Block title="Saved treatments" aside="tap to remove">
          <div class="chips">
            {s.treatments.map((t) => <button key={t.name} class="chip" onClick={() => updateSettings({ treatments: s.treatments.filter((x) => x !== t) })}>{t.name}{t.dose ? ` · ${t.dose}` : ''} <span class="muted">×</span></button>)}
          </div>
        </Block>
      )}

      <Block title="Appearance">
        <Seg options={[{ v: 'system', label: 'Automatic' }, { v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }]} value={s.theme} onChange={(theme) => updateSettings({ theme: theme ?? 'system' })} />
      </Block>

      <Block title="Your data" aside={usage}>
        <p class="small muted">Back up now and then. If you delete the app from your Home Screen, its data goes too.</p>
        <div class="row between"><span>Include meal photos</span><Toggle checked={withPhotos} label="Include meal photos" onChange={setWithPhotos} /></div>
        <button class="btn wide" onClick={async () => shareOrDownload(await makeBackup(withPhotos))}><IconDownload /> Save a backup file</button>
        <label class="btn wide" style={{ position: 'relative' }}>
          <IconUpload /> Restore from a backup
          <input type="file" accept="application/json,.json" style={{ position: 'absolute', inset: 0, opacity: 0 }} onChange={async (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (!f) return;
            try {
              const n = await restoreBackup(f, confirm('Also restore settings from the backup? (Cancel keeps your current settings.)'));
              showToast(`Restored ${n} entries`);
            } catch (err) { alert((err as Error).message); }
            (e.target as HTMLInputElement).value = '';
          }} />
        </label>
        <button class="btn danger wide" onClick={async () => {
          if (confirm('Delete every entry, photo and setting from this phone? This can’t be undone.') && confirm('Are you sure? Consider saving a backup first.')) {
            await wipe();
            showToast('All data deleted');
          }
        }}><IconTrash /> Delete everything</button>
      </Block>

      <p class="small muted center">Neckline is a diary to help conversations with your clinician. It doesn’t diagnose or give medical advice. If you have new weakness, numbness, trouble walking, swallowing or breathing, or signs of infection, contact your care team or emergency services.</p>
    </div>
  );
}

function AddChip({ onAdd }: { onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) return <button class="chip add" onClick={() => setOpen(true)}>+ Add</button>;
  const done = () => { if (v.trim()) onAdd(v.trim()); setV(''); setOpen(false); };
  return <input class="input" autoFocus style={{ width: 160, minHeight: 40, padding: '7px 12px', borderRadius: 999 }} value={v} onInput={(e) => setV((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && done()} onBlur={done} />;
}
