import type { Entry } from '../lib/types';
import { POSTURES, HELPED_LABELS, IMPACTS } from '../lib/catalog';
import { regionLabel, SENSATION_LABEL } from '../components/BodyMap';
import { stamp } from './files';
import { areaKinds, entryKindLabels } from '../lib/analysis';

const IMPACT_LEVEL = ['none', 'some', 'a lot'];

/** One row per entry; opens directly in Numbers, Excel or Google Sheets. */
export function entriesCsv(list: Entry[]): File {
  const cols = [
    'Date', 'Time', 'Type', 'Pain (0-10)', 'Pain change', 'Where', 'Feels like', 'Lasts', ...IMPACTS.map((i) => `Affects ${i.label.toLowerCase()}`),
    'Other symptoms', 'Posture', 'Activity', 'Duration (min)', 'Breaks', 'Effort', 'Food tags', 'Photo',
    'Treatment', 'Treatment type', 'Dose', 'Helped?', 'Side effects', 'Sleep (h)', 'Sleep quality', 'Stress (0-10)', 'Unusual exertion', 'Note',
  ];
  const rows = [...list].sort((a, b) => a.time - b.time).map((e) => {
    const d = new Date(e.time);
    const r: Record<string, string | number> = {
      Date: e.type === 'day' ? e.date : d.toLocaleDateString('en-CA'),
      Time: e.type === 'day' ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      Type: { pain: e.type === 'pain' && e.mode === 'change' ? 'Pain change' : 'Check-in', posture: 'Posture', activity: 'Activity', meal: 'Food', treatment: 'Treatment', day: 'Sleep & day' }[e.type],
      Note: e.note ?? '',
    };
    switch (e.type) {
      case 'pain':
        r['Pain (0-10)'] = e.intensity ?? 'not sure';
        r['Pain change'] = e.trend ?? '';
        r['Where'] = Object.keys(e.regions).map((k) => {
          const bits = [areaKinds(e, k).map((x) => SENSATION_LABEL[x]).join('/'), e.levels?.[k] != null ? String(e.levels[k]) : ''].filter(Boolean).join(' ');
          return `${regionLabel(k)}${bits ? ` (${bits})` : ''}`;
        }).join('; ');
        r['Feels like'] = entryKindLabels(e).join('; ');
        r['Lasts'] = e.duration ?? '';
        for (const i of IMPACTS) r[`Affects ${i.label.toLowerCase()}`] = e.impacts[i.id] != null ? IMPACT_LEVEL[e.impacts[i.id]!] : '';
        r['Other symptoms'] = e.symptoms.join('; ');
        r['Posture'] = e.postures.map((p) => POSTURES[p]?.label ?? p).join('; ');
        r['Activity'] = e.activities.join('; ');
        break;
      case 'posture':
        r['Posture'] = POSTURES[e.posture]?.label ?? e.posture;
        r['Duration (min)'] = e.minutes ?? '';
        r['Breaks'] = e.breaks ?? '';
        break;
      case 'activity':
        r['Activity'] = e.activity;
        r['Duration (min)'] = e.minutes ?? '';
        r['Effort'] = e.effort ?? '';
        break;
      case 'meal':
        r['Food tags'] = e.tags.join('; ');
        r['Photo'] = e.photoId ? 'yes' : '';
        break;
      case 'treatment':
        r['Treatment'] = e.name;
        r['Treatment type'] = e.kind;
        r['Dose'] = e.dose ?? '';
        r['Helped?'] = e.helped ? HELPED_LABELS[e.helped] : '';
        r['Side effects'] = e.sideEffects.join('; ');
        break;
      case 'day':
        r['Sleep (h)'] = e.sleepHours ?? '';
        r['Sleep quality'] = e.sleepQuality ?? '';
        r['Stress (0-10)'] = e.stress ?? '';
        r['Unusual exertion'] = e.exertion == null ? '' : e.exertion ? 'yes' : 'no';
        break;
    }
    return cols.map((c) => cell(r[c] ?? ''));
  });
  const text = '﻿' + [cols.map(cell), ...rows].map((r) => r.join(',')).join('\r\n');
  return new File([text], `neck-diary-${stamp()}.csv`, { type: 'text/csv' });
}

function cell(v: string | number) {
  const s = String(v);
  // Guard against spreadsheet formula injection, then quote.
  const safe = /^[=+\-@]/.test(s) && isNaN(Number(s)) ? "'" + s : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
