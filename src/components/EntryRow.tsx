import { useEffect, useState } from 'preact/hooks';
import type { Entry } from '../lib/types';
import { HELPED_LABELS, POSTURES, painWord } from '../lib/catalog';
import { fmtMinutes, fmtTime } from '../lib/time';
import { editEntry } from '../lib/nav';
import { getPhoto } from '../lib/db';
import { regionNames } from './BodyMap';
import { entryKindLabels } from '../lib/analysis';
import { PainPill } from './ui';
import { IconActivity, IconMeal, IconMoon, IconPill, IconPosture } from './Icons';

export const TYPE_STYLE: Record<string, { color: string; Icon: () => preact.JSX.Element; label: string }> = {
  posture: { color: 'var(--posture)', Icon: IconPosture, label: 'Posture' },
  activity: { color: 'var(--activity)', Icon: IconActivity, label: 'Activity' },
  meal: { color: 'var(--meal)', Icon: IconMeal, label: 'Food' },
  treatment: { color: 'var(--treatment)', Icon: IconPill, label: 'Treatment' },
  day: { color: 'var(--ink-2)', Icon: IconMoon, label: 'Sleep & day' },
};

export function entrySummary(e: Entry): { title: string; detail: string } {
  switch (e.type) {
    case 'pain': {
      const parts: string[] = [];
      const regions = regionNames(Object.keys(e.regions));
      if (regions.length) parts.push(regions.length <= 2 ? regions.join(', ') : `${regions[0]} +${regions.length - 1} more`);
      const kinds = entryKindLabels(e);
      if (kinds.length) parts.push(kinds.join(', ').toLowerCase());
      if (e.symptoms.length) parts.push(e.symptoms.join(', ').toLowerCase());
      if (e.postures.length) parts.push(e.postures.map((p) => POSTURES[p]?.label ?? p).join(', ').toLowerCase());
      if (e.activities.length) parts.push(e.activities.join(', ').toLowerCase());
      if (e.note) parts.push(`“${e.note}”`);
      const trend = e.trend === 'worse' ? 'Got worse' : e.trend === 'better' ? 'Eased' : e.trend === 'new' ? 'New spot' : e.trend === 'same' ? 'About the same' : 'Pain change';
      return { title: e.mode === 'change' ? trend : `Check-in · ${painWord(e.intensity)}`, detail: parts.join(' · ') };
    }
    case 'posture':
      return { title: POSTURES[e.posture]?.label ?? e.posture, detail: [fmtMinutes(e.minutes), e.breaks ? `breaks: ${e.breaks === 'some' ? 'a few' : e.breaks}` : '', e.note].filter(Boolean).join(' · ') };
    case 'activity':
      return { title: e.activity, detail: [fmtMinutes(e.minutes), e.effort, e.note].filter(Boolean).join(' · ') };
    case 'meal':
      return { title: e.tags.length ? e.tags.join(', ') : 'Food & drink', detail: e.note ?? '' };
    case 'treatment':
      return { title: `${e.name}${e.dose ? ' · ' + e.dose : ''}`, detail: [e.helped ? HELPED_LABELS[e.helped] : '', e.sideEffects.length ? 'side effects: ' + e.sideEffects.join(', ').toLowerCase() : ''].filter(Boolean).join(' · ') };
    case 'day':
      return {
        title: 'Sleep & day',
        detail: [e.sleepHours != null ? `${e.sleepHours} h sleep` : '', e.sleepQuality ? `${e.sleepQuality} sleep` : '', e.stress != null ? `stress ${e.stress >= 7 ? 'high' : e.stress >= 4 ? 'medium' : 'low'}` : '', e.exertion ? 'unusual exertion' : ''].filter(Boolean).join(' · '),
      };
  }
}

function Thumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    getPhoto(id).then((b) => { if (b) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url ? <img class="thumb" src={url} alt="" /> : null;
}

export function EntryRow({ e, showDate }: { e: Entry; showDate?: boolean }) {
  const { title, detail } = entrySummary(e);
  const st = TYPE_STYLE[e.type];
  return (
    <button class="entry" onClick={() => editEntry(e)}>
      {e.type === 'pain' ? (
        <span class="entry-icon" style={{ background: 'transparent' }}><PainPill n={e.intensity} /></span>
      ) : (
        <span class="entry-icon" style={{ background: `color-mix(in srgb, ${st.color} 15%, transparent)`, color: st.color }}><st.Icon /></span>
      )}
      <span class="entry-main">
        <span class="entry-title">{title}</span>
        {detail && <span class="entry-detail">{detail}</span>}
      </span>
      {e.type === 'meal' && e.photoId && <Thumb id={e.photoId} />}
      <span class="entry-time">{e.type === 'day' ? '' : showDate ? new Date(e.time).toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + fmtTime(e.time) : fmtTime(e.time)}</span>
    </button>
  );
}
