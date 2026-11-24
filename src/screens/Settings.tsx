import { useEffect, useState } from 'preact/hooks';
import { settings, updateSettings, wipe, entries, persisted, keepData } from '../lib/store';
import { ServerBackup } from './ServerBackup';
import { go } from '../lib/nav';
import { POSTURES, STEPS } from '../lib/catalog';
import { fmtSlot } from '../lib/time';
import { Block, Chips, Nav, Seg, Toggle, showToast } from '../components/ui';
import { IconBack, IconBell, IconDownload, IconLock, IconTrash, IconUpload } from '../components/Icons';
import { disablePush, enablePush, pushReady, pushSupported, syncSchedule, testPush } from '../lib/push';
import { makeBackup, restoreBackup } from '../export/backup';
import { shareOrDownload } from '../export/files';
import { isStandalone } from '../lib/env';
import type { Settings as S } from '../lib/types';

type ListKey = 'qualities' | 'symptoms' | 'activities' | 'exercises' | 'mealTags' | 'sideEffects';

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
    if (s.push.enabled) syncSchedule(settings.value.checkinTimes).catch((e) => setPushErr(String(e.message ?? e)));
  }

  async function togglePush(on: boolean) {
    setPushErr('');
    setPushBusy(true);
    try {
      if (on) {
        if (!pushReady()) throw new Error('Sign in to your Neckline server below first.');
        await enablePush(s.checkinTimes);
        showToast('Reminders on');
      } else {
        await disablePush();
      }
      await updateSettings({ push: { enabled: on } });
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

      <Block title="About you">
        <label class="field"><span>Name</span><input class="input" value={s.name} onChange={(e) => updateSettings({ name: (e.target as HTMLInputElement).value })} /></label>
        <label class="field"><span>Surgery date</span><input type="date" class="input" value={s.surgeryDate} onChange={(e) => updateSettings({ surgeryDate: (e.target as HTMLInputElement).value })} /></label>
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
      </Block>

      <Block title="Reminders">
        <div class="row">
          <span style={{ width: 22, height: 22, color: 'var(--accent)' }}><IconBell /></span>
          <div class="grow">
            <div style={{ fontWeight: 600 }}>Notify me at check-in times</div>
            <div class="small muted">{!pushSupported() || !isStandalone() ? 'Home Screen app only' : !pushReady() ? 'Sign in to your server below' : s.push.enabled ? 'On' : 'Off'}</div>
          </div>
          <Toggle checked={s.push.enabled} label="Reminders" onChange={(v) => !pushBusy && togglePush(v)} />
        </div>
        {s.push.enabled && <button class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => testPush().then(() => showToast('Test sent')).catch((e) => setPushErr(e.message))}>Send a test reminder</button>}
        {pushErr && <div class="small" style={{ color: 'var(--danger)' }}>{pushErr}</div>}
      </Block>

      <ServerBackup />

      <Block title="Check-in questions">
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
        ['exercises', 'Exercises'],
        ['mealTags', 'Food tags'],
        ['sideEffects', 'Side effects'],
      ] as [ListKey, string][]).map(([k, label]) => (
        <Block key={k} title={label}>
          <div class="chips">
            {s[k].map((v) => <button key={v} class="chip" onClick={() => removeFrom(k, v)}>{v} <span class="muted">×</span></button>)}
            <AddChip onAdd={(v) => addTo(k, v)} />
          </div>
        </Block>
      ))}

      {s.treatments.length > 0 && (
        <Block title="Saved treatments">
          <div class="chips">
            {s.treatments.map((t) => <button key={t.name} class="chip" onClick={() => updateSettings({ treatments: s.treatments.filter((x) => x !== t) })}>{t.name}{t.dose ? ` · ${t.dose}` : ''} <span class="muted">×</span></button>)}
          </div>
        </Block>
      )}

      <Block title="Appearance">
        <Seg options={[{ v: 'system', label: 'Automatic' }, { v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }]} value={s.theme} onChange={(theme) => updateSettings({ theme: theme ?? 'system' })} />
      </Block>

      <Block title="Your data" aside={usage}>
        <div class="row between">
          <span>Kept on this phone</span>
          {persisted.value
            ? <span style={{ color: 'var(--good)', fontWeight: 600 }}>Protected</span>
            : <button class="btn sm" onClick={async () => !(await keepData()) && showToast(isStandalone() ? 'iOS didn’t allow it yet' : 'Open from the Home Screen icon')}>Protect</button>}
        </div>
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
