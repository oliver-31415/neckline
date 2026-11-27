import { useEffect, useState } from 'preact/hooks';
import { settings, updateSettings, wipe, entries, persisted, keepData, rememberPosture } from '../lib/store';
import { ServerBackup } from './ServerBackup';
import { AiSettings } from './AiSettings';
import { go } from '../lib/nav';
import { MAIN_SYMPTOMS, POSTURES } from '../lib/catalog';
import { fmtSlot } from '../lib/time';
import { Block, Nav, Sheet, showToast } from '../components/ui';
import { MenuButton, MenuRow } from '../components/Menu';
import { ActionRow, DateRow, ListEditor, NavRow, ToggleRow, ValueRow } from '../components/rows';
import { IconBack, IconClose } from '../components/Icons';
import { TextRow } from '../forms/LogCards';
import { disablePush, enablePush, pushReady, pushSupported, syncSchedule, testPush } from '../lib/push';
import { makeBackup, restoreBackup } from '../export/backup';
import { shareOrDownload } from '../export/files';
import { isStandalone } from '../lib/env';
import type { Settings as S } from '../lib/types';

type ListKey = 'exercises' | 'symptoms' | 'activities' | 'mealTags' | 'sideEffects';
type Open = null | 'times' | 'postures' | 'meds' | ListKey;

const LISTS: { k: ListKey; label: string; add: string }[] = [
  { k: 'exercises', label: 'Exercises', add: 'New exercise' },
  { k: 'symptoms', label: 'Symptoms', add: 'New symptom' },
  { k: 'activities', label: 'Activities', add: 'New activity' },
  { k: 'mealTags', label: 'Food tags', add: 'New tag' },
  { k: 'sideEffects', label: 'Side effects', add: 'New side effect' },
];

/** Headache and migraine are always offered, so they aren't listed for removal. */
const editable = (k: ListKey, list: string[]) => (k === 'symptoms' ? list.filter((x) => !MAIN_SYMPTOMS.includes(x)) : list);

export function Settings() {
  const s = settings.value;
  const [open, setOpen] = useState<Open>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushErr, setPushErr] = useState('');
  const [usage, setUsage] = useState('');

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB`));
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

  const canPush = pushSupported() && isStandalone() && pushReady();
  const pushSub = !pushSupported() || !isStandalone() ? 'Home Screen app only' : !pushReady() ? 'Sign in to your server first' : undefined;
  const meds = s.treatments;

  return (
    <div class="screen">
      <button class="back-btn" onClick={() => go('checkin')}><IconBack /> Check In</button>
      <Nav title="Settings" />

      <Block title="Check-ins" flush foot={pushErr ? <span style={{ color: 'var(--danger)' }}>{pushErr}</span> : undefined}>
        <NavRow label="Times" value={s.checkinTimes.length ? s.checkinTimes.map(fmtSlot).join(', ') : 'None'} onClick={() => setOpen('times')} />
        <ToggleRow label="Reminders" sub={pushSub} checked={s.push.enabled} disabled={pushBusy || (!canPush && !s.push.enabled)} onChange={togglePush} />
        {s.push.enabled && <ActionRow label="Send a test reminder" onClick={() => testPush().then(() => showToast('Test sent')).catch((e) => setPushErr(e.message))} />}
      </Block>

      <ServerBackup />

      <AiSettings />

      <Block title="Lists" flush>
        <NavRow label="Postures" value={s.postures.length} onClick={() => setOpen('postures')} />
        {LISTS.slice(0, 2).map(({ k, label }) => <NavRow key={k} label={label} value={editable(k, s[k]).length} onClick={() => setOpen(k)} />)}
        <NavRow label="Medications" value={meds.length} onClick={() => setOpen('meds')} />
        {LISTS.slice(2).map(({ k, label }) => <NavRow key={k} label={label} value={s[k].length} onClick={() => setOpen(k)} />)}
      </Block>

      <Block title="Pain and symptom rows" flush>
        <ToggleRow label="Lasted" checked={s.steps.duration} onChange={(v) => updateSettings({ steps: { ...s.steps, duration: v } })} />
        <ToggleRow label="Got in the way of" checked={s.steps.impact} onChange={(v) => updateSettings({ steps: { ...s.steps, impact: v } })} />
        <ToggleRow label="Note" checked={s.steps.note} onChange={(v) => updateSettings({ steps: { ...s.steps, note: v } })} />
      </Block>

      <Block title="Appearance" flush>
        <MenuRow
          label="Theme" display={{ system: 'Automatic', light: 'Light', dark: 'Dark' }[s.theme]}
          items={[{ v: 'system', label: 'Automatic' }, { v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }]}
          value={[s.theme]} onChange={([theme]) => updateSettings({ theme: theme as S['theme'] })}
        />
      </Block>

      <Block title="Report" flush>
        <TextRow label="Name" placeholder="Optional" value={s.name} onInput={(name) => updateSettings({ name })} />
        <DateRow label="Surgery date" value={s.surgeryDate} onChange={(surgeryDate) => updateSettings({ surgeryDate })} />
      </Block>

      <Block title="This phone" aside={usage} flush>
        <ValueRow label="Storage">
          {persisted.value
            ? <span class="set-value good">Protected</span>
            : <button class="btn sm" onClick={async () => !(await keepData()) && showToast(isStandalone() ? 'iOS didn’t allow it yet' : 'Open from the Home Screen icon')}>Protect</button>}
        </ValueRow>
        <MenuButton
          class="set-row tap action" label="Save a backup file" value={[]}
          items={[{ v: 'photos', label: 'With meal photos' }, { v: 'plain', label: 'Without photos' }]}
          onChange={async ([v]) => shareOrDownload(await makeBackup(v === 'photos'))}
        >
          <span>Save a backup file…</span>
        </MenuButton>
        <label class="set-row tap action">
          <span>Restore from a file…</span>
          <input type="file" accept="application/json,.json" class="file-cover" onChange={async (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (!f) return;
            try {
              const n = await restoreBackup(f, confirm('Also restore settings from the backup? (Cancel keeps your current settings.)'));
              showToast(`Restored ${n} entries`);
            } catch (err) { alert((err as Error).message); }
            (e.target as HTMLInputElement).value = '';
          }} />
        </label>
        <ActionRow label="Delete everything" danger onClick={async () => {
          if (confirm('Delete every entry, photo and setting from this phone? This can’t be undone.') && confirm('Are you sure? Consider saving a backup first.')) {
            await wipe();
            showToast('All data deleted');
          }
        }} />
      </Block>

      {open === 'times' && <TimesSheet times={s.checkinTimes} onChange={setTimes} onClose={() => setOpen(null)} />}
      {open === 'postures' && (() => {
        const custom = s.postures.filter((x) => !(x in POSTURES));
        return (
          <Sheet title="Postures" onClose={() => setOpen(null)} tall>
            <section class="section">
              <div class="sec-head"><span>Your own</span></div>
              <ListEditor
                items={custom} addLabel="New posture"
                onRemove={(v) => updateSettings({ postures: settings.value.postures.filter((x) => x !== v) })}
                onAdd={(v) => { rememberPosture(v); }}
              />
            </section>
            <section class="section">
              <div class="sec-head"><span>Built-in</span></div>
              <div class="group">
                {Object.entries(POSTURES).map(([k, p]) => (
                  <ToggleRow key={k} label={p.label} checked={s.postures.includes(k)} onChange={(v) => updateSettings({ postures: [...Object.keys(POSTURES).filter((x) => (x === k ? v : s.postures.includes(x))), ...custom] })} />
                ))}
              </div>
            </section>
          </Sheet>
        );
      })()}
      {open === 'meds' && (
        <Sheet title="Medications" onClose={() => setOpen(null)}>
          {meds.length
            ? <ListEditor items={meds.map((t) => t.name)} label={(n) => { const t = meds.find((x) => x.name === n); return t?.dose ? `${n} · ${t.dose}` : n; }} onRemove={(n) => updateSettings({ treatments: s.treatments.filter((t) => t.name !== n) })} />
            : <div class="group"><ValueRow label="None yet" /></div>}
        </Sheet>
      )}
      {LISTS.map(({ k, label, add }) => open === k && (
        <Sheet key={k} title={label} onClose={() => setOpen(null)}>
          <ListEditor
            items={editable(k, s[k])} addLabel={add}
            onRemove={(v) => updateSettings({ [k]: settings.value[k].filter((x) => x !== v) } as Partial<S>)}
            onAdd={(v) => !settings.value[k].includes(v) && updateSettings({ [k]: [...settings.value[k], v] } as Partial<S>)}
          />
        </Sheet>
      ))}
    </div>
  );
}

function TimesSheet({ times, onChange, onClose }: { times: string[]; onChange: (t: string[]) => void; onClose: () => void }) {
  const [next, setNext] = useState('12:00');
  return (
    <Sheet title="Check-in times" onClose={onClose}>
      <div class="group">
        {times.map((t) => (
          <div class="set-row" key={t}>
            <span class="set-text"><span>{fmtSlot(t)}</span></span>
            <button type="button" class="x-btn" aria-label={`Remove ${fmtSlot(t)}`} onClick={() => onChange(times.filter((x) => x !== t))}><IconClose /></button>
          </div>
        ))}
        <div class="set-row">
          <input type="time" class="trow-input left" aria-label="New time" value={next} onChange={(e) => setNext((e.target as HTMLInputElement).value)} />
          <button type="button" class="btn sm" disabled={!next || times.includes(next)} onClick={() => onChange([...times, next])}>Add</button>
        </div>
      </div>
    </Sheet>
  );
}
