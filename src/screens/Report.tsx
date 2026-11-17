import { useState } from 'preact/hooks';
import { entries, settings, uid, updateSettings } from '../lib/store';
import { DAY, dayKey, fmtDay, fromDayKey, startOfDay } from '../lib/time';
import { fmt1, inRange, summary } from '../lib/analysis';
import { Block, Nav, Toggle, showToast } from '../components/ui';
import { IconCheck, IconDownload, IconReport, IconShare, IconTrash } from '../components/Icons';
import { entriesCsv } from '../export/csv';
import { shareOrDownload } from '../export/files';

type Preset = 'since' | '14' | '30' | '90' | 'custom';

export function Report() {
  const s = settings.value;
  const [preset, setPreset] = useState<Preset>(s.lastAppointment ? 'since' : '30');
  const todayEnd = startOfDay(Date.now()) + DAY;
  const [custom, setCustom] = useState({ from: dayKey(Date.now() - 29 * DAY), to: dayKey(Date.now()) });
  const [opts, setOpts] = useState({ includeLog: true, includeNotes: true, includeAssociations: true });
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<File | null>(null);
  const [newQ, setNewQ] = useState('');

  let from: number;
  let to = todayEnd;
  if (preset === 'since' && s.lastAppointment) from = fromDayKey(s.lastAppointment);
  else if (preset === 'custom') { from = fromDayKey(custom.from); to = fromDayKey(custom.to) + DAY; }
  else from = todayEnd - Number(preset === 'since' ? 30 : preset) * DAY;

  const sum = summary(entries.value, from, to);
  const count = inRange(entries.value, from, to).length;

  async function makePdf() {
    setBusy(true);
    setPdf(null);
    try {
      const { buildReport } = await import('../export/pdf');
      setPdf(await buildReport(entries.value, settings.value, { from, to, ...opts }));
    } catch (e) {
      console.error(e);
      showToast('Couldn’t create the PDF');
    } finally {
      setBusy(false);
    }
  }

  const setQ = (questions: typeof s.questions) => updateSettings({ questions });

  return (
    <div class="screen">
      <Nav title="Report" />

      <Block title="Period to include">
        <div class="when-row">
          {s.lastAppointment && <button class={'chip' + (preset === 'since' ? ' on' : '')} onClick={() => setPreset('since')}>Since last appointment</button>}
          {(['14', '30', '90'] as const).map((p) => <button key={p} class={'chip' + (preset === p ? ' on' : '')} onClick={() => setPreset(p)}>{p} days</button>)}
          <button class={'chip' + (preset === 'custom' ? ' on' : '')} onClick={() => setPreset('custom')}>Custom</button>
        </div>
        {preset === 'custom' && (
          <div class="row">
            <input type="date" class="input" value={custom.from} onChange={(e) => setCustom({ ...custom, from: (e.target as HTMLInputElement).value || custom.from })} />
            <span class="muted">to</span>
            <input type="date" class="input" value={custom.to} onChange={(e) => setCustom({ ...custom, to: (e.target as HTMLInputElement).value || custom.to })} />
          </div>
        )}
        <div class="small muted">
          {fmtDay(from, { day: 'numeric', month: 'short' })} – {fmtDay(to - 1, { day: 'numeric', month: 'short' })}: {count} entries, {sum.readings.length} pain readings, average {fmt1(sum.mean)}/10
        </div>
      </Block>

      <div class="stack">
        {!pdf ? (
          <button class="btn primary wide" disabled={busy || count === 0} onClick={makePdf}>
            <IconReport /> {busy ? 'Preparing…' : 'Create PDF summary'}
          </button>
        ) : (
          <div class="card stack">
            <div class="row"><span style={{ width: 22, height: 22, color: 'var(--accent)' }}><IconCheck /></span><b class="grow">{pdf.name}</b><span class="small muted">{Math.round(pdf.size / 1024)} KB</span></div>
            <div class="row">
              <button class="btn primary grow" onClick={() => shareOrDownload(pdf)}><IconShare /> Share or save</button>
              <button class="btn" onClick={() => window.open(URL.createObjectURL(pdf), '_blank')}>Preview</button>
            </div>
            <button class="link small" onClick={() => setPdf(null)}>Make a different one</button>
          </div>
        )}
        <button class="btn wide" disabled={count === 0} onClick={() => shareOrDownload(entriesCsv(inRange(entries.value, from, to)))}>
          <IconDownload /> Spreadsheet (CSV)
        </button>
      </div>

      <Block title="Questions to ask" aside={s.questions.filter((q) => !q.done).length ? `${s.questions.filter((q) => !q.done).length} open` : 'included in the PDF'}>
        {s.questions.map((q) => (
          <div key={q.id} class="row" style={{ alignItems: 'flex-start' }}>
            <button class={'check' + (q.done ? ' on' : '')} aria-label={q.done ? 'Mark as not asked' : 'Mark as asked'} onClick={() => setQ(s.questions.map((x) => x.id === q.id ? { ...x, done: !x.done } : x))}>
              {q.done && <span style={{ width: 16, height: 16 }}><IconCheck /></span>}
            </button>
            <span class="grow" style={{ textDecoration: q.done ? 'line-through' : 'none', color: q.done ? 'var(--muted)' : 'inherit', paddingTop: 3 }}>{q.text}</span>
            <button class="link" style={{ color: 'var(--muted)', width: 22, height: 22 }} aria-label="Delete question" onClick={() => setQ(s.questions.filter((x) => x.id !== q.id))}><IconTrash /></button>
          </div>
        ))}
        <form class="row" onSubmit={(e) => { e.preventDefault(); if (newQ.trim()) { setQ([...s.questions, { id: uid(), text: newQ.trim(), done: false }]); setNewQ(''); } }}>
          <input class="input grow" placeholder="New question" value={newQ} onInput={(e) => setNewQ((e.target as HTMLInputElement).value)} />
          <button class="btn primary" type="submit" disabled={!newQ.trim()}>Add</button>
        </form>
      </Block>

      <Block title="Include">
        {([
          ['includeAssociations', 'Things that occurred alongside pain'],
          ['includeNotes', 'Notes'],
          ['includeLog', 'Full entry log'],
        ] as const).map(([k, label]) => (
          <div class="row between" key={k}>
            <span>{label}</span>
            <Toggle checked={opts[k]} label={label} onChange={(v) => { setOpts({ ...opts, [k]: v }); setPdf(null); }} />
          </div>
        ))}
      </Block>

      <Block title="Appointments">
        <div class="row" style={{ gap: 10 }}>
          <label class="field grow"><span>Last one</span><input type="date" class="input" value={s.lastAppointment} onChange={(e) => updateSettings({ lastAppointment: (e.target as HTMLInputElement).value })} /></label>
          <label class="field grow"><span>Next one</span><input type="date" class="input" value={s.nextAppointment} onChange={(e) => updateSettings({ nextAppointment: (e.target as HTMLInputElement).value })} /></label>
        </div>
      </Block>


    </div>
  );
}
